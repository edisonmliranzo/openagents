# OpenAgents

<div align="center">

![OpenAgents](https://img.shields.io/badge/OpenAgents-Self--Hosted%20AI%20Platform-ef4444?style=for-the-badge&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-2.0-blue?style=for-the-badge)](https://github.com/edisonmliranzo/openagents)
[![Docker](https://img.shields.io/badge/Docker-Required-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/products/docker-desktop/)

**The open-source, self-hosted AI agent platform.**  
Build, run, and own your own AI agents — no cloud required.

[🌐 Website](https://openagents.us) • [🚀 Install](#installation) • [💡 Features](#features) • [🏢 Plans](#plans)

</div>

---

## What is OpenAgents?

OpenAgents is a **self-hosted AI assistant platform** for complex, long-horizon tasks through multi-agent collaboration. It supports content creation, coding, research, image generation, and more — all running on your own machine or server.

| Feature | OpenAgents | Standard AI Assistants |
|---|---|---|
| Multi-Agent Collaboration | ✅ Native MCP Protocol | ❌ Single Agent |
| Persistent Memory | ✅ Built-in | ❌ Session Only |
| Self-Hosted | ✅ Full Control | ❌ Cloud Only |
| Image Generation | ✅ AtlasCloud, DALL-E, Stability | ❌ Limited |
| Tool Integrations | ✅ 50+ built-in tools | ❌ Basic |
| Approval Gates | ✅ Granular Control | ❌ None |

---

## Installation

> Recommended path: use the guided setup for local development, and Docker Compose for production/self-hosting.  
> First launch can take **5–10 minutes** depending on image builds and model setup.

### Quick install checklist

Before starting, make sure you have:

- **Node.js 20+**
- **pnpm 9** (or Corepack enabled)
- **Docker Desktop / Docker Engine**
- **Git**

For a fully functional install, OpenAgents also needs:

- **PostgreSQL** and **Redis** running locally or via Docker
- At least one model provider configured after first login:
  - **Ollama** for local/self-hosted usage, or
  - **OpenAI / Anthropic / Gemini / other supported API key**

### Recommended local setup

From the repo root, run:

```bash
pnpm setup
pnpm dev
```

What `pnpm setup` does:

- installs dependencies
- creates missing `.env` files from examples
- starts local Postgres + Redis with Docker when available
- runs Prisma generate + migrations

After startup:

- Web: `http://localhost:3000/login`
- API health: `http://localhost:3001/api/v1/health`

Then log in and go to **Settings → Config** to add your provider key or connect Ollama.

---

### 🪟 Windows

**Step 1 — Install Docker Desktop**

Download and install Docker Desktop. During install, check **"Use WSL 2 instead of Hyper-V"**.

👉 [Download Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)

Open Docker Desktop and wait until you see **"Engine running"** in the bottom-left corner before continuing.

**Step 2 — Install Git**

👉 [Download Git for Windows](https://git-scm.com/download/win) — install with all default settings.

**Step 3 — Open PowerShell and run these commands**

Press `Win + X` → click **Terminal** or **PowerShell**, then paste:

```powershell
git clone https://github.com/edisonmliranzo/openagents.git
cd openagents
pnpm setup
```

**Step 4 — Start OpenAgents**

```powershell
pnpm dev
```

**Step 5 — Open your browser**

```
http://localhost:3000/login
```

**Step 6 — Make it fully functional**

- Go to **Settings → Config**
- Add an API key **or** run Ollama locally and set its URL
- Confirm API health at `http://localhost:3001/api/v1/health`

If you want the production Docker stack instead of local dev, use:

```powershell
cd infra/docker
copy .env.prod.example .env.prod
docker compose -f docker-compose.prod.yml up --build -d
```

---

### 🍎 macOS

**Step 1 — Install Docker Desktop**

👉 [Download Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)

Drag it to your Applications folder, open it, and wait for **"Engine running"**.

**Step 2 — Open Terminal and run these commands**

Press `Cmd + Space`, type **Terminal**, press Enter, then paste:

```bash
git clone https://github.com/edisonmliranzo/openagents.git
cd openagents
pnpm setup
```

**Step 3 — Start OpenAgents**

```bash
pnpm dev
```

**Step 4 — Open your browser**

```
http://localhost:3000/login
```

Then go to **Settings → Config** to add an API key or connect Ollama.

For the production Docker stack instead:

```bash
cd infra/docker
cp .env.prod.example .env.prod
docker compose -f docker-compose.prod.yml up --build -d
```

---

### 🟠 Ubuntu

**Step 1 — Install Docker** *(one-liner)*

```bash
curl -fsSL https://get.docker.com | sh && sudo systemctl enable --now docker
```

Verify: `docker --version`

**Step 2 — Install Node.js 20 + pnpm**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

**Step 3 — Clone the repository**

```bash
git clone https://github.com/edisonmliranzo/openagents.git
cd openagents
```

**Step 4 — Run guided setup**

```bash
pnpm setup
pnpm dev
```

Go to **Settings → Config** to add your API key or connect Ollama.

**Open your browser:**

```
http://YOUR_SERVER_IP:3000/login
```

---

### 🟢 Linux / VPS / Production Docker

**Step 1 — Install Docker**

```bash
curl -fsSL https://get.docker.com | sh && sudo systemctl enable --now docker
```

**Step 2 — Clone and configure**

```bash
git clone https://github.com/edisonmliranzo/openagents.git
cd openagents/infra/docker
cp .env.prod.example .env.prod
```

**Step 3 — Edit `.env.prod` before launch**

At minimum, change these values:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `ENCRYPTION_KEY`
- `POSTGRES_PASSWORD`
- one provider setting such as `OPENAI_API_KEY` or local `OLLAMA_BASE_URL`
- `FRONTEND_URL` / `NEXT_PUBLIC_API_URL` if not using localhost

**Step 4 — Launch**

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

**Step 5 — Verify the installation**

```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3001/api/v1/health
curl -I http://localhost:3000/login
```

If Ollama is used from the host machine, make sure it is actually running and reachable from Docker via `host.docker.internal`.

**Open your browser:**

```
http://YOUR_SERVER_IP:3000/login
```

### Post-install: fully functional checklist

Your installation is not fully usable until these are true:

- [ ] Web loads at `/login`
- [ ] API health endpoint returns success
- [ ] Database migrations completed
- [ ] Redis is reachable
- [ ] You can log in / register
- [ ] At least one LLM provider is configured
- [ ] Optional media features have keys set if needed:
  - `OPENAI_API_KEY` for DALL-E / TTS
  - `STABILITY_API_KEY` for Stability image generation
  - `ELEVENLABS_API_KEY` for ElevenLabs audio

### Troubleshooting

- If `pnpm setup` fails, confirm **Node.js 20+** and **pnpm 9**.
- If chat opens but the agent never answers, configure a provider in **Settings → Config**.
- If Ollama is selected, verify the Ollama server is running and the base URL is correct.
- If Docker production healthchecks fail, inspect:

```bash
cd infra/docker
docker compose -f docker-compose.prod.yml logs --tail=200 api web worker
```

---

## Features

### 🤖 AI Capabilities

| Feature | Description |
|---|---|
| Multi-Agent Collaboration | Agents that spawn and coordinate sub-agents |
| Persistent Memory | Save contacts, preferences, and session summaries |
| Image Generation | AtlasCloud (ERNIE, FLUX, Imagen 4, Ideogram, GPT-Image), DALL-E 3, Stability AI |
| Deep Research | Multi-source web research with citations |
| Code Execution | Safe sandboxed code runner |
| Computer Use | Browser automation via AI |

### 🔧 Built-in Tools (50+)

| Category | Tools |
|---|---|
| **Web** | Web search, web fetch, deep research |
| **Email & Calendar** | Gmail, Google Calendar |
| **Dev** | GitHub, Linear, Jira, Notion, shell execution |
| **Media** | Image generation, audio/TTS |
| **Finance** | Bybit ticker, positions, wallet |
| **Automation** | Cron jobs, proactive monitoring, uptime alerts |
| **Memory** | Contacts, preferences, session summaries |

### 🔌 LLM Providers

Connect any of these in **Settings → AI Providers**:

OpenAI · Anthropic · Google Gemini · Groq · Mistral · Cohere · Ollama · and more

---

## Architecture

```
┌─────────────────────────────────────────┐
│            OpenAgents Platform           │
├────────────┬────────────┬───────────────┤
│  Web UI    │    API     │    Worker     │
│  Next.js   │   NestJS   │  Background   │
├────────────┴────────────┴───────────────┤
│              Core Services              │
│  Agent Runtime · Tool Engine · Memory  │
├─────────────────────────────────────────┤
│           Data & Infrastructure         │
│    PostgreSQL · Redis · Docker          │
└─────────────────────────────────────────┘
```

---

## Plans

| Plan | Price | Features |
|---|---|---|
| **Starter** | $29/mo | 1 user, self-hosted, all tools |
| **Team** | $49/mo | 5 users, shared workspace, priority support |
| **Business** | $99/mo | Unlimited users, dedicated support, SLA |

All plans run on **your own server**. You own your data.

Contact: [edison0220@gmail.com](mailto:edison0220@gmail.com)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web Frontend | Next.js 14, Tailwind CSS |
| API Backend | NestJS, Prisma ORM |
| Database | PostgreSQL |
| Cache / Queue | Redis, Bull |
| Infrastructure | Docker Compose |

---

## License

OpenAgents is open-source under the [MIT License](LICENSE).

---

<div align="center">

**Built with ❤️ by the OpenAgents Team** · [openagents.us](https://openagents.us)

</div>
