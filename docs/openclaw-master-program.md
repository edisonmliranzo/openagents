# OpenClaw Master Program

This document turns the OpenClaw-aligned feature backlog into one execution program.

It is intentionally broader than `docs/openclaw-parity.md`:

- `docs/openclaw-parity.md` remains the runtime parity tracker
- `docs/product-expansion-roadmap.md` remains the broad product backlog
- this document is the practical "do it all" build order across parity, trust, reliability, and operator scale

## Program Goals

- Close the remaining OpenClaw-style runtime gaps
- Increase real-world task completion with production-grade connectors
- Make autonomy previewable, repairable, and operator-safe
- Reuse existing primitives instead of adding parallel systems

## Planning Rules

- Ship reliability before more autonomy
- Ship real connector actions before more speculative agent UX
- Reuse approvals, lineage, workflows, handoffs, memory, audit, and notifications
- Every wave must improve at least one of:
  - task completion
  - trust
  - repairability
  - operator collaboration

## Ranked Top 20

| Rank | Initiative | Why it matters | Difficulty | Depends on |
|---|---|---|---|---|
| 1 | Gmail real actions | Converts connector scaffolding into real operator value | M | Google OAuth token health |
| 2 | Calendar real actions | Makes scheduling and external task completion real | M | Google OAuth token health |
| 3 | Run repair center | Fixes stuck runs, orphan approvals, and state divergence | M | current workflow + approval state |
| 4 | Dry-run mode | Lowers fear around autonomy and increases approval conversion | M | tool classification |
| 5 | Replay + branch runs | Makes iteration measurable instead of anecdotal | M | run history + workflow rerun |
| 6 | Approval assignment + SLA | Makes the system usable by teams, not just one operator | M | approval + handoff objects |
| 7 | Connector scope doctor | Removes opaque OAuth failure modes | S | connector health baseline |
| 8 | Tool backpressure + timeout policy | Prevents runaway loops and fragile provider behavior | M | tool execution pipeline |
| 9 | Memory provenance + retrieval reasons | Explains why the agent acted and what it knew | M | memory + audit + lineage |
| 10 | Watcher workflows | Moves OpenAgents from chat-only to monitored automation | L | existing workflow run path |
| 11 | Policy composer | Makes autonomy and approvals administratively controllable | L | risk tiers + approval model |
| 12 | Restore points | Creates reversibility for risky runs | M | workflow state + memory files |
| 13 | Diff-first outbound approvals | Improves confidence for email sends and external writes | S | approval UI |
| 14 | Mobile ops parity | Keeps approvals and failures actionable away from desktop | M | existing mobile shell |
| 15 | Team approvals (N-of-M) | Removes single-operator bottlenecks on sensitive actions | M | approval assignment |
| 16 | Shared operator mode | Adds takeover, notes, and handback for humans in the loop | M | handoff records |
| 17 | Eval-gated workflow publishing | Stops fragile workflow changes from going live | L | workflow versioning |
| 18 | Marketplace trust layer | Makes pack installs safe enough to scale | L | manifest + sandbox contract |
| 19 | Autonomous daily briefing | Turns accumulated data into recurring operator value | M | watchers + connectors |
| 20 | Confidence-based auto-handoff | Makes the agent safer under uncertainty | M | confidence + handoff logic |

## Release Order

### Wave 1: Real Connector Completion

Goal:
Make Gmail and Calendar genuinely useful for end-to-end tasks.

Build:

- Gmail search, thread read, draft, send, labels, attachment metadata
- Calendar free/busy, create, update, cancel, invite handling
- connector scope doctor
- connector-specific approval templates for outbound actions

Why first:

- This closes the biggest remaining gap between demo behavior and real task completion
- It also improves the signal quality of the approval and audit surfaces already built

Success metrics:

- 2x increase in successful connector-backed tasks
- 40% reduction in connector-related failed runs

### Wave 2: Reliability And Repair

Goal:
Make failed runs recoverable instead of terminal.

Build:

- run repair center
- conversation state repair actions
- backpressure + timeout policy per tool/provider
- retry budget and cooldown rules
- better "why this failed" operator diagnostics

Why second:

- Reliability must improve before autonomy expands
- Repairability compounds all later feature value

Success metrics:

- 50% reduction in stuck or orphaned runs
- 30% reduction in operator manual cleanup time

### Wave 3: Preview, Trust, And Reversibility

Goal:
Let users understand actions before they happen and recover after mistakes.

Build:

- dry-run mode
- side-effect classification
- diff-first outbound approval UX
- restore points
- promote dry-run to live-run

