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

---

## Wave 7: Team & Collaboration Foundation

Goal:
Make OpenAgents usable by more than one person on a shared workspace.

Features:

- shared conversations with role-based access
- agent handoff to human
- team approvals (N-of-M)
- shared memory spaces

Tickets:

- `OA-701` conversation membership model (owner, editor, commenter, viewer roles)
- `OA-702` invite flow — share a conversation by link or email with role assignment
- `OA-703` real-time presence indicators and read receipts in shared conversations
- `OA-704` agent confidence scoring and handoff trigger threshold
- `OA-705` handoff record with full context snapshot (messages, tool results, memory state)
- `OA-706` human assignee notification via channel (Slack, email, mobile push)
- `OA-707` N-of-M approval policy model (require K approvers from a named group)
- `OA-708` team approval queue with per-member vote tracking
- `OA-709` team-scoped memory namespace (org facts, shared files, group SOUL.md)
- `OA-710` permission gates for team memory reads and writes

Acceptance criteria:

- A user can share a conversation with a teammate who can read or comment without triggering agent actions.
- When agent confidence drops below a threshold, a handoff record is created and the assignee is notified.
- A tool requiring team approval is blocked until K members of the configured group have voted.
- Facts written to team memory are visible to all members but not to outside workspaces.

Success metrics:

- 30% of active workspaces have at least 2 members sharing a conversation
- 50% reduction in stalled approvals due to single-person bottlenecks

---

## Wave 8: Agent Intelligence

Goal:
Make the agent more transparent, self-aware, and adaptable about its own outputs.

Features:

- agent self-evaluation
- chain-of-thought visibility
- agent disagreement mode
- automatic skill suggestion

Tickets:

- `OA-801` post-task self-eval prompt: score output on accuracy, completeness, confidence (0–1)
- `OA-802` low-confidence flag surfaced in chat UI with explanation and suggested follow-up
- `OA-803` extended thinking block extraction from Anthropic and compatible model responses
- `OA-804` collapsible thinking block renderer in chat with token count and duration
- `OA-805` parallel LLM runner for disagreement mode — same prompt, two models
- `OA-806` diff view for two model responses with highlighted divergence points
- `OA-807` disagreement mode toggle in chat settings and per-conversation
- `OA-808` intent classifier for unresolved user requests
- `OA-809` skill gap detector — match intent to skill registry and surface install suggestions
- `OA-810` suggestion card in chat UI with one-click install from marketplace

Acceptance criteria:

- After each agent response, a confidence score and short self-critique are optionally visible.
- Thinking blocks from extended-thinking models render inline and collapse cleanly.
- Disagreement mode runs two models in parallel and shows where their answers diverge.
- When a user asks for something no installed tool covers, a relevant skill pack is suggested.

Success metrics:

- 20% increase in users clicking through on low-confidence flags
- 15% of disagreement-mode sessions result in a model preference change

---

## Wave 9: Workflow Power

Goal:
Make workflow creation visual, conversational, and event-reactive.

Features:

- visual workflow builder
- workflow templates from conversation
- event-driven triggers
- workflow diff viewer

Tickets:

- `OA-901` canvas-based drag-and-drop workflow graph editor (nodes, edges, step config panels)
- `OA-902` node palette: agent_prompt, tool_call, delay, branch_condition, wait_approval, set_state
- `OA-903` live validation and type-safe connection rules between node types
- `OA-904` export canvas state to existing WorkflowDefinition JSON schema
- `OA-905` "create workflow from this conversation" button with LLM-assisted step extraction
- `OA-906` extracted workflow preview with editable steps before saving
- `OA-907` connector event webhook listener (Gmail new message, Slack mention, calendar invite)
- `OA-908` event filter rules (from, subject pattern, channel, label) before trigger fires
- `OA-909` event trigger record in lineage and workflow run history
- `OA-910` side-by-side run diff UI: output, tool trace, latency, approval count, estimated cost

Acceptance criteria:

- Users can build a complete workflow visually without editing JSON.
- A conversation can be converted to a workflow draft in one action.
- A workflow can be triggered by an incoming Gmail message matching a filter rule.
- Two workflow runs can be compared side by side across all dimensions.

Success metrics:

- 40% of new workflows created via visual builder rather than JSON
- 25% of workflows shift to event-driven triggers within 30 days of Wave 9 shipping

---

## Wave 10: Memory & Knowledge

Goal:
Make memory searchable, self-maintaining, and enrichable from documents.

Features:

- semantic memory search
- memory decay and refresh
- document ingestion
- memory diff on conversation end

Tickets:

