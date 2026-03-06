# OpenAgents

OpenAgents is a local-first AI agent platform with a modern web control plane, tool-calling runtime, approvals, memory files, and multi-channel operations.

## Highlights

- OpenAgent control runtime (`/agent/openagent`) for skills, sessions, persona, and runtime actions.
- Live chat workspace with approvals, code-aware responses, and copy-code UX.
- Voice chat controls (browser speech-to-text + spoken replies).
- File-based memory model (`SOUL.md`, `USER.md`, `MEMORY.md`, `HEARTBEAT.md`, `cron.json`).
- Browser capture ingest endpoint + extension scaffold for selected web content.
- Tool execution loop with ReAct-style calls and approval gates.
- Native MCP stdio server support with auto-discovered external tools.
- Parallel specialist delegation for complex nanobot runs.
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

## Install and update commands (Windows / macOS / Ubuntu)

### Windows (PowerShell)

Install + first run:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Docker.DockerDesktop
corepack enable
corepack prepare pnpm@9.0.0 --activate
git clone https://github.com/edisonmliranzo/openagents.git
cd openagents
pnpm install
pnpm --filter @openagents/api run db:generate
pnpm --filter @openagents/api run db:migrate
pnpm prod:up
pnpm prod:ps
```

Update existing install:

```powershell
cd C:\Users\edins\githubrepo\openagents
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @openagents/api run db:migrate
pnpm prod:build
pnpm prod:up
pnpm prod:ps
```

### macOS (Terminal)

Install + first run:

```bash
brew install node@20
brew install --cask docker
corepack enable
corepack prepare pnpm@9.0.0 --activate
git clone https://github.com/edisonmliranzo/openagents.git
cd openagents
pnpm install
pnpm --filter @openagents/api run db:generate
pnpm --filter @openagents/api run db:migrate
pnpm prod:up
pnpm prod:ps
```

Update existing install:

```bash
cd ~/githubrepo/openagents
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @openagents/api run db:migrate
pnpm prod:build
pnpm prod:up
pnpm prod:ps
```

### Ubuntu (local or server path)

Install + first run:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs docker.io docker-compose-plugin
sudo systemctl enable --now docker
corepack enable
corepack prepare pnpm@9.0.0 --activate
git clone https://github.com/edisonmliranzo/openagents.git
cd openagents
pnpm install
pnpm --filter @openagents/api run db:generate
pnpm --filter @openagents/api run db:migrate
pnpm prod:up
pnpm prod:ps
```

Update existing install:

```bash
cd /opt/openagents
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @openagents/api run db:migrate
pnpm prod:build
pnpm prod:up
pnpm prod:ps
```

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

Optional: enable Bybit demo futures tools (approval-gated):

