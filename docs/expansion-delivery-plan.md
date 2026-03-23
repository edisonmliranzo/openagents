# Expansion Delivery Plan

This document turns the broader backlog in `docs/product-expansion-roadmap.md` into an executable delivery program.

It assumes the current OpenAgents baseline already exists:

- chat, approvals, workflows, channels, memory, lineage, and control-plane surfaces
- connector scaffolding for Gmail, Calendar, Telegram, Slack, Discord, and WhatsApp
- workflow replay/history, mobile shell, and operator review surfaces
- local/VPS deployment, provider routing, and Ollama model discovery

## Planning Principles

- Ship reliability before more autonomy.
- Prefer features that increase completed real-world tasks over features that only add UI surface.
- Reuse existing primitives: approvals, lineage, workflows, memory, connectors, notifications, and mobile.
- Every release should improve one of:
  - trust
  - task completion
  - repairability
  - operator collaboration

## Suggested Program Order

1. Connector Scope Doctor
2. Watcher Workflows
3. Shared Operator Inbox
4. Scheduled Knowledge Sync
5. Dry-Run Cost Estimator
6. Memory Provenance + Conflict Actions
7. Artifact Diff Center
8. Eval-Gated Workflow Publishing
9. Channel-Native Command Packs
10. Workspace Restore Points
11. Skill Sandbox Trials
12. Autonomous Daily Briefing Agent

## Release Waves

### Wave 1: Reliability + Connector Confidence

Goal:
Reduce failed runs caused by connector misconfiguration and missing privileges.

Features:

- Connector scope doctor
- richer token lifecycle diagnostics
- connector repair actions

Tickets:

- `OA-101` Connector capability matrix per provider and connector
- `OA-102` token expiry and missing-scope diagnostics API
- `OA-103` connector health UI with exact remediation actions
- `OA-104` preflight check before connector tool execution
- `OA-105` audit events for connector failure classification

Acceptance criteria:

- A Gmail or Calendar action blocked by missing OAuth scope returns a specific remediation message instead of a generic tool error.
- Connector health shows token freshness, last success, last failure, and missing required scopes.
- Tool runs can surface `blocked_by_scope`, `expired_token`, `missing_config`, or `provider_error`.
- Operators can trigger re-check without restarting the server.

Success metrics:

- 40% reduction in connector-related failed runs
- 25% reduction in support/debug time for OAuth issues

### Wave 2: Proactive Automation

Goal:
Turn OpenAgents from a reactive chat system into a monitored automation runtime.

Features:

- watcher workflows
- scheduled knowledge sync
- autonomous daily briefing agent

Tickets:

- `OA-201` event/watch model for Gmail, Slack, Telegram, repo, URL, and folder watchers
- `OA-202` trigger-to-workflow execution bridge
- `OA-203` watched folder and repo sync scheduler
- `OA-204` ingestion freshness and failure dashboard
- `OA-205` daily briefing workflow template

Acceptance criteria:

- A user can create a watcher that triggers a workflow when a message, file, or page change matches rules.
- Watched folders and repos re-sync on schedule and expose last success and last error.
- Daily briefing can aggregate inbox, calendar, incidents, and watched-source changes into one summary.
- All triggered runs appear in workflows, lineage, and audit history.

Success metrics:

- 20% of weekly active users create at least one watcher
- 30% of workflows shift from manual start to trigger-based execution

### Wave 3: Trust, Preview, and Reversibility

Goal:
Make autonomous actions understandable before execution and recoverable after mistakes.

Features:

- dry-run cost estimator
- side-effect preview
- workspace restore points

Tickets:

- `OA-301` dry-run flag for chat and workflow execution
- `OA-302` tool-by-tool side-effect classifier
- `OA-303` estimated token/tool cost calculator
- `OA-304` promote dry-run to live-run action
- `OA-305` restore point snapshot for memory files, outputs, and workflow state

Acceptance criteria:

- Users can toggle dry run in chat and workflows.
- Dry run shows predicted tool calls, approval requirements, likely external writes, and rough latency/cost.
- A live run can be launched from the dry-run preview without rebuilding the plan.
- Restore points can revert memory files and generated artifacts for the selected run.

Success metrics:

- 20% increase in approval conversion rate
- 30% reduction in abandoned high-risk runs

### Wave 4: Human Collaboration and Channel Ops

Goal:
Make OpenAgents usable by teams instead of only a single owner.

Features:

- shared operator inbox
- channel-native command packs
- handoff ownership and escalation rules

Tickets:

- `OA-401` assignee model for approvals, handoffs, and repair tasks
- `OA-402` operator notes, comments, and SLA fields
- `OA-403` escalation rules for overdue approvals and failed runs
- `OA-404` richer channel quick actions for Telegram, Slack, Discord, and WhatsApp
- `OA-405` mobile approval action sheet parity

Acceptance criteria:

- Approvals can be assigned to a human with status, due time, and comments.
- Overdue approvals and failed runs can escalate to another queue or operator.
- Channel sessions support `help`, status, and quick operational actions without leaving the channel.
- Mobile supports approve, reject, retry, and resume for assigned work.

Success metrics:

- 50% faster median approval turnaround for team workspaces
- 25% reduction in orphaned approval states

### Wave 5: Explainability, Comparison, and Publishing Gates

Goal:
Let operators understand why the system acted, compare alternatives, and publish safer workflow updates.

Features:

- memory provenance + conflict actions
- artifact diff center
- eval-gated workflow publishing

Tickets:

- `OA-501` retrieval reason badges for memory facts and events
- `OA-502` conflict queue with accept, reject, merge, and expire actions
- `OA-503` diff center for reports, plans, code outputs, and tool traces
- `OA-504` workflow test case runner
- `OA-505` publish gate tied to eval thresholds

Acceptance criteria:

- Memory entries show source, freshness, confidence, and retrieval reason.
- Operators can resolve conflicting memory facts without manual DB edits.
- Two runs can be compared by output, tool trace, latency, approvals, and cost.
- Workflow updates cannot publish when eval thresholds fail.

Success metrics:

- 30% improvement in workflow iteration speed
- 20% reduction in trust-related operator complaints

### Wave 6: Ecosystem Trust and Safe Extensibility

Goal:
Expand installable capabilities without turning the marketplace into a security and quality liability.

Features:

- skill sandbox trials
- marketplace trust layer

Tickets:

- `OA-601` manifest schema for skill permissions and dependencies
- `OA-602` compatibility and endpoint validation before install
- `OA-603` sandbox trial run for marketplace packs
- `OA-604` benchmark badge pipeline
- `OA-605` install trust event logging

Acceptance criteria:

- Every pack declares required permissions, endpoints, and dependencies.
- Users can test a pack in a sandbox before installation.
- Incompatible or unsafe packs fail with explicit reasons.
- Benchmark and verification badges are visible before install.

Success metrics:

- 30% increase in marketplace installs with no corresponding increase in rollback/uninstall rate

## Sprint Structure

Use 2-week sprints with one foundation stream and one product stream.

### Sprint 1

Theme:
Connector confidence

Committed scope:

- `OA-101`
- `OA-102`
- `OA-103`

Stretch:

- `OA-104`

Exit criteria:

- connector diagnostics visible in UI and API
- failure states classified cleanly

### Sprint 2

Theme:
Triggered automation

Committed scope:

- `OA-201`
- `OA-202`
- `OA-203`

Stretch:

- `OA-204`

Exit criteria:

- at least one working watcher path end-to-end
- sync status visible to operators

### Sprint 3

Theme:
Trust before execution

Committed scope:

- `OA-301`
- `OA-302`
- `OA-303`

Stretch:

- `OA-304`

Exit criteria:

- dry-run preview works for chat and workflows
- cost and risk summaries render consistently

### Sprint 4

Theme:
Human operations

Committed scope:

- `OA-401`
- `OA-402`
- `OA-403`

Stretch:

- `OA-404`

Exit criteria:

- assigned approvals and escalations work end-to-end
- operator notes persist to audit history

### Sprint 5

Theme:
Explainability and comparison

Committed scope:

- `OA-501`
- `OA-502`
- `OA-503`

Stretch:

- `OA-504`

Exit criteria:

- memory provenance visible
- run comparison available for at least one workflow and one chat run

### Sprint 6

Theme:
Safe publishing and ecosystem trust

Committed scope:

- `OA-504`
- `OA-505`
- `OA-601`

Stretch:

- `OA-603`

Exit criteria:

- workflow publishing can be blocked by failed evals
- marketplace packs expose permission/trust metadata

## Dependencies

- Connector scope doctor should land before watcher workflows for Gmail/Calendar.
- Side-effect classification should be reused by dry-run mode, policy composer, and approval UI.
- Shared operator inbox should reuse existing approval and handoff objects instead of introducing a separate queue model.
- Memory provenance should share metadata with lineage and audit views.
- Eval-gated publishing depends on stable workflow versioning and replay.
- Marketplace trust features depend on a manifest schema and sandbox execution contract.

## What Not To Do

- Do not build a second workflow engine for watchers. Reuse the existing workflow run path.
- Do not ship marketplace installs without permission metadata and validation.
- Do not add more channel surfaces before operator assignment and repair flows are stable.
- Do not build restore points as a generic filesystem backup system. Scope it to OpenAgents artifacts first.

## Suggested Owners

- Platform:
  - connector diagnostics
  - dry-run engine
  - restore points
  - watcher runtime

- Product/UI:
  - connector health UI
  - operator inbox
  - diff center
  - provenance UX

- Runtime/AI:
  - side-effect classification
  - memory retrieval reasons
  - daily briefing prompt/template
  - eval gate logic

## Metrics Dashboard

Track these across the whole program:

- run success rate
- connector failure rate by type
- approval conversion rate
- approval turnaround time
- replay-to-publish cycle time
- watcher-triggered workflow count
- knowledge sync freshness rate
- memory conflict resolution rate
- marketplace install success rate

## Definition of Done

A feature only counts as delivered when:

- API contract is stable and typed
- UI or channel surface exists where relevant
- audit or lineage visibility exists for the action
- failure states are explicit and repairable
- at least one verification path exists
- docs are updated