- `OA-1001` pgvector extension and embedding column on memory_events and memory_facts
- `OA-1002` embedding pipeline: generate and store vectors on write, re-embed on update
- `OA-1003` semantic search endpoint replacing or augmenting exact-match memory queries
- `OA-1004` search UI in /memory with natural-language query and ranked results
- `OA-1005` freshness decay function: lower confidence score on facts not refreshed within TTL
- `OA-1006` refresh worker: re-query source connectors for stale facts on schedule
- `OA-1007` staleness indicator in memory UI with refresh-now action
- `OA-1008` file upload endpoint accepting PDF, DOCX, TXT, Markdown
- `OA-1009` extraction pipeline: parse content, chunk, embed, and write to memory_events
- `OA-1010` drag-and-drop document upload in chat and /memory with ingestion status
- `OA-1011` conversation-end diff: compare memory state before and after a session
- `OA-1012` "what was learned" summary card shown at conversation close

Acceptance criteria:

- A natural-language query in /memory returns semantically relevant facts even without keyword overlap.
- Facts older than a configurable TTL are flagged stale and queued for refresh.
- Dropping a PDF into the chat parses it into memory facts within 30 seconds.
- At the end of a conversation, a diff shows which facts were added, changed, or confirmed.

Success metrics:

- 35% increase in memory fact retrieval accuracy vs. keyword search baseline
- 50% of users upload at least one document within a week of Wave 10 shipping

---

## Wave 11: Safety & Observability

Goal:
Add budget guardrails, one-click replay, anomaly detection, and adversarial testing.

Features:

- cost budget per workflow
- approval replay
- anomaly alerts
- red-team mode

Tickets:

- `OA-1101` per-workflow cost budget field (USD, token units, or tool-call count)
- `OA-1102` real-time cost accumulator during workflow runs with hard-stop at budget
- `OA-1103` budget exhaustion event in lineage and operator notification
- `OA-1104` "replay this approval" action in lineage view — re-run tool with original inputs
- `OA-1105` replay record linked to original approval with diff of inputs and outputs
- `OA-1106` tool call baseline tracker: rolling 7-day average per tool per user
- `OA-1107` anomaly detector: flag runs where a tool call count exceeds 3x baseline
- `OA-1108` anomaly alert surface in operator dashboard and mobile push
- `OA-1109` red-team mode: adversarial input test runner for workflows
- `OA-1110` built-in adversarial cases: prompt injection, policy bypass, data exfiltration probes
- `OA-1111` red-team report: which steps failed, which held, recommended hardening actions

Acceptance criteria:

- A workflow with a $0.50 budget stops mid-run and records a budget_exhausted event.
- An approved tool action can be replayed from lineage with one click, producing a comparable diff.
- A tool called 10x its baseline triggers an anomaly alert within one minute.
- Red-team mode produces a pass/fail report for a workflow against a standard adversarial suite.

Success metrics:

- 25% reduction in runaway LLM cost incidents
- Red-team report used on 50% of published workflows within 30 days

---

## Wave 12: UX & Productivity

Goal:
Speed up everyday interactions with power-user shortcuts, persistent context, and mobile parity.

Features:

- slash command palette
- pinned context
- response presets
- mobile push for approvals

Tickets:

- `OA-1201` slash command parser in chat input: /search, /summarize, /draft, /workflow, /memory
- `OA-1202` command palette modal with fuzzy search, keyboard nav, and recent commands
- `OA-1203` extensible command registry so skill packs can register new slash commands
- `OA-1204` pinned context panel in chat: attach files, URLs, or memory facts per conversation
- `OA-1205` pinned items injected as system context on every message in the conversation
- `OA-1206` pin/unpin action in chat and visible indicator in conversation header
- `OA-1207` response preset editor: save a prompt template with name, shortcut key, and scope
- `OA-1208` preset picker in chat input with per-conversation and global presets
- `OA-1209` mobile push notification service (FCM for Android, APNs for iOS)
- `OA-1210` push trigger on approval created, escalated, or overdue events
- `OA-1211` mobile approval action sheet: approve, deny, request changes with comment

Acceptance criteria:

- Typing /sum in chat opens a palette, selects /summarize, and executes the command.
- A pinned URL is included in the agent's context for the life of the conversation.
- A saved response preset can be applied in one tap, pre-filling the chat input.
- A mobile user receives a push notification within 10 seconds of an approval being created.

Success metrics:

- 30% of active users adopt slash commands within 2 weeks of Wave 12 shipping
- Mobile approval turnaround time drops by 40%

---

## Wave 13: Integrations & Platform