Why third:

- This is the fastest path to more user trust without reducing capability
- It should materially increase approval conversion on risky tasks

Success metrics:

- 20% increase in approval conversion
- 30% reduction in abandoned high-risk runs

### Wave 4: Compare, Learn, And Publish Safely

Goal:
Turn one-off runs into an optimization loop.

Build:

- replay + branch runs
- compare outputs, tool traces, cost, latency, and approval counts
- memory provenance + retrieval reasons
- conflict queue for memory facts
- eval-gated workflow publishing

Why fourth:

- Once runs are reliable and previewable, the next leverage point is structured iteration
- This also improves operator trust in memory and workflow changes

Success metrics:

- 30% improvement in workflow iteration speed
- 20% reduction in trust-related complaints

### Wave 5: Team Operator Scale

Goal:
Make OpenAgents workable for multi-person operations.

Build:

- approval assignment + SLA
- comments, notes, and escalation rules
- shared operator mode
- team approvals (N-of-M)
- mobile ops parity

Why fifth:

- Team-scale controls are most valuable after the core runtime is dependable
- This wave should reduce stalls and spread load across humans

Success metrics:

- 50% faster median approval turnaround
- 25% reduction in orphaned approvals

### Wave 6: Programmable Automation

Goal:
Move from reactive assistant to ongoing operations runtime.

Build:

- watcher workflows
- scheduled knowledge sync
- autonomous daily briefing
- channel-native quick actions
- confidence-based auto-handoff

Why sixth:

- This is where OpenAgents starts to behave like an operating system instead of a chat surface
- It should only expand after repair, trust, and operator controls are mature

Success metrics:

- 30% of workflows triggered automatically instead of started manually
- measurable increase in weekly retained operator usage

### Wave 7: Governance And Ecosystem Trust

Goal:
Make customization safer at scale.

Build:

- policy composer
- marketplace trust layer
- sandbox trials for packs
- permission manifests and compatibility validation

Why seventh:

- These features become valuable only after there is enough real automation to govern
- They also protect the system from turning into an unsafe plugin surface

Success metrics:

- increased pack installs without higher rollback rate
- lower rate of unsafe or misconfigured automation publishes

## Immediate Build Sequence

If the team wants the single best sequence to start now, use:

1. Gmail real actions
2. Calendar real actions
3. Connector scope doctor
4. Run repair center
5. Backpressure + timeout policy
6. Dry-run mode
7. Diff-first outbound approvals
8. Replay + branch runs
9. Approval assignment + SLA
10. Memory provenance + retrieval reasons

## First Slice Definitions

### Gmail real actions

First slice:

- search threads
- read thread
- draft reply
- send draft with approval

Do not start with:

- full mailbox management
- filters/rules
- attachment upload/edit flows

### Calendar real actions

First slice:

- free/busy
- create event
- update event
- cancel event

Do not start with:

- complex room/resource booking
- advanced recurring-event editing

### Run repair center

First slice:

- detect missing final agent reply
- detect waiting approval with no live run
- detect run status mismatch
- offer `resume`, `retry`, and `close`

### Dry-run mode

First slice:

- dry-run toggle in chat
- predicted tool list
- predicted approval list
- predicted side-effect summary
- promote same plan to live run

### Replay + branch runs

First slice:

- replay from saved request
- swap provider/model
- compare final answer + tool trace + cost/latency

## Dependency Notes

- Connector scope doctor should land before broad Gmail/Calendar rollout, or connector failures will stay opaque.
- Side-effect classification should be shared by dry-run, approval UI, restore points, and policy composer.
- Run repair should reuse existing workflows, approvals, and lineage instead of inventing another recovery model.
- Replay + branch should share metadata with workflow reruns and agent version history.
- Team approvals should extend the current approval model, not replace it with a second queueing system.
- Marketplace trust work should not start until there is a stable pack manifest and sandbox execution contract.

## Anti-Goals

- Do not build 20 parallel streams at once.
- Do not add more autonomy before repair and trust controls are in place.
- Do not create a second workflow engine for watchers.
- Do not ship outbound connector actions without diff-first approval UX.
- Do not expose marketplace installs without permission metadata and validation.

## Exit Condition

This program is complete when OpenAgents can:

- complete real Gmail and Calendar tasks reliably
- preview and diff risky actions before execution
- repair or resume failed runs without manual DB intervention
- compare alternative runs and publish workflows with guardrails
- support team approvals, handoffs, and mobile response
- run watcher-driven recurring automation safely under policy
