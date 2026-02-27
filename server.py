import json
import sqlite3
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8080
DB_PATH = Path(__file__).with_name("chat_history.sqlite3")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def to_int(value, default=0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r["name"] == column for r in rows)


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    if not column_exists(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              exported_at TEXT NOT NULL,
              created_at TEXT NOT NULL,
              theme TEXT NOT NULL,
              interaction_mode TEXT NOT NULL,
              initial_turns INTEGER NOT NULL,
              max_extensions INTEGER NOT NULL,
              total_turns INTEGER NOT NULL,
              extensions_used INTEGER NOT NULL,
              last_outcome TEXT,
              review_enabled INTEGER NOT NULL,
              final_review TEXT,
              left_name TEXT NOT NULL,
              left_model TEXT NOT NULL,
              left_agent_prompt TEXT,
              right_name TEXT NOT NULL,
              right_model TEXT NOT NULL,
              right_agent_prompt TEXT,
              review_name TEXT,
              review_model TEXT,
              review_agent_prompt TEXT,
              completed INTEGER NOT NULL DEFAULT 0,
              finished_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id INTEGER NOT NULL,
              turn_index INTEGER NOT NULL,
              message_type TEXT NOT NULL DEFAULT 'agent',
              author TEXT NOT NULL,
              raw_text TEXT,
              thinking_text TEXT,
              answer_text TEXT,
              text TEXT,
              FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
            )
            """
        )

        ensure_column(conn, "runs", "completed", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "runs", "finished_at", "TEXT")
        ensure_column(conn, "messages", "message_type", "TEXT NOT NULL DEFAULT 'agent'")
        ensure_column(conn, "messages", "raw_text", "TEXT")
        ensure_column(conn, "messages", "thinking_text", "TEXT")
        ensure_column(conn, "messages", "answer_text", "TEXT")
        ensure_column(conn, "messages", "text", "TEXT")


def run_summary_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "createdAt": row["created_at"],
        "exportedAt": row["exported_at"],
        "theme": row["theme"],
        "interactionMode": row["interaction_mode"],
        "totalTurns": row["total_turns"],
        "completed": bool(row["completed"]),
    }


def full_run_from_db(conn: sqlite3.Connection, run_id: int) -> Optional[dict]:
    run = conn.execute(
        """
        SELECT id, exported_at, created_at, theme, interaction_mode,
               initial_turns, max_extensions, total_turns, extensions_used,
               last_outcome, review_enabled, final_review,
               left_name, left_model, left_agent_prompt,
               right_name, right_model, right_agent_prompt,
               review_name, review_model, review_agent_prompt,
               completed, finished_at
        FROM runs
        WHERE id = ?
        """,
        (run_id,),
    ).fetchone()

    if run is None:
        return None

    transcript_rows = conn.execute(
        """
        SELECT turn_index, message_type, author,
               COALESCE(raw_text, answer_text, text, '') AS raw_text,
               COALESCE(thinking_text, '') AS thinking_text,
               COALESCE(answer_text, text, '') AS answer_text
        FROM messages
        WHERE run_id = ?
        ORDER BY turn_index ASC, id ASC
        """,
        (run_id,),
    ).fetchall()

    transcript = [
        {
            "turnIndex": row["turn_index"],
            "messageType": row["message_type"],
            "author": row["author"],
            "rawText": row["raw_text"],
            "thinkingText": row["thinking_text"],
            "text": row["answer_text"],
        }
        for row in transcript_rows
    ]

    return {
        "id": run["id"],
        "exportedAt": run["exported_at"],
        "createdAt": run["created_at"],
        "theme": run["theme"],
        "interactionMode": run["interaction_mode"],
        "initialTurns": run["initial_turns"],
        "maxExtensions": run["max_extensions"],
        "totalTurns": run["total_turns"],
        "extensionsUsed": run["extensions_used"],
        "lastOutcome": run["last_outcome"],
        "reviewEnabled": bool(run["review_enabled"]),
        "finalReview": run["final_review"] or "",
        "completed": bool(run["completed"]),
        "finishedAt": run["finished_at"],
        "leftAgent": {
            "name": run["left_name"],
            "modelId": run["left_model"],
            "agentPrompt": run["left_agent_prompt"] or "",
        },
        "rightAgent": {
            "name": run["right_name"],
            "modelId": run["right_model"],
            "agentPrompt": run["right_agent_prompt"] or "",
        },
        "reviewAgent": {
            "name": run["review_name"] or "Reviewer",
            "modelId": run["review_model"] or "",
            "agentPrompt": run["review_agent_prompt"] or "",
        },
        "transcript": transcript,
    }


def insert_run(conn: sqlite3.Connection, payload: dict) -> int:
    left = payload.get("leftAgent") or {}
    right = payload.get("rightAgent") or {}
    review = payload.get("reviewAgent") or {}

    exported_at = str(payload.get("exportedAt") or "").strip() or utc_now_iso()
    created_at = utc_now_iso()

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO runs (
          exported_at, created_at, theme, interaction_mode,
          initial_turns, max_extensions, total_turns, extensions_used,
          last_outcome, review_enabled, final_review,
          left_name, left_model, left_agent_prompt,
          right_name, right_model, right_agent_prompt,
          review_name, review_model, review_agent_prompt,
          completed, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            exported_at,
            created_at,
            str(payload.get("theme") or ""),
            str(payload.get("interactionMode") or "open"),
            to_int(payload.get("initialTurns"), 0),
            to_int(payload.get("maxExtensions"), 0),
            to_int(payload.get("totalTurns"), 0),
            to_int(payload.get("extensionsUsed"), 0),
            str(payload.get("lastOutcome") or ""),
            1 if bool(payload.get("reviewEnabled")) else 0,
            str(payload.get("finalReview") or ""),
            str(left.get("name") or "Analyst Left"),
            str(left.get("modelId") or ""),
            str(left.get("agentPrompt") or ""),
            str(right.get("name") or "Analyst Right"),
            str(right.get("modelId") or ""),
            str(right.get("agentPrompt") or ""),
            str(review.get("name") or "Reviewer"),
            str(review.get("modelId") or ""),
            str(review.get("agentPrompt") or ""),
            1 if bool(payload.get("completed")) else 0,
            str(payload.get("finishedAt") or "") or None,
        ),
    )
    return int(cur.lastrowid)


def insert_message(conn: sqlite3.Connection, run_id: int, payload: dict) -> None:
    turn_index = to_int(payload.get("turnIndex"), 0)
    message_type = str(payload.get("messageType") or "agent")
    author = str(payload.get("author") or "Agent")
    raw_text = str(payload.get("rawText") or "")
    thinking_text = str(payload.get("thinkingText") or "")
    answer_text = str(payload.get("answerText") or "")

    conn.execute(
        """
        INSERT INTO messages (run_id, turn_index, message_type, author, raw_text, thinking_text, answer_text, text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (run_id, turn_index, message_type, author, raw_text, thinking_text, answer_text, answer_text),
    )

    if message_type == "agent" and turn_index > 0:
        conn.execute(
            "UPDATE runs SET total_turns = CASE WHEN total_turns < ? THEN ? ELSE total_turns END WHERE id = ?",
            (turn_index, turn_index, run_id),
        )