Goal:
Expand connector coverage, close the webhook loop, and make integration self-service.

Features:

- GitHub connector
- Notion, Linear, and Jira sync
- webhook outbox
- OAuth app store

Tickets:

- `OA-1301` GitHub connector: create issue, create PR, add comment, list open PRs, get file
- `OA-1302` GitHub OAuth flow and token lifecycle management
- `OA-1303` Notion connector: read/write pages and databases as memory sources or tool targets
- `OA-1304` Linear connector: create issue, update status, assign, list by project
- `OA-1305` Jira connector: create ticket, transition, comment, query by JQL
- `OA-1306` webhook outbox: configurable POST on workflow completion with signed payload
- `OA-1307` outbox delivery log with retry, status, and response inspection
- `OA-1308` OAuth app store UI: browsable catalog of connectors with install, configure, revoke
- `OA-1309` connector manifest schema: required scopes, endpoints, auth type, rate limits
- `OA-1310` self-service connector install flow with scope request and health check on connect

Acceptance criteria:

- An agent can open a GitHub issue or comment on a PR as a gated tool action.
- A workflow can write a completed task to a Linear project and a Notion database.
- After every workflow run, a signed webhook fires to a user-configured URL with the run result.
- The OAuth app store lists all available connectors and allows installation without a deploy.

Success metrics:

- GitHub and Notion connectors each used by 20% of active workspaces within 60 days
- Webhook outbox used by 30% of production workflows
- OAuth app store reduces connector setup support tickets by 40%

---

## Updated Sprint Structure (Waves 7–13)

### Sprint 7 — Team foundation
Committed: OA-701, OA-702, OA-704, OA-705
Stretch: OA-707, OA-709
Exit: shared conversations live, handoff record created on low confidence

### Sprint 8 — Team approvals + shared memory
Committed: OA-707, OA-708, OA-709, OA-710
Stretch: OA-703, OA-706
Exit: N-of-M approvals block and notify, team memory scoped correctly

### Sprint 9 — Agent transparency
Committed: OA-801, OA-802, OA-803, OA-804
Stretch: OA-808, OA-809
Exit: self-eval score visible, thinking blocks render and collapse

### Sprint 10 — Disagreement + skill suggestion
Committed: OA-805, OA-806, OA-807, OA-809, OA-810
Exit: disagreement mode produces side-by-side diff, skill suggestion appears in chat

### Sprint 11 — Visual workflow builder
Committed: OA-901, OA-902, OA-903, OA-904
Stretch: OA-905, OA-906
Exit: complete workflow buildable visually, exports to valid WorkflowDefinition

### Sprint 12 — Event triggers + workflow diff
Committed: OA-907, OA-908, OA-909, OA-910
Stretch: OA-905, OA-906
Exit: Gmail trigger fires a workflow end-to-end, diff UI shows two runs

### Sprint 13 — Memory embeddings + document ingestion
Committed: OA-1001, OA-1002, OA-1003, OA-1008, OA-1009
Stretch: OA-1004, OA-1010
Exit: semantic search returns ranked results, PDF ingested to memory facts

### Sprint 14 — Memory decay + conversation diff
Committed: OA-1005, OA-1006, OA-1007, OA-1011, OA-1012
Exit: stale facts flagged and refreshed, end-of-conversation diff shown

### Sprint 15 — Cost budgets + replay + anomaly
Committed: OA-1101, OA-1102, OA-1103, OA-1104, OA-1106, OA-1107
Stretch: OA-1108
Exit: budget hard-stop works, replay creates diff record, anomaly alert fires

### Sprint 16 — Red-team mode
Committed: OA-1109, OA-1110, OA-1111
Exit: red-team report generated for a sample workflow with pass/fail per probe

### Sprint 17 — Slash commands + pinned context
Committed: OA-1201, OA-1202, OA-1204, OA-1205, OA-1206
Stretch: OA-1203
Exit: /summarize works end-to-end, pinned URL injected into context

### Sprint 18 — Presets + mobile push
Committed: OA-1207, OA-1208, OA-1209, OA-1210, OA-1211
Exit: preset applied in one tap, push notification arrives within 10 seconds

### Sprint 19 — GitHub + webhook outbox
Committed: OA-1301, OA-1302, OA-1306, OA-1307
Exit: GitHub issue creation works as a tool, webhook fires on workflow complete

### Sprint 20 — Notion, Linear, Jira + OAuth app store
Committed: OA-1303, OA-1304, OA-1308, OA-1309, OA-1310
Stretch: OA-1305
Exit: Notion and Linear connectors installable from app store, self-service flow works
