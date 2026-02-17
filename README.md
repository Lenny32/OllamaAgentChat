# Ollama Debate Room

Ollama Debate Room is a local-first web app where two Ollama models discuss any topic in alternating turns, then a third model can synthesize the conversation into a final review.

The app is designed for brainstorming, architecture tradeoffs, code strategy discussions, and exploratory Q&A. It streams model output live in the browser so you can watch each response appear token-by-token.

## What It Does

- Runs a two-agent conversation on a user-provided theme.
- Lets you pick models from your local Ollama instance (`/api/tags`).
- Supports per-agent public names so model IDs are not exposed in model-to-model context.
- Supports per-agent **Agent Prompt** fields (system-style instructions/persona).
- Streams responses live from Ollama (`/api/chat`, `stream: true`).
- Uses turn blocks with automatic continuation decisions.
- Generates a final structured synthesis with a selected review model.

## Core Workflow

1. Enter a topic/theme (short or long text).
2. Pick left/right/review models from dropdowns.
3. Configure left/right/review agent prompts (optional).
4. Set initial turns and max extension rounds.
5. Start run:
   - Left and right agents alternate turns.
   - After each block, both agents propose extra turns.
   - App chooses the next block length from those proposals.
6. On completion, review model creates a final consolidated report.

## Tech Summary

- Frontend: plain HTML/CSS/JavaScript (no framework).
- Runtime: static file server in browser.
- LLM backend: local Ollama server.
- Streaming: NDJSON chunk parsing via Fetch stream reader.

## Project Files

- `index.html`: App structure and controls.
- `styles.css`: Layout and visual design.
- `app.js`: Model loading, debate orchestration, streaming, validation/retry logic.
- `README.md`: Documentation.

## Run Locally

1. Start Ollama:
   - `ollama serve`
2. Ensure required models are available (example):
   - `ollama pull qwen3:4b`
   - `ollama pull ministral-3:3b`
3. Serve this folder (example):
   - `python -m http.server 8080`
4. Open:
   - `http://localhost:8080`
5. In the app, click `Refresh Models`, configure agents, then click `Start`.

## Notes

- This app is local-first and expects Ollama at:
  - `http://localhost:11434`
- API endpoints used:
  - `GET /api/tags`
  - `POST /api/chat`
- If browser requests to Ollama are blocked by origin policy, restart Ollama with allowed origins.

PowerShell example:

```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

## Current Behavior Guarantees

- Conversation is kept natural (not forced into rigid templates).
- Lightweight quality checks reduce repetitive/low-value turns.
- Retry is only used for blocking quality failures.
- Agent prompt influence is monitored as advisory (not hard-failed).

## Future Improvements

- Strict/soft quality mode toggle in UI.
- Preset agent prompt library.
- Export transcript + final review as Markdown.
- Session history persistence.
