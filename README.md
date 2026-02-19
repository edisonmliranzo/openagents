# OpenAgents MVP

AI agent platform: chat → tools/actions → approvals → history/memory.

## Stack

| Layer | Tech |
|-------|------|
| Web app | Next.js 14 (App Router) |
| Mobile app | Expo (React Native) |
| API | NestJS + Prisma |
| Worker | Bull + Redis |
| DB | PostgreSQL |
| Cache/Queue | Redis |
| LLM | Anthropic Claude + OpenAI (switchable) |
| Monorepo | pnpm workspaces + Turborepo |

## Quick start

### 1. Install dependencies
```bash
pnpm install
```

### 2. Start infra (Postgres + Redis)
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### 3. Set up API env
```bash
cp apps/api/.env.example apps/api/.env
# Fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, JWT_SECRET, etc.
```

### 4. Run DB migrations
```bash
pnpm db:migrate
```

### 5. Start all apps
```bash
pnpm dev
```

Apps start at:
- Web: http://localhost:3000
- API: http://localhost:3001
- API docs: http://localhost:3001/docs

## Monorepo structure

```
apps/
  api/          NestJS backend (auth, chat, agent, tools, approvals, memory)
  web/          Next.js dashboard + chat UI
  mobile/       Expo chat app
  worker/       Background job processor (approvals, tool runs)
packages/
  shared/       Shared TypeScript types + constants
  sdk/          API client (used by web + mobile)
infra/
  docker/       docker-compose for local dev
```

## Core modules

### Agent pipeline
1. User sends message
2. Agent builds context (recent messages + long-term memory)
3. LLM plans tool calls
4. If tool needs approval → creates `Approval` record, streams event to client
5. User approves/denies in UI
6. Tool executes → result saved → agent replies with summary

### Tools (MVP)
- `gmail_search` — search inbox (no approval)
- `gmail_draft_reply` — draft reply (requires approval)
- `calendar_get_availability` — read free slots (no approval)
- `calendar_create_event` — create event (requires approval)
- `web_fetch` — fetch HTTPS page text (no approval)
- `notes_create` / `notes_list` — internal notes (no approval)

### LLM providers
Set `DEFAULT_LLM_PROVIDER=anthropic` or `openai` in `apps/api/.env`.
Both providers are wired; model defaults are in `packages/shared/src/constants/index.ts`.
