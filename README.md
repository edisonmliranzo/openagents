# OpenAgents

OpenAgents is a local-first AI agent platform with a modern web control plane, tool-calling runtime, approvals, memory files, and multi-channel operations.

## Highlights

- OpenAgent control runtime (`/agent/openagent`) for skills, sessions, persona, and runtime actions.
- Live chat workspace with approvals, code-aware responses, and copy-code UX.
- Voice chat controls (browser speech-to-text + spoken replies).
- File-based memory model (`SOUL.md`, `USER.md`, `MEMORY.md`, `HEARTBEAT.md`, `cron.json`).
- Browser capture ingest endpoint + extension scaffold for selected web content.
- Tool execution loop with ReAct-style calls and approval gates.
- Signed marketplace packs, orchestration run state, and scheduled autonomy windows.
- Platform control features:
  - templates marketplace
  - fleet health snapshot
  - eval suites (Ollama benchmarking)
  - billing/cost dashboard
  - subscription plans and quotas
  - omnichannel inbox
- WhatsApp channel support with pairing/link flow and webhook ingestion.
- LLM provider switching (Anthropic / OpenAI / Google Gemini / MiniMax / Ollama local) with per-user model selection, live model discovery, and graceful tool-fallback for models that don't support function calling.

## Tech stack

| Layer | Tech |
|---|---|
| Web | Next.js 14, Tailwind, Zustand |
| API | NestJS, Prisma |
| Mobile | Expo (React Native) |
| Worker | Bull + Redis |
| Database | PostgreSQL |
| Queue/Cache | Redis |
| Monorepo | pnpm workspaces + Turborepo |

## Quick start (local)

### 1. Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop (Windows/macOS) or Docker Engine + Compose plugin (Ubuntu)

Windows (PowerShell as Administrator):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Docker.DockerDesktop
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

macOS (Homebrew):

```bash
brew install node@20
brew install --cask docker
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

Ubuntu 22.04+:

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs docker.io docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

### 2. One-command setup

```bash
node scripts/setup.mjs
```

This command:

- installs workspace dependencies
- creates env files from examples if missing
- starts local Postgres/Redis with Docker (if available)
- runs Prisma generate + migrate

If pnpm is already available, you can run `pnpm setup` instead.

Useful variants:

- `node scripts/setup.mjs --skip-docker`
- `node scripts/setup.mjs --skip-migrate`

### 3. Start apps

```bash
pnpm dev
```

Optional: custom dev ports (useful when other projects already use 3000/3001):

```bash
WEB_PORT=4300 API_PORT=4301 pnpm dev
```

By default, web API URL is auto-derived from `API_PORT` (`NEXT_PUBLIC_API_URL=http://localhost:<API_PORT>`).
If you set `NEXT_PUBLIC_API_URL` manually in `apps/web/.env.local`, that value takes precedence.
Each web start prints login URLs (`localhost`, LAN IPs, and optional public URL).

On Ubuntu, make these defaults persistent:

```bash
echo 'export WEB_HOST=0.0.0.0' >> ~/.bashrc
echo 'export WEB_PORT=4300' >> ~/.bashrc
echo 'export API_PORT=4301' >> ~/.bashrc
echo 'export PUBLIC_LOGIN_URL=https://your-domain/login' >> ~/.bashrc
source ~/.bashrc
```

If you only want to print login URLs without starting the app:

```bash
pnpm --filter @openagents/web run show:login-url
```

### 4. Manual setup (optional)

```bash
pnpm install
docker compose -f infra/docker/docker-compose.yml up -d
pnpm --filter @openagents/api run db:generate
pnpm --filter @openagents/api run db:migrate
```

Optional custom DB/Redis host ports:

```bash
POSTGRES_HOST_PORT=55432 REDIS_HOST_PORT=56379 docker compose -f infra/docker/docker-compose.yml up -d
```

Local URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- API docs: `http://localhost:3001/docs`

## Production deployment (latest method)

Use the Docker production stack with `infra/docker/.env.prod`.

### 1. Bootstrap Ubuntu VPS

Run once on a fresh Ubuntu server:

