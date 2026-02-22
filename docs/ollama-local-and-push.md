# Ollama Local Setup and Push Guide

This guide covers:

1. Running Ollama locally on Windows, macOS, and Ubuntu
2. Connecting OpenAgents to local Ollama
3. Pushing a model to `ollama.com`
4. Pushing your repo changes to GitHub

## 1) Install Ollama locally

Official download and platform docs:

- https://ollama.com/download
- https://docs.ollama.com/windows
- https://docs.ollama.com/macos
- https://docs.ollama.com/linux

### Windows

1. Download and run `OllamaSetup.exe` from https://ollama.com/download
2. Open PowerShell and verify:

```powershell
ollama -v
```

### macOS

1. Download Ollama DMG from https://ollama.com/download
2. Drag `Ollama.app` to `Applications`
3. Open Terminal and verify:

```bash
ollama -v
```

### Ubuntu

Install with the official script:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

If systemd is used, ensure service is running:

```bash
sudo systemctl enable --now ollama
sudo systemctl status ollama
```

Verify CLI:

```bash
ollama -v
```

## 2) Pull and test a local model

```bash
ollama pull llama3.2
ollama ls
curl http://localhost:11434/api/tags
```

The OpenAI-compatible endpoint is:

- `http://localhost:11434/v1`
- Reference: https://docs.ollama.com/api/openai-compatibility

## 3) Connect OpenAgents to local Ollama

### UI path (recommended)

1. Start OpenAgents (`pnpm dev`).
2. Open `Settings -> Config`.
3. In `Active LLM`, set:
   - Provider: `Ollama`
   - Model: your pulled model (for example `llama3.2`)
4. In the Ollama card:
   - Server URL: `http://localhost:11434`
   - Click `Test`
   - Click `Save Key`
5. Click `Save` in `Active LLM`.

Notes:

- OpenAgents appends `/v1` internally for Ollama compatibility.
- If model list is empty, run `ollama pull <model>` first, then click `Refresh models`.

### Server + Docker path (Ubuntu VPS)

If OpenAgents API runs in Docker and Ollama runs on the VPS host:

1. Set these in `infra/docker/.env.prod`:

```env
DEFAULT_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_ALLOWED_HOSTS=localhost,127.0.0.1,::1,host.docker.internal
NEXT_PUBLIC_OLLAMA_BASE_URL=http://host.docker.internal:11434
```

2. Rebuild and restart:

```bash
pnpm prod:build
pnpm prod:up
```

3. Verify from API container:

```bash
pnpm prod:check:ollama
```

4. In UI (`Settings -> Config`):
   - Provider: `Ollama`
   - Server URL: `http://host.docker.internal:11434`
   - Click `Save Key`, then `Refresh models`

## 4) Push a model to ollama.com

References:

- https://docs.ollama.com/import
- https://docs.ollama.com/api/authentication
- https://docs.ollama.com/api/push

### Steps

1. Sign in:

```bash
ollama signin
```

2. Ensure your model name is namespaced with your Ollama username:

```bash
ollama cp mymodel myusername/mymodel
```

3. Push model:

```bash
ollama push myusername/mymodel
```

4. Verify by pulling/running:

```bash
ollama run myusername/mymodel
```

## 5) Push your repo changes (GitHub)

```bash
git add .
git commit -m "docs: add ollama local setup and push guide"
git push origin main
```

If you use a feature branch, replace `main` with your branch name.
