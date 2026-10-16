# Transcriber — Web

A dark-themed web transcriber for session recordings → timestamped transcript → AI
summary → Google Form quiz. It is a direct web port of the **native Mac app**
(`keyframesfound/transcriber`) — same Hex-style dark UI (`#101010` / `#171717` /
`#1F1F1F`, monochrome controls), same summary/quiz prompts, same Word export — but
with one big change: **transcription runs through OpenRouter's speech-to-text API
instead of a local SenseVoice sidecar.** No ffmpeg, no Python, no model downloads.

Deployed at `ai.ssc.edu.hk/transcriber`.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + TypeScript (Vite), custom Hex CSS — no UI library |
| Backend | Node + TypeScript (Express) — holds the OpenRouter + Google keys |
| Storage | JSON files on disk (`data/`), one per session |
| Speech-to-text | OpenRouter `/audio/transcriptions` (Whisper large-v3-turbo by default) |
| AI summary / quiz | OpenRouter chat completions |
| Google quiz | Google Forms API (OAuth) |
| Exports | Word `.docx` (server), TXT (server), PDF (browser print dialog) |

The OpenRouter and Google keys never leave the server — the browser only talks to
`/api`.

## Features

- **Sidebar** — Settings, search, "New Session", and a saved-session list with
  rename/delete. Transcripts persist server-side across restarts.
- **New Session** — dashed drop zone, audio-language picker (Auto / Cantonese 粵語 /
  Mandarin 普通話 / English) and summary/quiz-language picker. Dropping a file
  starts transcription immediately.
- **Editor** — audio player + waveform on the left, timestamped transcript on the
  right, two-way synced: click a line to play from there, click the waveform to
  jump, and the active line follows playback. Keyboard shortcuts: `Space` play/pause,
  `↑` / `↓` previous/next line.
- **Tabs** — Transcript · Summary · Quiz (Quiz appears once generated).
- **✨ AI Summary** — lesson summary or meeting minutes, in 香港繁體 / 简体中文 /
  English, at Brief / Standard / In-depth length (all set in Settings).
- **📝 Google Form Quiz** — generates the questions, then creates a quiz-mode form
  directly in your Google Drive (1 point each, correct answers marked, explanations
  on wrong answers). Unlocks after a one-time Google sign-in.
- **Exports** — Word `.docx`, PDF (print dialog), and TXT for both the transcript
  and the summary. Cantonese/Mandarin transcripts are converted simplified →
  traditional for the 香港繁體 output (OpenCC tables).

## Quick start (development)

```bash
npm install
cp .env.example .env      # then put your OpenRouter key in .env
npm run dev               # server on :8787, Vite dev server on :5173 (proxies /api)
# open http://localhost:5173
```

## Production

```bash
npm install
cp .env.example .env      # edit: keys, PORT, HOST, GOOGLE_REDIRECT_URI, DATA_DIR
npm run build             # tsc (server) + vite build (web)
npm start                 # serves the API and the built web app on one port
```

Point `GOOGLE_REDIRECT_URI` at `https://<your-host>/api/google/callback` and run it
behind whatever reverse proxy / process manager you use (the original app shipped
systemd units; anything that runs a Node process works).

## Configuration (`.env`)

| Setting | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | — | **Required.** One key for STT + summary + quiz — [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL` | `deepseek/deepseek-v4-pro` | Chat model for summaries + quizzes |
| `OPENROUTER_STT_MODEL` | `openai/whisper-large-v3-turbo` | Speech-to-text model — see below |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Needed for the quiz button |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8787/api/google/callback` | Must exactly match an Authorized redirect URI on the Google OAuth client |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Server bind |
| `DATA_DIR` | `./data` | Sessions, uploaded audio, Google token |

## Speech-to-text models

26 STT models are available on OpenRouter. Whisper large-v3-turbo is the fast, cheap default
(Cantonese/Mandarin/English, returns timestamped segments for the editor sync):

| Model | Best for | Notes |
|---|---|---|
| `openai/whisper-large-v3-turbo` | Fast/cheap default | ~25 MB audio limit; auto-detects yue/zh/en; segment timestamps |
| `qwen/qwen3-asr-1.7b` | Cheap Chinese | Very low per-second cost |
| `assemblyai/universal-3-6-pro` | Speaker labels | Speaker diarization + word timestamps |
| `openai/gpt-4o-transcribe` | High accuracy | Token-priced |

## Google sign-in (quiz button, one-time)

1. In [console.cloud.google.com](https://console.cloud.google.com), create (or pick) a project.
2. Enable the **Google Forms API**.
3. Credentials → Create credentials → **OAuth client ID**, type **Web application**.
4. Add your app's callback URL as an Authorized redirect URI — exactly
   `GOOGLE_REDIRECT_URI` from `.env` (e.g. `https://ai.ssc.edu.hk/transcriber/api/google/callback`).
5. Put the client ID + secret into `.env` and restart.

A normal Gmail works; the consent screen can stay in Testing mode with your account
as a test user. The refresh token is stored in `DATA_DIR/google-token.json` (mode
0600) — one shared sign-in for the site, matching the mac app's "sign in once"
model. Sign out from Settings.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Models + key/Google status |
| `GET` / `POST` | `/api/sessions` | List sessions / upload audio (multipart `file`, `audioLanguage`, `outputLanguage`) |
| `GET` / `PATCH` / `DELETE` | `/api/sessions/:id` | Fetch / rename / delete |
| `POST` | `/api/sessions/:id/transcribe` | Re-transcribe |
| `POST` | `/api/sessions/:id/summary` | AI summary (`style`, `length`) |
| `POST` | `/api/sessions/:id/quiz` | Google Form quiz (`count`) |
| `GET` | `/api/jobs/:id` | Poll a background job |
| `GET` | `/api/sessions/:id/audio` | Audio stream (supports range/seeking) |
| `GET` | `/api/sessions/:id/export/:kind?format=docx\|txt` | Word/TXT download (`transcript`/`summary`) |
| `GET` | `/api/google/login` · `/callback` · `/logout` · `/status` | Google OAuth |

## Notes

- **PDF export uses the browser's print dialog** (open a print view → save as PDF).
  This keeps the server dependency-light and renders Chinese with the user's own
  fonts. It can be swapped for server-side PDF generation (pdfkit + a bundled CJK
  font) later.
- **PDF/TXT/Word** — the `.docx` files are byte-compatible in content with the mac
  app's (same hand-built OOXML package).
- **Jobs are in-memory** — a server restart drops in-flight transcriptions/summaries;
  finished sessions are persisted and unaffected.
- The OpenRouter key stays server-side. Never put it in the frontend.
- Whisper-class models reject audio over ~25 MB — split longer recordings into
  smaller files and upload each one.
