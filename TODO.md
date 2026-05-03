# OpenAgents Task Tracker
## Completed Steps
- [x] Analyzed repo structure, TODO.md, open tabs, key chat files, docs via tools.
- [x] Reviewed current multi-agent related backend/frontend files:
  - `apps/api/src/agent/parallel-agent.service.ts`
  - `apps/api/src/agent/agent.service.ts`
  - `apps/web/src/components/chat/assistantModes.ts`

## Steps to Complete (from Approved Plan - Multi-Agent Orchestration)
1. [ ] Update `apps/web/src/components/chat/assistantModes.ts`
- [ ] Add new `orchestrate` assistant mode (label/caption/description/prompts/rules) for parallel multi-agent behavior.

2. [ ] Update `apps/api/src/agent/agent.service.ts`
- [ ] Add mode-specific appendix/behavior for orchestration mode.
- [ ] Route orchestration-mode requests through `ParallelAgentService` with 2 parallel branches when task is suitable.
- [ ] Merge branch outputs and emit coherent runtime status updates.

3. [ ] Update `apps/api/src/agent/agent.module.ts` (if needed)
- [ ] Ensure `ParallelAgentService` wiring is correct for orchestration execution path.

4. [ ] Verify
- [ ] Run targeted typecheck/build for affected packages/apps.

