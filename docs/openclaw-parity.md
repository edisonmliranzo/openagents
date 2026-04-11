# OpenClaw Parity Roadmap

This document tracks parity work needed to align OpenAgents behavior with OpenClaw-style runtime flow.

For the broader ranked execution program across parity, trust, repair, and operator scale, see `docs/openclaw-master-program.md`.

## Recently completed

- [x] Ollama model picker loads installed local models from Ollama server.
- [x] Saved preferred model is now applied during runtime (agent + nanobot paths).
- [x] Approved actions now continue automatically in API inline mode:
  - Executes approved tool
  - Updates tool message with result
  - Appends agent follow-up message
  - Resolves waiting agent runs
  - Creates completion/failure notifications
- [x] OpenClaw-style core tools added:
  - `web_search`
  - `get_current_time`
  - `cron_add`
  - `cron_list`
  - `cron_remove`
- [x] File-based memory artifacts exposed via API/UI:
  - `SOUL.md`
  - `USER.md`
  - `MEMORY.md`
  - `HEARTBEAT.md`
  - `cron.json`
  - Daily notes `YYYY-MM-DD.md`
  - Chat logs `tg_<conversationId>.jsonl`
- [x] Agent now performs multi-round tool loops (ReAct-style rounds, capped by `AGENT_MAX_TOOL_ROUNDS`).
- [x] Mission Control now supports live SSE updates with run/tool/approval events.
- [x] Approval UI now includes structured risk labels, policy/autonomy context, and input previews.
- [x] Workflow runs now support rerun from saved input and persist resume cursors for restart recovery.
- [x] Config UI now shows provider/model routing capability hints.
- [x] Audit and memory UIs now expose drilldowns, review queue, and conflict governance.
- [x] Research tools now auto-discover site `llms.txt` guidance during `web_fetch` / `deep_research` when publishers expose it.
- [x] Memory query now supports diversified recall plus temporal decay tuning for fresher search results.

## Next parity slices

### 1) Queue-mode continuation parity

- [x] Worker executes approval continuation jobs end-to-end (not TODO stubs)
- [x] Idempotency guard to prevent duplicate continuation
- [x] Retry strategy with dead-letter behavior for persistent failures

### 2) Real connector parity

- [ ] Gmail search + draft via Google OAuth tokens
- [ ] Calendar availability + event creation via Google OAuth tokens
- [x] Connector health status in dashboard

### 3) Control-plane parity

- [x] Live event stream for approvals/tool runs across pages
- [x] Agent run timeline: thinking -> tool -> approval -> done/error
- [x] Rich audit details for tool inputs/outputs and actor identity

### 4) Reliability parity

- [x] Deterministic resume after API/worker restart (workflow runs + approved inline continuations)
- [ ] Conversation state repair when run status and messages diverge
- [ ] Backpressure + timeout policies per tool/provider

### 5) UX parity

- [x] Better approval cards (diff-style input preview + risk labels)
- [x] Manual re-run for failed workflow runs
- [x] Per-provider model capability hints (tool-calling, context window, latency)

## Implementation order

1. Queue-mode continuation parity
2. Real connector parity
3. Control-plane parity
4. Reliability parity
5. UX parity
