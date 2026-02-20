# OpenAgents

OpenAgents is a local-first AI agent platform with a modern web control plane, tool-calling runtime, approvals, memory files, and multi-channel operations.

## Highlights

- OpenAgent control runtime (`/agent/openagent`) for skills, sessions, persona, and runtime actions.
- Live chat workspace with approvals, code-aware responses, and copy-code UX.
- File-based memory model (`SOUL.md`, `USER.md`, `MEMORY.md`, `HEARTBEAT.md`, `cron.json`).
- Tool execution loop with ReAct-style calls and approval gates.
- Platform control features:
  - templates marketplace
  - fleet health snapshot
  - eval suites (Ollama benchmarking)
  - billing/cost dashboard
  - subscription plans and quotas
  - omnichannel inbox
- WhatsApp channel support with pairing/link flow and webhook ingestion.
- LLM provider switching (Anthropic/OpenAI) and web search provider switching (Brave/SearXNG).

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
- Docker Desktop (recommended for Postgres/Redis)

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### 4. Configure environment files

PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

macOS/Linux:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

### 5. Run Prisma migrations

```bash
pnpm --filter @openagents/api run db:generate
pnpm --filter @openagents/api run db:migrate
```

### 6. Start apps

```bash
pnpm dev
```

Local URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- API docs: `http://localhost:3001/docs`

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
- dated daily logs and chat history files

## Configuration notes

### LLM providers

Set in `apps/api/.env`:

- `DEFAULT_LLM_PROVIDER=anthropic` or `openai`
- `ANTHROPIC_API_KEY=...`
- `OPENAI_API_KEY=...`

### Web search providers

Brave:

- `WEB_SEARCH_PROVIDER=brave`
- `BRAVE_SEARCH_API_KEY=...`

Free/self-hosted SearXNG:

- `WEB_SEARCH_PROVIDER=searxng`
- `SEARXNG_BASE_URL=http://localhost:8080`
- `SEARXNG_API_KEY=` (optional)

### WhatsApp channel (Twilio)

Key env vars in `apps/api/.env`:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `WHATSAPP_DEFAULT_USER_ID`
- `WHATSAPP_PAIR_COMMAND`
- `WHATSAPP_WEBHOOK_TOKEN` (optional)

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
  docker/   Local postgres + redis compose
```

## Useful commands

```bash
pnpm type-check
pnpm --filter @openagents/api run build
pnpm --filter @openagents/web run build
```

## Troubleshooting

- If UI renders unstyled/plain text:
  - run `pnpm --filter @openagents/web run dev:clean`
  - hard refresh browser (`Ctrl+Shift+R`)
- If login says "Failed to reach API":
  - confirm API is running on `http://localhost:3001`
  - verify `NEXT_PUBLIC_API_URL` in `apps/web/.env.local`