```bash
apt-get update
apt-get install -y git curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs docker.io docker-compose-plugin
corepack enable
corepack prepare pnpm@9.0.0 --activate
systemctl enable --now docker
```

Clone/pull into a fixed path (do not run production commands from `/root`):

```bash
mkdir -p /opt
cd /opt
if [ ! -d openagents/.git ]; then
  git clone https://github.com/edisonmliranzo/openagents.git
fi
cd /opt/openagents
git pull origin main
```

### 2. Create and configure `infra/docker/.env.prod`

```bash
cp -n infra/docker/.env.prod.example infra/docker/.env.prod
```

Set real secrets and ports in `infra/docker/.env.prod`:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `ENCRYPTION_KEY`
- provider keys if used (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
- `WEB_HOST_PORT`, `API_HOST_PORT`, `POSTGRES_HOST_PORT`, `REDIS_HOST_PORT` (if defaults conflict)
- `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`
- creator bootstrap email(s): `CREATOR_EMAIL` or `CREATOR_EMAILS`

For Ollama on host + API in Docker, use:

```env
DEFAULT_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_ALLOWED_HOSTS=localhost,127.0.0.1,::1,host.docker.internal
NEXT_PUBLIC_OLLAMA_BASE_URL=http://host.docker.internal:11434
```

### 3. Build and start

```bash
pnpm install --frozen-lockfile
pnpm prod:build
pnpm prod:up
```

### 4. Verify

```bash
pnpm prod:ps
pnpm prod:check:ollama
```

Health checks:

- API health: `http://localhost:<API_HOST_PORT>/api/v1/health`
- Web login page: `http://localhost:<WEB_HOST_PORT>/login`
- API docs: `http://localhost:<API_HOST_PORT>/docs`

### 5. Update existing production install

```bash
cd /opt/openagents
git pull origin main
pnpm install --frozen-lockfile
pnpm prod:build
pnpm prod:up
pnpm prod:check:ollama
```

### Ubuntu outside-network setup (step-by-step)

Use this checklist to access login from outside your LAN.

1. Set persistent app ports and public login URL on Ubuntu:

```bash
echo 'export WEB_HOST=0.0.0.0' >> ~/.bashrc
echo 'export WEB_PORT=4300' >> ~/.bashrc
echo 'export API_PORT=4301' >> ~/.bashrc
echo 'export PUBLIC_LOGIN_URL=https://your-domain/login' >> ~/.bashrc
source ~/.bashrc
```

2. Start the app:

```bash
pnpm dev
```

The startup logs will print:
- local login URL (`http://localhost:<WEB_PORT>/login`)
- LAN login URLs (`http://<server-lan-ip>:<WEB_PORT>/login`)
- public login URL (from `PUBLIC_LOGIN_URL`, if set)

3. Allow inbound traffic on Ubuntu firewall:

```bash
sudo ufw allow 4300/tcp
sudo ufw status
```

If you choose a different `WEB_PORT`, open that port instead.

4. Configure router/NAT port forwarding:

- External TCP port: `4300` (or `80/443` if behind reverse proxy)
- Internal destination: `<ubuntu_server_lan_ip>:4300`

Find server LAN IP:

```bash
hostname -I
```

5. Verify external reachability:

- Find your public IP:

```bash
curl -4 ifconfig.me
```

- From a device not on your Wi-Fi (mobile data), open:
  - `http://<public-ip>:4300/login` (direct test), or
  - `https://your-domain/login` (recommended)

6. Recommended for internet exposure: HTTPS + reverse proxy (Nginx/Caddy) on `443`, forwarding to local web port (`4300`).

### Ubuntu auto-start on reboot (systemd)

Use this to keep `pnpm dev` running after reboot.

1. Create service file:

```bash
sudo tee /etc/systemd/system/openagents-dev.service > /dev/null <<'EOF'
[Unit]
Description=OpenAgents Dev Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<ubuntu_user>
WorkingDirectory=/home/<ubuntu_user>/openagents
Environment=NODE_ENV=development
Environment=WEB_HOST=0.0.0.0
Environment=WEB_PORT=4300
Environment=API_PORT=4301
Environment=NEXT_PUBLIC_API_URL=http://localhost:4301
Environment=PUBLIC_LOGIN_URL=https://your-domain/login
ExecStart=/usr/bin/env pnpm dev
Restart=always
RestartSec=5
KillSignal=SIGINT
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
```

2. Replace placeholders:

- `<ubuntu_user>` with your Linux username.
- `/home/<ubuntu_user>/openagents` with your repo path.
- `PUBLIC_LOGIN_URL` with your real domain login URL (optional but recommended).

3. Enable + start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable openagents-dev
sudo systemctl start openagents-dev
```

4. Check status and live logs:

```bash
systemctl status openagents-dev --no-pager
journalctl -u openagents-dev -f
```

5. Restart after updates:

```bash
sudo systemctl restart openagents-dev
```

6. Disable if needed:

```bash
sudo systemctl disable --now openagents-dev
```

If `pnpm` is not found by systemd, run `which pnpm` and replace `ExecStart` with that absolute path.

### 4. View logs / stop

```bash
pnpm prod:logs
pnpm prod:down
```

## Core runtime capabilities

### Agent flow

1. User sends message
2. Agent builds context from recent chat + memory files
3. LLM plans tool calls
4. Approval-gated tools create approval records
5. User approves/denies
6. Tool result is persisted and the agent continues/responds

### Built-in tools

- `gmail_search`
- `gmail_draft_reply`
- `calendar_get_availability`
- `calendar_create_event`
- `web_fetch`
- `web_search`
- `get_current_time`
- `cron_add`
- `cron_list`
- `cron_remove`
- `notes_create`
- `notes_list`

### Memory files

Per-user memory is persisted as editable files under `data/memory/...`, including:

- `SOUL.md`
- `USER.md`
- `MEMORY.md`
- `HEARTBEAT.md`
- `cron.json`
- `AUTONOMY.json`
- dated daily logs and chat history files

## Configuration notes

### LLM providers

Five providers are supported. Set env vars in `apps/api/.env`:

| Provider | Env var | Notes |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | Default. Models: Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| OpenAI | `OPENAI_API_KEY` | Models: GPT-5.1, GPT-4.1 family |
| Google Gemini | `GEMINI_API_KEY` | Models: Gemini 3.1/3.0 Pro, 2.5/2.0 Flash family |
| MiniMax | `MINIMAX_API_KEY` | Models: MiniMax-M2, MiniMax-M2.5 (cloud API) |
| Ollama | *(keyless)* | Local inference. Set server URL per-user in Settings › Config |

```
DEFAULT_LLM_PROVIDER=anthropic   # or openai / google / minimax / ollama
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
MINIMAX_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_ALLOWED_HOSTS=localhost,127.0.0.1,::1,host.docker.internal
```

Per-user provider and model can be overridden in **Settings › Config** without restarting the server. Ollama models are discovered live from your local Ollama instance; models that don't support function calling fall back to plain-text mode automatically.

For Docker production stack, set these in `infra/docker/.env.prod`.

> **After editing `packages/shared/src/`** run `pnpm --filter @openagents/shared build` so Next.js picks up the compiled constants.

### Security controls

Auth + API hardening defaults (configurable via `apps/api/.env`):

- `AUTH_BCRYPT_ROUNDS=12` for password hashing cost
- `AUTH_MAX_REFRESH_TOKENS=10` to cap active refresh tokens per user
- `AUTH_RATE_WINDOW_MS=900000`
- `AUTH_MAX_FAILED_ATTEMPTS_PER_IDENTITY=10`
- `AUTH_MAX_FAILED_ATTEMPTS_PER_IP=30`
- `AUTH_LOCKOUT_MS=1800000` (temporary lockout on repeated failures)
- `ALLOW_CUSTOM_LLM_BASE_URLS=false` (prevents custom cloud-provider base URLs by default)
- `OLLAMA_BASE_URL=http://localhost:11434` (default Ollama endpoint when no per-user URL is saved)
- `OLLAMA_ALLOWED_HOSTS=localhost,127.0.0.1,::1,host.docker.internal` (restricts Ollama host targets)

Production recommendation:

- Always set explicit CORS origins with `FRONTEND_URLS` (or `FRONTEND_URL`).
- Use long random values for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- Keep `ALLOW_CUSTOM_LLM_BASE_URLS=false` unless you control the target endpoint.

### Web search providers

Brave:

- `WEB_SEARCH_PROVIDER=brave`
- `BRAVE_SEARCH_API_KEY=...`

Free/self-hosted SearXNG:

- `WEB_SEARCH_PROVIDER=searxng`
- `SEARXNG_BASE_URL=http://localhost:8080`
- `SEARXNG_API_KEY=` (optional)

### ML automation

End-to-end ML automation scaffolding is included under `ml/`:

- preprocessing automation
- hyperparameter optimization
- retraining pipeline with model promotion
- API trigger endpoint
- cron scheduler
- calendar-event-driven retraining
- GitHub Actions CI/CD workflow

Quick start:

```bash
python -m pip install --upgrade pip
pip install -r ml/requirements.txt
python ml/automation.py --config ml/config.yaml pipeline
```

Useful commands:

```bash
pnpm ml:preprocess
pnpm ml:hpo
pnpm ml:train
pnpm ml:pipeline
pnpm ml:schedule
pnpm ml:calendar
pnpm ml:api
```

Full guide: `ml/README.md`.

### WhatsApp channel (Twilio)

Key env vars in `apps/api/.env`:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `WHATSAPP_DEFAULT_USER_ID`
- `WHATSAPP_PAIR_COMMAND`
- `WHATSAPP_WEBHOOK_TOKEN` (optional)
- `CREATOR_EMAIL` (optional, private owner bootstrap email)
- `CREATOR_EMAILS` (optional, comma-separated private owner bootstrap emails)

Creator-only admin dashboard:

- Set `CREATOR_EMAIL` (or `CREATOR_EMAILS`) in `apps/api/.env` with your private email.
- On next register/login, that account is promoted to `owner`.
- Only the `owner` account can access private install/device analytics at `/control/admin`.
- Do not commit real creator emails to Git; keep them only in runtime env files or VPS secrets.

For Docker production stack, set these in `infra/docker/.env.prod`.

## Monorepo layout

```text
apps/
  api/      NestJS API (auth, chat, tools, approvals, memory, channels, platform, openagent runtime)
  web/      Next.js dashboard + chat UI
  mobile/   Expo mobile client
  worker/   Background processor
packages/
  shared/   Shared types/constants
  sdk/      API SDK used by web/mobile
infra/
  docker/   Local infra compose + production app stack compose
```

## Useful commands

```bash
pnpm type-check
pnpm --filter @openagents/api run build
pnpm --filter @openagents/web run build
pnpm prod:build
pnpm prod:up
pnpm prod:check:ollama
```

## Troubleshooting

- If UI renders unstyled/plain text:
  - run `pnpm --filter @openagents/web run dev:clean`
  - hard refresh browser (`Ctrl+Shift+R`)
- If login says "Failed to reach API":
  - confirm API is running on your configured port (default `http://localhost:3001`)
  - if you manually set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local`, make sure it matches `API_PORT`
- If Ollama says "No local models found" on server:
  - set `OLLAMA_BASE_URL` to an endpoint reachable by the API process/container
  - in Docker, use `OLLAMA_BASE_URL=http://host.docker.internal:11434`
  - ensure `OLLAMA_ALLOWED_HOSTS` includes that host, then rebuild/restart and click **Refresh models**
  - run `pnpm prod:check:ollama` to verify API-container reachability
- For production Docker deploy:
  - verify `infra/docker/.env.prod` exists
  - verify `JWT_SECRET` and DB credentials are set
  - run `pnpm prod:ps` and inspect unhealthy containers with `pnpm prod:logs`

## Additional guides

- Local Ollama setup + model/code push: `docs/ollama-local-and-push.md`
- MVP feature bundle (signing/orchestration/voice/capture/autonomy): `docs/mvp-feature-pack.md`
