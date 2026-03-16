# Product Expansion Roadmap

This document captures the next-wave feature set for OpenAgents beyond the current MVP pack and OpenClaw parity work.

It assumes the existing platform baseline already exists:

- local-first runtime and hosted control plane
- chat, approvals, tool calls, and live mission control
- file-based memory plus basic persisted memory/event storage
- multi-agent orchestration, marketplace packs, autonomy windows, and channel integrations

## Roadmap Goals

- Increase real-world task completion with production-grade connectors.
- Make agent actions easier to preview, compare, repair, and trust.
- Improve memory quality, workflow authoring, and operator collaboration.
- Expand OpenAgents from a powerful local runtime into a reliable team operating system.

## Now

### 1) Real Connector Actions

- [ ] Gmail search, thread read, draft, send, labels, and attachment metadata via Google OAuth.
- [ ] Calendar free/busy, event create/update/cancel, invite handling, and timezone-safe scheduling.
- [ ] Slack and Discord send/search/reply flows mapped to approval and audit policies.
- [ ] Telegram action parity for outbound task completion and notifications.

First ship slice:

- Gmail search + draft
- Calendar availability + event creation
- connector-specific approval templates for outbound actions
- richer connector health and token scope diagnostics

Why now:

- This closes the biggest gap between demo capability and real operator value.

### 2) Dry-Run Mode

- [ ] Simulate tool plans before execution.
- [ ] Show predicted side effects, external writes, approval requirements, and estimated latency/cost.
- [ ] Let users promote a dry run into a live run from the same plan.

First ship slice:

- dry-run toggle in chat and workflow runs
- tool-by-tool execution preview
- policy/risk summary before live execution
- "run live from this draft" action

Why now:

- This reduces fear around autonomous tools and should improve approval conversion.

### 3) Replay + Branch Runs

- [ ] Replay any conversation or workflow from a saved checkpoint.
- [ ] Branch runs with a different model, policy profile, prompt, or skill pack.
- [ ] Compare outputs, tool traces, cost, latency, and approval counts side by side.

First ship slice:

- replay from saved input or message index
- swap model and provider on branch
- diff final summary and tool trace
- cost/latency comparison card

Why now:

- The platform already has run history, workflows, and agent versions; this turns them into a real iteration loop.

### 4) Run Repair

- [ ] Detect stuck runs, orphaned approvals, connector failures, and message/run state divergence.
- [ ] Offer resume, retry, rewind, or close actions with clear operator guidance.
- [ ] Add repair logs to audit history.

First ship slice:

- background detection for common divergence states
- repair actions for resume and retry
- operator-facing diagnostics panel
- audit trail for every repair attempt

Why now:

- Reliability gaps are already visible in the parity backlog and should be addressed before adding more autonomy.

## Next

### 5) Memory Graph + Provenance

- [ ] Show where every memory item came from, when it was written, and why it was retrieved.
- [ ] Support pin, forget, resolve conflict, expire, and confidence review actions.
- [ ] Visualize links between conversations, captures, channels, files, and facts.

First ship slice:

- provenance fields on memory facts/events
- retrieval reason badges in the UI
- conflict queue with accept/reject/merge actions
- graph view for a conversation or user

### 6) Policy Composer

- [ ] Build approval/autonomy rules by tool, connector, data sensitivity, cost, reversibility, role, and time window.
- [ ] Version policies and preview their impact before publishing.
- [ ] Attach policies to agents, workflows, channels, or tenant-wide defaults.

First ship slice:

- rules editor for tool + channel + risk tier
- draft vs published policy versions
- impact preview against recent audit samples
- scoped assignment to workspace or agent

### 7) Workflow Builder With Eval Gates

- [ ] Create workflows visually from triggers, prompts, tools, approvals, branches, and outputs.
- [ ] Require eval checks before publish or update.
- [ ] Track benchmark, cost, latency, and failure-rate regressions across workflow versions.

First ship slice:

- visual editor for existing workflow primitives
- test case runner with pass/fail output
- publish gate tied to basic eval thresholds
- version history with rollback

### 8) Shared Operator Mode

- [ ] Assign approvals and handoffs to humans with ownership, SLA timers, comments, and escalation rules.
- [ ] Let operators take over a run, leave context, and hand it back to automation.
- [ ] Support team queues and audit-safe collaboration.

First ship slice:

- approval assignee and status fields
- notes/comments on approval and handoff objects
- overdue escalation rules
- manual takeover and release controls

## Later

### 9) Git-Native CI Healer

- [ ] Connect GitHub/GitLab repositories to incidents and remediation runs.
- [ ] Create branches, apply patches, open PRs/MRs, and run checks automatically.
- [ ] Track fix acceptance rate and mean time to repair.

First ship slice:

- GitHub App or PAT-based repo integration
- branch + patch proposal flow
- PR creation after user approval
- CI result ingestion back into incident state

### 10) Local Knowledge Sync

- [ ] Continuously ingest repos, folders, notes, browser captures, and selected docs into structured memory.
- [ ] Refresh on schedule or file change.
- [ ] Expose freshness, source ownership, and ingestion errors.

First ship slice:

- watched local folder and git repo sync
- scheduled refresh jobs
- extraction into memory facts/events
- ingestion status dashboard

### 11) Marketplace Trust Layer

- [ ] Add compatibility checks, dependency manifests, static scans, benchmark badges, and sandbox trials for marketplace packs.
- [ ] Show required permissions, external endpoints, and signing lineage before install.
- [ ] Record install outcomes and trust events in audit logs.

First ship slice:

- manifest schema for permissions and dependencies
- compatibility validation before install
- benchmark badge support
- sandbox import and verification flow

### 12) Mobile Ops

- [ ] Push approvals, incident alerts, and voice summaries to mobile.
- [ ] Allow quick approve/reject/retry/resume actions from the mobile app.
- [ ] Show lightweight run status, notifications, and operator inbox views.

First ship slice:

- push notifications for approvals and failures
- approval action sheet
- incident and run summary screens
- voice summary playback

## Cross-Cutting Enablers

- Stronger connector token lifecycle management and permission introspection
- Durable run checkpointing and idempotent repair primitives
- Eval harnesses for workflows, tool use, and connector actions
- Side-effect classification shared by dry-run, policy, and approval UIs
- Provenance metadata shared by memory, audit, replay, and marketplace systems

## Suggested Delivery Order

1. Real Connector Actions
2. Dry-Run Mode
3. Replay + Branch Runs
4. Run Repair
5. Memory Graph + Provenance
6. Policy Composer
7. Workflow Builder With Eval Gates
8. Shared Operator Mode
9. Git-Native CI Healer
10. Local Knowledge Sync
11. Marketplace Trust Layer
12. Mobile Ops

## Notes

- `docs/openclaw-parity.md` should remain the runtime-parity tracker.
- This document is the broader product expansion backlog.
- Features should move into the parity doc or implementation docs only when active build work begins.
