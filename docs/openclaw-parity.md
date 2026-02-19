# OpenClaw Parity Roadmap

This document tracks parity work needed to align OpenAgents behavior with OpenClaw-style runtime flow.

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

## Next parity slices

### 1) Queue-mode continuation parity

- [ ] Worker executes approval continuation jobs end-to-end (not TODO stubs)
- [ ] Idempotency guard to prevent duplicate continuation
- [ ] Retry strategy with dead-letter behavior for persistent failures

### 2) Real connector parity

- [ ] Gmail search + draft via Google OAuth tokens
- [ ] Calendar availability + event creation via Google OAuth tokens
- [ ] Connector health status in dashboard

### 3) Control-plane parity

- [ ] Live event stream for approvals/tool runs across pages
- [ ] Agent run timeline: thinking -> tool -> approval -> done/error
- [ ] Rich audit details for tool inputs/outputs and actor identity

### 4) Reliability parity

- [ ] Deterministic resume after API/worker restart
- [ ] Conversation state repair when run status and messages diverge
- [ ] Backpressure + timeout policies per tool/provider

### 5) UX parity

- [ ] Better approval cards (diff-style input preview + risk labels)
- [ ] Manual re-run for failed tool actions
- [ ] Per-provider model capability hints (tool-calling, context window, latency)

## Implementation order

1. Queue-mode continuation parity
2. Real connector parity
3. Control-plane parity
4. Reliability parity
5. UX parity