def update_run(conn: sqlite3.Connection, run_id: int, payload: dict) -> None:
    exported_at = str(payload.get("exportedAt") or "").strip()
    completed = bool(payload.get("completed"))
    finished_at = str(payload.get("finishedAt") or "").strip()

    conn.execute(
        """
        UPDATE runs
        SET exported_at = COALESCE(NULLIF(?, ''), exported_at),
            total_turns = COALESCE(?, total_turns),
            extensions_used = COALESCE(?, extensions_used),
            last_outcome = COALESCE(?, last_outcome),
            final_review = COALESCE(?, final_review),
            completed = CASE WHEN ? THEN 1 ELSE completed END,
            finished_at = CASE
                WHEN ? <> '' THEN ?
                WHEN ? THEN ?
                ELSE finished_at
            END
        WHERE id = ?
        """,
        (
            exported_at,
            payload.get("totalTurns"),
            payload.get("extensionsUsed"),
            payload.get("lastOutcome"),
            payload.get("finalReview"),
            completed,
            finished_at,
            finished_at,
            completed,
            utc_now_iso(),
            run_id,
        ),
    )


class AppHandler(SimpleHTTPRequestHandler):
    def _send_json(self, payload: dict, status: int = 200) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        body = self.rfile.read(length)
        return json.loads(body.decode("utf-8"))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/runs":
            with get_connection() as conn:
                rows = conn.execute(
                    """
                    SELECT id, created_at, exported_at, theme, interaction_mode, total_turns, completed
                    FROM runs
                    ORDER BY id DESC
                    LIMIT 200
                    """
                ).fetchall()
            self._send_json({"runs": [run_summary_row_to_dict(r) for r in rows]})
            return

        if parsed.path.startswith("/api/runs/"):
            raw = parsed.path.split("/")[-1]
            if not raw.isdigit():
                self._send_json({"error": "Invalid run id"}, status=400)
                return

            with get_connection() as conn:
                run = full_run_from_db(conn, int(raw))

            if run is None:
                self._send_json({"error": "Run not found"}, status=404)
                return

            self._send_json({"run": run})
            return

        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        try:
            payload = self._read_json_body()
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON body"}, status=400)
            return

        if parsed.path == "/api/runs/start":
            theme = str(payload.get("theme") or "").strip()
            if not theme:
                self._send_json({"error": "Theme is required"}, status=400)
                return

            with get_connection() as conn:
                run_id = insert_run(conn, payload)
                conn.commit()
            self._send_json({"id": run_id}, status=201)
            return

        if parsed.path == "/api/runs":
            transcript = payload.get("transcript") or []
            theme = str(payload.get("theme") or "").strip()
            if not theme:
                self._send_json({"error": "Theme is required"}, status=400)
                return

            with get_connection() as conn:
                run_id = insert_run(conn, payload)
                for idx, msg in enumerate(transcript, start=1):
                    insert_message(
                        conn,
                        run_id,
                        {
                            "turnIndex": msg.get("turnIndex", idx),
                            "messageType": msg.get("messageType", "agent"),
                            "author": msg.get("author"),
                            "rawText": msg.get("rawText") or msg.get("text"),
                            "thinkingText": msg.get("thinkingText") or "",
                            "answerText": msg.get("text") or "",
                        },
                    )
                conn.commit()
            self._send_json({"id": run_id}, status=201)
            return

        if parsed.path.startswith("/api/runs/") and parsed.path.endswith("/messages"):
            parts = parsed.path.strip("/").split("/")
            if len(parts) != 4 or parts[0] != "api" or parts[1] != "runs" or parts[3] != "messages":
                self._send_json({"error": "Not found"}, status=404)
                return

            if not parts[2].isdigit():
                self._send_json({"error": "Invalid run id"}, status=400)
                return

            run_id = int(parts[2])
            with get_connection() as conn:
                exists = conn.execute("SELECT 1 FROM runs WHERE id = ?", (run_id,)).fetchone()
                if exists is None:
                    self._send_json({"error": "Run not found"}, status=404)
                    return

                insert_message(conn, run_id, payload)
                conn.commit()
            self._send_json({"ok": True}, status=201)
            return

        self._send_json({"error": "Not found"}, status=404)

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/runs/"):
            self._send_json({"error": "Not found"}, status=404)
            return

        raw = parsed.path.split("/")[-1]
        if not raw.isdigit():
            self._send_json({"error": "Invalid run id"}, status=400)
            return

        try:
            payload = self._read_json_body()
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON body"}, status=400)
            return

        run_id = int(raw)
        with get_connection() as conn:
            exists = conn.execute("SELECT 1 FROM runs WHERE id = ?", (run_id,)).fetchone()
            if exists is None:
                self._send_json({"error": "Run not found"}, status=404)
                return

            update_run(conn, run_id, payload)
            conn.commit()

        self._send_json({"ok": True})


def main() -> None:
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"Serving http://{HOST}:{PORT}")
    print(f"SQLite database: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
