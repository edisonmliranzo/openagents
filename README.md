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

> No coding experience needed. Docker handles everything.  
> First launch takes **5–10 minutes** to build.

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
cd openagents/infra/docker
copy .env.prod.example .env.prod
```

**Step 4 — Start OpenAgents**

```powershell
docker compose -f docker-compose.prod.yml up --build -d
```

**Step 5 — Open your browser**

```
http://localhost:4300
```

Go to **Settings → AI Providers** to add your API key.

---

### 🍎 macOS

**Step 1 — Install Docker Desktop**

👉 [Download Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)

Drag it to your Applications folder, open it, and wait for **"Engine running"**.

**Step 2 — Open Terminal and run these commands**

Press `Cmd + Space`, type **Terminal**, press Enter, then paste:

```bash
git clone https://github.com/edisonmliranzo/openagents.git
cd openagents/infra/docker
cp .env.prod.example .env.prod
```

**Step 3 — Start OpenAgents**

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

**Step 4 — Open your browser**

```
http://localhost:4300
```

Go to **Settings → AI Providers** to add your API key.

---

### 🟠 Ubuntu

**Step 1 — Install Docker** *(one-liner)*

```bash
curl -fsSL https://get.docker.com | sh && sudo systemctl enable --now docker
```

Verify: `docker --version`

**Step 2 — Clone the repository**

```bash
git clone https://github.com/edisonmliranzo/openagents.git
cd openagents/infra/docker
```

**Step 3 — Launch OpenAgents**

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Go to **Settings → AI Providers** to add your API key.

**Open your browser:**

```
http://YOUR_SERVER_IP:4300
```

---

### 🟢 Linux / VPS

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

**Step 3 — Launch**

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Go to **Settings → AI Providers** to add your API key.

**Open your browser:**

```
http://YOUR_SERVER_IP:4300
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
