# Ollama Debate Room

Ollama Debate Room is a local-first web app where two Ollama models discuss a topic turn-by-turn, and an optional Review Agent can synthesize the discussion at the end.

Everything runs locally against your Ollama server, and chats can now be persisted into a local SQLite database file.

## Highlights

- Fully local: uses your Ollama instance only.
- Two-agent discussion with alternating turns.
- Optional Review Agent (disabled by default).
- Live token streaming in the chat UI.
- Interaction modes:
  - `Open`
  - `Debate`
  - `Collaboration`
- Per-agent prompts (`Agent Prompt`) for instruction/persona control.
- Export full session as JSON (`Download JSON`).
- Persist and reload chats from SQLite (`Save Chat`, `Load Chat`).
- Automatic persistence lifecycle: run row is created at start, then each message is inserted incrementally.

## Persistence

Saved runs are written to:

- `chat_history.sqlite3` (in the project root)

Each saved run includes:

- Theme
- Interaction mode
- Agent names
- Agent models
- Agent prompts
- Review config and final review
- Full discussion transcript
- Run metadata (turn counts/outcome)

### Incremental Persistence Lifecycle

1. `POST /api/runs/start` when the user clicks `Start`.
2. `POST /api/runs/{id}/messages` after each streamed agent turn.
3. `POST /api/runs/{id}/messages` for the final review (when enabled).
4. `PATCH /api/runs/{id}` as run metadata evolves and when run ends.

### Thinking vs Answer Storage

Model output can include `<think>...</think>` blocks.

- `raw_text`: full model output as received.
- `thinking_text`: extracted `<think>` content only.
- `answer_text`: cleaned answer with `<think>` removed.

Only `answer_text` is reused for future context/validation. Thinking content is shown in UI for transparency but excluded from conversational memory.

## Model Selection Behavior

- The app loads models from `GET /api/tags` on your Ollama server.
- Default preferred model is `gemma3:1b` for all selectors.
- If `gemma3:1b` is not available, it falls back to the first available local model.

## Run Locally

1. Start Ollama:

```bash
ollama serve
```

2. Make sure at least one model exists (recommended default):

```bash
ollama pull gemma3:1b
```

3. Start the app server (serves UI + SQLite API):

```bash
python server.py
```

4. Open `http://127.0.0.1:8080`.

## Files

- `index.html`: UI structure and controls.
- `styles.css`: layout and styling.
- `app.js`: orchestration, model loading, streaming, validation, export, persistence integration.
- `server.py`: local HTTP server + SQLite persistence API.
- `README.md`: project docs.

## Endpoints Used

- `GET http://localhost:11434/api/tags`
- `POST http://localhost:11434/api/chat`
- `GET /api/runs`
- `GET /api/runs/{id}`
- `POST /api/runs/start`
- `POST /api/runs/{id}/messages`
- `PATCH /api/runs/{id}`
- `POST /api/runs` (legacy bulk save)

## Notes

If browser-to-Ollama requests are blocked by origin rules, restart Ollama with allowed origins.

PowerShell example:

```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```