```env
BYBIT_BASE_URL=https://api-demo.bybit.com
BYBIT_PUBLIC_BASE_URL=https://api.bybit.com
BYBIT_API_KEY=your_demo_key
BYBIT_API_SECRET=your_demo_secret
BYBIT_DEMO_ONLY=true
BYBIT_RECV_WINDOW=5000
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

### 6. Restart after reboot (easy path)

Use the included startup scripts:

- `scripts/start-openagents.sh` (Ubuntu/macOS)
- `scripts/start-openagents.ps1` (Windows PowerShell)
- `scripts/start-openagents.cmd` (Windows CMD wrapper)

Ubuntu VPS:

```bash
cd /opt/openagents
bash scripts/start-openagents.sh
```

macOS:

```bash
cd ~/githubrepo/openagents
bash scripts/start-openagents.sh
```

Windows PowerShell:

```powershell
cd C:\Users\edins\githubrepo\openagents
.\scripts\start-openagents.ps1
```

Windows CMD:

```cmd
cd C:\Users\edins\githubrepo\openagents
scripts\start-openagents.cmd
```

One-time host setup so services recover automatically:

Ubuntu:

```bash
sudo systemctl enable --now docker
```

Windows/macOS:

- Enable Docker Desktop auto-start on login.

### Bybit demo futures workflow (optional)

1. Add Bybit demo credentials in `infra/docker/.env.prod` (example in section above).
2. Rebuild/restart the stack:

```bash
cd /opt/openagents
pnpm prod:build
pnpm prod:up
```

3. In the dashboard, install marketplace pack `Bybit Demo Ops` from `/agent/marketplace`.
4. Use chat prompts such as:
   - `Check BTCUSDT ticker and my Bybit demo positions.`
   - `Place a demo Buy market order on BTCUSDT with qty 0.001 and then show updated positions.`

Notes:
- Private Bybit tools are approval-gated.
- With `BYBIT_DEMO_ONLY=true`, orders are blocked unless `BYBIT_BASE_URL` is a demo/testnet host.

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
- `deep_research`
- `computer_session_start`
- `computer_navigate`
- `computer_click_link`
- `computer_snapshot`
- `computer_session_end`
- `get_current_time`
- `cron_add`
- `cron_list`
- `cron_remove`
- `notes_create`
- `notes_list`

Additional MCP tools are auto-discovered at runtime from `MCP_SERVERS_JSON` and exposed as namespaced tools such as `mcp_filesystem_read_file`.

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

Auto fallback (recommended):

- `WEB_SEARCH_PROVIDER=auto`
- tries `brave` (if `BRAVE_SEARCH_API_KEY` is set), then `searxng` (if `SEARXNG_BASE_URL` is set), then `duckduckgo` (no key)

Brave:

- `WEB_SEARCH_PROVIDER=brave`
- `BRAVE_SEARCH_API_KEY=...`

Free/self-hosted SearXNG:

- `WEB_SEARCH_PROVIDER=searxng`
- `SEARXNG_BASE_URL=http://localhost:8080`
- `SEARXNG_API_KEY=` (optional)

DuckDuckGo (no API key):

- `WEB_SEARCH_PROVIDER=duckduckgo`

### MCP servers (native stdio)

OpenAgents can load external MCP servers directly into the API tool registry. Discovered tools are exposed to the agent, `/api/v1/tools`, and the Channels UI as first-class tools.

- Transport: stdio
- Config env: `MCP_SERVERS_JSON`
- Tool naming: `mcp_<serverId>_<toolName>`
- Approval default: MCP tools require approval unless the server marks them `readOnlyHint: true`

Example:

```env
MCP_REQUEST_TIMEOUT_MS=20000
MCP_SERVERS_JSON={"filesystem":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","./data/memory"],"cwd":"."}}
```

Passing secrets through to an MCP server:

```env
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...
MCP_SERVERS_JSON={"github":{"command":"npx","args":["-y","@modelcontextprotocol/server-github"],"env":{"GITHUB_PERSONAL_ACCESS_TOKEN":"${GITHUB_PERSONAL_ACCESS_TOKEN}"}}}
```

Notes:

- Relative `cwd` values are resolved from the API process working directory.
- The configured `command` must be available where the API runs, including inside Docker if you enable MCP in the container.
- If an MCP server is unavailable or misconfigured, OpenAgents logs the error and continues without blocking built-in tools.

### Computer-use (Playwright)

- Install runtime in API workspace: `pnpm --filter @openagents/api add playwright`
- Browser mode config:
  - `COMPUTER_USE_PROVIDER=auto` (`auto` | `playwright` | `http`)
  - `COMPUTER_USE_PLAYWRIGHT_BROWSER=chromium` (`chromium` | `firefox` | `webkit`)
  - `COMPUTER_USE_PLAYWRIGHT_HEADLESS=true`
  - `COMPUTER_USE_MAX_SCREENSHOT_BYTES=120000`
  - `COMPUTER_USE_HTTP_RENDER_FALLBACK=true` (auto-upgrade HTTP sessions to Playwright for likely JS-rendered pages)
  - `COMPUTER_USE_PLAYWRIGHT_WAIT_UNTIL=domcontentloaded` (`domcontentloaded` | `load` | `networkidle` | `commit`)
  - `COMPUTER_USE_PLAYWRIGHT_NAV_TIMEOUT_MS=25000`
  - `COMPUTER_USE_PLAYWRIGHT_NETWORK_IDLE_TIMEOUT_MS=1500` (`0` disables network-idle wait)
  - `COMPUTER_USE_PLAYWRIGHT_WAIT_FOR_SELECTOR=` (optional global selector wait)
  - `COMPUTER_USE_PLAYWRIGHT_WAIT_FOR_SELECTOR_TIMEOUT_MS=3500`
  - `COMPUTER_USE_PLAYWRIGHT_SELECTOR_RETRY_COUNT=3`
  - `COMPUTER_USE_PLAYWRIGHT_SELECTOR_RETRY_DELAY_MS=350`
  - `COMPUTER_USE_PLAYWRIGHT_SETTLE_TIMEOUT_MS=4500`
  - `COMPUTER_USE_PLAYWRIGHT_SETTLE_STABLE_MS=700`
  - `COMPUTER_USE_PLAYWRIGHT_SETTLE_POLL_MS=140`

