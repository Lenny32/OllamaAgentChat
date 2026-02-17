# Ollama Debate Room

Ollama Debate Room is a local-first web app where two Ollama models discuss a topic turn-by-turn, and an optional Review Agent can synthesize the discussion at the end.

Everything runs locally against your Ollama server.

## Highlights

- Fully local: uses your Ollama instance only.
- Two-agent discussion with alternating turns.
- Optional Review Agent (disabled by default).
- Live token streaming in the chat UI.
- Smart auto-scroll:
  - If you scroll up, auto-scroll pauses.
  - If you return to the bottom, auto-scroll resumes.
- Interaction modes:
  - `Open`
  - `Debate`
  - `Collaboration`
- Per-agent prompts (`Agent Prompt`) for instruction/persona control.
- Export full session as JSON (`Download JSON`).

## Model Selection Behavior

- The app loads models from `GET /api/tags`.
- Default preferred model is `gemma3:1b` for all selectors.
- If `gemma3:1b` is not available, it falls back to the first available local model.
- If no models are installed, the app shows a message with:

```bash
ollama pull gemma3:1b
```

## How It Works

1. Enter a theme (short or long text).
2. Pick mode (`Open`, `Debate`, `Collaboration`).
3. Configure Left and Right agents (name, model, optional agent prompt).
4. Optionally enable Review Agent and configure it.
5. Set initial turns and max extensions.
6. Start:
   - Agents alternate turns.
   - After each block, both suggest additional turns.
   - The app calculates next turns from those suggestions.
7. End:
   - If Review Agent is enabled, final synthesis is generated.
   - If disabled, run ends without synthesis.

## Run Locally

1. Start Ollama:

```bash
ollama serve
```

2. Make sure at least one model exists (recommended default):

```bash
ollama pull gemma3:1b
```

3. Serve this folder (example):

```bash
python -m http.server 8080
```

4. Open `http://localhost:8080`.

## Files

- `index.html`: UI structure and controls.
- `styles.css`: layout and styling.
- `app.js`: orchestration, model loading, streaming, validation, export.
- `README.md`: project docs.

## Endpoints Used

- `GET http://localhost:11434/api/tags`
- `POST http://localhost:11434/api/chat`

## Notes

If browser-to-Ollama requests are blocked by origin rules, restart Ollama with allowed origins.

PowerShell example:

```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```
