# MVP Feature Pack

This document covers the five shipped MVP features:

1. Skill Signing
2. Multi-Agent Orchestration
3. Voice Interface
4. Browser Capture Extension
5. Scheduled Autonomy Windows

## 1) Skill Signing

Marketplace packs are now cryptographically signed (HMAC-SHA256).

- Signing env vars:
  - `SKILL_SIGNING_SECRET` (recommended in production)
  - `SKILL_SIGNING_KEY_ID` (optional display key id)
- API:
  - `GET /api/v1/nanobot/marketplace/packs` returns `signature` and `signatureVerified`
  - `POST /api/v1/nanobot/marketplace/export` exports signed pack JSON
  - `POST /api/v1/nanobot/marketplace/verify` verifies a signed pack payload
  - `POST /api/v1/nanobot/marketplace/import` imports only if signature is valid

## 2) Multi-Agent Orchestration

OpenAgent runs now maintain shared planner/executor/reviewer state with run timeline.

- Shared state includes:
  - plan steps
  - critic concerns
  - tool log
  - final summary
- API:
  - `GET /api/v1/nanobot/orchestration/runs?limit=20`
  - `GET /api/v1/nanobot/orchestration/runs/:runId`
- `GET /api/v1/nanobot/health` now includes latest `orchestration` runs.

## 3) Voice Interface

### Web UI

Chat now supports:

- speech-to-text microphone input (browser Web Speech API)
- optional spoken agent replies (browser speech synthesis)

### API (MVP)

- `POST /api/v1/nanobot/voice/transcribe`
- `POST /api/v1/nanobot/voice/speak`

The API endpoints provide a local MVP layer for transcript/speech payload handling.

## 4) Browser Capture Extension

A load-unpacked extension is included at:

- `extensions/browser-capture/`

It sends selected page text to:

- `POST /api/v1/memory/capture`

Capture payload supports optional `conversationId`, so content can be stored in memory and pushed as a chat/task input.

## 5) Scheduled Autonomy Windows

Autonomous tool actions are restricted to configured windows.
Outside allowed windows, non-approval tools are converted into approval requests.

- API:
  - `GET /api/v1/nanobot/autonomy/windows`
  - `PUT /api/v1/nanobot/autonomy/windows`
  - `GET /api/v1/nanobot/autonomy/status`
- UI:
  - OpenAgent page includes a **Scheduled Autonomy Windows** JSON editor.

Example schedule payload:

```json
{
  "enabled": true,
  "timezone": "America/New_York",
  "windows": [
    { "label": "weekday-core", "days": [1, 2, 3, 4, 5], "start": "09:00", "end": "17:30" },
    { "label": "weekend-maintenance", "days": [6], "start": "10:00", "end": "13:00" }
  ]
}
```