`auto` prefers Playwright for JS-heavy sites and falls back to static HTTP parsing if Playwright is unavailable.
`computer_navigate` and `computer_click_link` now also accept optional `waitForSelector` + `waitForSelectorTimeoutMs`.

### MANUS_LITE preset

Enable `MANUS_LITE=true` to apply a low-cost preset that improves autonomous tool execution defaults:

- Routing defaults (applied when user settings are still stock defaults, or always with `MANUS_LITE_FORCE_ROUTING=true`):
  - `MANUS_LITE_PROVIDER=ollama`
  - `MANUS_LITE_MODEL=phi3`
- Tool-loop defaults:
  - `MANUS_LITE_MAX_TOOL_ROUNDS=10`
  - `MANUS_LITE_TOOL_RETRY_ATTEMPTS=2`
  - `MANUS_LITE_TOOL_RETRY_BASE_DELAY_MS=350`
  - `MANUS_LITE_NANOBOT_MAX_LOOP_STEPS=10`

### MANUS_MODE preset

Enable `MANUS_MODE=true` to apply a higher-autonomy Manus-style runtime contract:

- Prompt/runtime behavior:
  - explicitly runs understand -> plan -> execute -> verify
  - pushes proactive tool use for external/factual tasks
  - normalizes final replies into sections (`Intent`, `Plan`, `Actions`, `Verification`, `Result`, `Next actions`)
- Routing defaults (applied when user settings are still stock defaults, or always with `MANUS_MODE_FORCE_ROUTING=true`):
  - `MANUS_MODE_PROVIDER=ollama`
  - `MANUS_MODE_MODEL=` (defaults to provider fast model when blank)
- Tool-loop defaults (applied when `AGENT_*` values remain defaults):
  - max rounds: `14`
  - retry attempts: `3`
  - retry base delay: `250`
  - nanobot loop steps: `MANUS_MODE_NANOBOT_MAX_LOOP_STEPS=14`

If both `MANUS_MODE` and `MANUS_LITE` are enabled, `MANUS_MODE` presets take precedence.

### Agent reliability tuning

- `AGENT_MAX_TOOL_ROUNDS=6` max plan/act rounds per run
- `AGENT_TOOL_RETRY_ATTEMPTS=1` retries for retryable tool errors
- `AGENT_TOOL_RETRY_BASE_DELAY_MS=500` linear backoff base delay

### Nanobot parallel delegation

Nanobot can spin up multiple specialist agents for complex work, run them in parallel, and feed the synthesized output back into the main run when the task warrants it.

- `NANOBOT_PARALLEL_DELEGATION_ENABLED=true`
- `NANOBOT_PARALLEL_DELEGATION_MAX_AGENTS=3`

Current auto-trigger heuristics favor:

- high-complexity requests
- deep research tasks
- multi-step asks involving comparison, architecture, migration, rollout, or tradeoffs

Specialist roles currently fan out as researcher, builder, operator, and reviewer, then synthesize back into one plan.

### Queue-mode approval continuation (OpenClaw-style)

Use these when running approval continuation through the worker instead of inline API execution:

- `APPROVAL_CONTINUATION_MODE=queue`
- `APPROVAL_WORKER_TOKEN=<shared-secret>` (optional but recommended)
- Worker API target:
  - local dev: `APPROVAL_CONTINUATION_API_URL=http://localhost:3001`
  - Docker: `APPROVAL_CONTINUATION_API_URL=http://api:3001`
- `APPROVAL_CONTINUATION_HTTP_TIMEOUT_MS=15000`

Queue jobs now retry with exponential backoff and land in `approvals-dead-letter` after final failure.

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
