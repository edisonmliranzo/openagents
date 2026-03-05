# Agentic Runtime Implementation (3 + 4 + 9 + 12)

This document captures the implemented scaffold for:

- `3` Memory-tiered agent
- `4` Human-gated autonomy (policy/risk evaluation)
- `9` Self-healing CI pipeline agent
- `12` Data extraction agent

## Services and Responsibilities

1. `memory` module (`/api/v1/memory`)
- Tiered memory writes (`events`), structured facts (`facts`), and retrieval (`query`).
- Supports short-term context + long-term event/fact persistence.

2. `policy` module (`/api/v1/policy`)
- Stateless risk scoring with `auto | confirm | block` decisions.
- Uses action scope, data sensitivity, cost, reversibility, and destructive/credential signals.

3. `extract` module (`/api/v1/extract`)
- Accepts extraction jobs with schema contract.
- Runs schema-guided extraction pipeline and emits confidence + validation issues.
- Supports queue-based processing (`EXTRACTION_PROCESSING_MODE=queue`) or inline fallback.

4. `ci` module (`/api/v1/ci`)
- Accepts CI failure incidents, classifies root-cause class, and proposes remediation.
- Supports queue-based processing (`CI_HEALER_PROCESSING_MODE=queue`) or inline fallback.

## Worker Queues

Defined in `@openagents/shared`:

- Queue names:
  - `approvals`
  - `approvals-dead-letter`
  - `tool-runs`
  - `extraction-jobs`
  - `ci-healer`
- Job names:
  - `approval.resolved`
  - `approval.dead_letter`
  - `extraction.run`
  - `ci_healer.run`

Worker processors call internal API endpoints:

- `POST /api/v1/extract/internal/process`
- `POST /api/v1/ci/internal/process`

## API Contract Summary

### Memory
- `POST /api/v1/memory/query`
- `POST /api/v1/memory/events`
- `GET /api/v1/memory/facts`
- `POST /api/v1/memory/facts`

### Policy
- `POST /api/v1/policy/evaluate`

### Extraction
- `POST /api/v1/extract/jobs`
- `GET /api/v1/extract/jobs`
- `GET /api/v1/extract/jobs/:id`
- Internal: `POST /api/v1/extract/internal/process`

### CI Healer
- `POST /api/v1/ci/failure`
- `GET /api/v1/ci/incidents`
- `GET /api/v1/ci/incidents/:id`
- `POST /api/v1/ci/incidents/:id/process`
- Internal: `POST /api/v1/ci/internal/process`

## Persistence Model

Added Prisma models:

- `MemoryEvent`
- `MemoryFact`
- `ExtractionJob`
- `CiIncident`

Migration:

- `apps/api/prisma/migrations/20260305120000_add_agentic_runtime_tables/migration.sql`

## Security Controls

- User-facing endpoints use JWT where required.
- Internal worker endpoints are token-gated:
  - `x-extraction-worker-token`
  - `x-ci-healer-worker-token`
- Webhook endpoint `POST /ci/failure` supports `x-ci-healer-token` gate.

## Suggested 2-Week Delivery Plan

1. Days 1-2: Deploy schema + shared contracts + baseline API modules.
2. Days 3-4: Enable extraction queue mode and tune schema validation/confidence thresholds.
3. Days 5-6: Calibrate policy scoring; connect high-risk actions to approval workflow.
4. Days 7-8: Expand CI classifier/playbooks with repo-specific heuristics.
5. Days 9-10: Add dashboards for MTTR, auto-fix success rate, and extraction review rate.
6. Days 11-12: End-to-end tests and failure-injection scenarios.
7. Days 13-14: Hardening, runbooks, and staged rollout.

## Remaining Production Gaps

- Extraction logic is intentionally scaffold-level (placeholder extraction + schema checks).
- CI healer currently proposes synthetic patch PR links; real VCS integration is pending.
- Memory retrieval uses heuristic scoring; vector retrieval/embedding storage is pending.
