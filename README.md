# MedVision Ollama Backend

This project now includes a backend server that serves the frontend and forwards analysis requests to a local Ollama instance.

## Run

1. Install Node.js 18+.
2. Install dependencies:

```powershell
npm install
```

3. Make sure Ollama is running and a vision-capable model is available.
4. Optional environment variables:

```powershell
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="llava:7b"
```

5. Start the app:

```powershell
npm start
```

6. Open `http://localhost:3000`.

## API

- `GET /api/health` checks backend and Ollama connectivity
- `POST /api/analyze` accepts patient fields plus uploaded scan images in the `scans` field

This remains a prototype workflow and must not be used as a real diagnostic system.
