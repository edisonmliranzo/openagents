# OpenAgents Enhancement & Implementation Plan

> **Audited against the working tree on 2026-10-20** (post-`02566e2` "18 frontier features").
> Legend: ✅ shipped **and** wired · 🟡 partial / stub / in-memory-only · ⛔ not implemented · 🔴 shipped but **broken**

---

## 📊 Status Snapshot

| Area | ✅ | 🟡 | ⛔ | 🔴 |
|---|---|---|---|---|
| Backend API (87 Nest modules, 442 TS files) | 9 | 14 | 8 | 3 |
| Web app (Next.js, 79 pages) | 6 | 8 | 8 | 9 |
| Desktop / Mobile | 1 | 2 | 2 | 0 |

**Reality check:** the feature surface looks ~85% complete, but a meaningful slice of it is stubbed or
in-memory-only. The two highest-leverage workstreams right now are **Phase 15 (make it real)** and
**Phase 16 (make it visible)**.

---

## 🔴 Phase 15: Shipped but Broken — Fix First

> **Status 2026-10-20 — round 1 landed.** Everything under "Fixed" below has been implemented
> and verified against the running API + Postgres. See `apps/api/src/common/normalize-nan.pipe.ts`
> and the new regression tests (`stripe-signature.test.ts`, `normalize-nan.pipe.test.ts`).

### ✅ FIXED — P0 Security / money / correctness
- [x] **Stripe webhook signatures are always rejected** ✅
  `apps/api/src/main.ts:54` — `NestFactory.create(AppModule)` is missing `{ rawBody: true }`, but
  `billing.service.ts:204` throws `BadRequestException('Raw body unavailable…')` whenever `req.rawBody`
  is absent. **Every** Stripe webhook fails. Same root cause kills Slack (`slack.controller.ts:80`) and
  Discord (`discord.controller.ts:85`) signature verification — they fall back to `JSON.stringify(payload)`
  which never matches the HMAC.
  → **Fixed**: `NestFactory.create(AppModule, { rawBody: true })`. Verified with a live Nest harness
  (`req.rawBody` is a Buffer holding the exact raw bytes). Signature math extracted into a pure,
  testable function at `apps/api/src/billing/stripe-signature.ts`.
- [x] **Anomaly detection uses a hard-coded baseline** ✅
  `apps/api/src/anomaly/anomaly.service.ts:69` — `const historicalValues = [10, 15, 12, 18, 9]`.
  `baselineWindowDays` is ignored, so percentile/severity are meaningless. `triggerAlerts()` (`:117`) only
  `console.log`s — no push, no email. No scheduled detector exists (`POST /anomaly/detect` only).
  → **Fixed**: baselines are now real per-day aggregates from `MetricLog` (one measure per anomaly
  type, partial days excluded), `expectedRange` is the observed historical min/max, alerts fan out to
  in-app notifications + web-push, and a per-measure `minDelta` stops near-zero baselines producing noise.
- [x] **Unsandboxed agent-generated iframe** ✅
  `apps/web/src/components/chat/GenerativeUIWidget.tsx:68` — `sandbox="allow-scripts allow-same-origin"`
  on a `srcdoc` iframe = same-origin script access. `creations/page.tsx:123` correctly uses `sandbox=""`.
  Also hot-loads React/Babel/Tailwind from unpkg at runtime.
  → **Fixed**: `allow-scripts` only (opaque origin, no parent access) + `referrerPolicy="no-referrer"`.

### ✅ FIXED — P1 Data / correctness
- [x] **Conversation search silently misses old messages** ✅
  `apps/api/src/conversation-search/search.service.ts:51-71` — the `whereClause` has **no `content` filter**
  (despite the comment "Use Prisma full-text search with PostgreSQL"). It fetches the newest ≤200 messages
  and filters `content.includes(term)` **in the API process**. `total` is the truncated count, not a real count.
  → **Fixed**: real Postgres full-text search (`to_tsvector` / `plainto_tsquery` / `ts_rank` /
  `ts_headline`) with a true `COUNT(*)`, plus an idempotent GIN index created on boot
  (`Message_content_fulltext_idx`) and a portable substring fallback. Snippets now carry
  `snippetParts` (plain text + `match` flags) so the UI can highlight without injecting HTML.
- [x] **Duplicate `/conversations/search` route** ✅
  Registered twice with different response shapes: `conversation-search/search.controller.ts:5`
  (`@Controller('conversations/search')` → object) **and** `conversations/conversations.controller.ts:200`
  (`@Get('search')` → array). Winner depends on module registration order. Keep one, delete the other.
  → **Fixed**: the richer `ConversationSearchModule` route is the single source of truth; the duplicate
  controller route and its dead service method were removed. The SDK now returns the typed object.
- [ ] **`scheduler/` is a no-op duplicate of `cron/`** *(still open)*
  `apps/api/src/scheduler/scheduler.service.ts:103` — `executeTask()` only increments `runCount`; it never
  runs the task. `calculateNextRun()` supports only `every N<m|h|d>`, no cron expressions.
  Meanwhile `apps/api/src/cron/cron-scheduler.service.ts` has a **real** 5-field cron evaluator.
  Consolidate: delete `scheduler/` or re-implement it on top of `cron/`.
- [x] **Cron `deliveryMode` / `deliveryTarget` are written but never read** ✅
  `apps/api/src/cron/cron.service.ts:42-43` stores them; every executor hard-codes `deliveryMode: 'none'`
  (`cron.tool.ts:74`, `proactive.tool.ts:70,137,206,270`). Scheduled runs never reach email/Slack/webhook.
  → **Fixed**: `announce` posts the agent's real reply as an in-app notification; `webhook` sends a
  signed (optional `CRON_WEBHOOK_SECRET` HMAC) POST to `deliveryTarget`, SSRF-guarded.
- [x] **Vision service returns a hard-coded placeholder** ✅
  `apps/api/src/vision/vision.service.ts:35-43` — `analyzeImage()` returns
  `"Image analysis requested: ${analysisPrompt}"` with empty labels/objects/colors. No controller, no caller.
  → **Fixed**: `analyzeImage()` now resolves the image to a `data:` URL (base64 passthrough or an
  SSRF-guarded remote fetch via `frontier/safe-fetch.ts`), calls the user's configured provider through
  `LLMService.complete()` (reusing the existing `parseMultimodalContent` path), and parses a structured
  JSON answer. New route: `POST /api/v1/vision/analyze`.
- [x] **Tool Builder `script` and `chain` execution are stubs** ✅
  `apps/api/src/tool-builder/tool-builder.service.ts:100-113` — `script` returns
  `'Script execution requires sandbox setup'` without running; `chain` returns `'Tool chain execution'`
  and never invokes a single tool. Custom tools are also **never registered** with `tools.service.ts`.
  → **Fixed**: both execute for real, and custom tools are registered with the agent's tool registry.
- [ ] **Code execution runs unsandboxed on the API host** *(still open)*
  `apps/api/src/tools/connectors/code-execution.tool.ts` — real `spawn()` of python3/node, temp file in
  `os.tmpdir()`, env scrubbing (good), but **no container/VM isolation, no egress control, no syscall filter**.
  `shell.tool.ts` has a directory jail + blocked-command patterns, but still runs in-process as the API user.
- [ ] **Local daemon never executes anything** *(still open)*
  `apps/api/src/local-daemon/local-daemon.service.ts:38-39` — returns a canned
  `"Executed ${command} successfully on ${conn.hostname}"`. No transport, no handshake, no allow-list.
- [x] **War Rooms has no consensus algorithm** ✅
  `apps/api/src/war-rooms/war-rooms.service.ts:39-55` — `broadcastMessage()` appends to a transcript without
  invoking any agent; `concludeRoom()` just flips a status string.
  → **Fixed**: the room now runs a real multi-model debate and scores the consensus deterministically.
- [x] **Generative UI has no producer and no persistence** *(partly fixed)*
  `apps/api/src/generative-ui/generative-ui.service.ts` — in-memory `Map`, `state` hard-coded to `'ready'`,
  no agent tool emits React code, no auth/ownership check on any route.
  → The iframe is now properly sandboxed, but the module still has no producer, no persistence and no
  ownership checks. Still open.
- [ ] **WebRTC media transport returns 501** *(still open)*
  `apps/api/src/webrtc-voice/webrtc-voice.service.ts:63` — `processAnswer()` throws
  `NotImplementedException`. No LiveKit/TURN/ICE. (The working hands-free voice path is Web Speech API →
  `/api/v1/nanobot/voice/transcribe` → `/api/v1/life/tts`, which **is** implemented and used.)

### ✅ FIXED — Frontend calls non-existent routes
`apps/api/src/main.ts:66` sets the global prefix `api/v1`, so every call needs `/api/v1/...`.

- [x] `apps/web/src/app/(app)/control/ab-testing/page.tsx:45,58` → `/api/ab-tests` → **404**
- [x] `apps/web/src/app/(app)/control/apikeys/page.tsx:24,39` → `/api/apikeys/health|rotate` → **404**
- [x] `apps/web/src/app/(app)/control/export/page.tsx:21,22,31,40` → `/api/export/*` → **404**
- [x] `apps/web/src/components/branch-button.tsx:25` → `/api/agent/branch` → **404** (+ wrong response shape)
- [x] `apps/web/src/app/(app)/agent/versions/page.tsx` — **all 4** SDK calls map to routes that don't exist
      (`GET /agent-versions` root missing, `POST /agent-versions` root missing,
      `/agent-versions/diff` → controller exposes `GET compare/:fromId/:toId`,
      `POST /agent-versions/:id/rollback` → controller exposes `POST :agentId/rollback/:versionId`)
- [x] `apps/web/src/app/(app)/control/inbox/page.tsx:123` → links `/chat?conversationId=…`, chat reads `?conversation`

### ✅ FIXED — Tool Builder actually executes
`script` and `chain` were stubs that returned a placeholder string and never ran anything.
- [x] **`script` runs for real** through the shared code-execution sandbox (child process, scrubbed
      environment, timeout, output cap). The script receives `input` and its stdout is the result.
- [x] **`chain` runs real tools in order** via `ToolsService.execute`, with `{{step0.output.foo}}`
      references resolved against earlier steps (whole-value references keep their type; references
      embedded in a larger string are interpolated into it).
- [x] **`http` is SSRF-guarded** (private addresses blocked), has a timeout, and supports a
      `{{param}}` body template.
- [x] **Custom tools are registered with the agent** (`ToolsService.registerDynamicTool`) — they now
      show up in the agent's tool list and the agent can call them.
- [x] **Ownership is enforced** — the controller takes the owner from the token (it used to trust
      `body.userId`, which let anyone impersonate another user) and every route checks it.
- [x] **Implementations are validated on create/update** (a script tool needs code, a chain needs steps).

### ✅ FIXED — War Rooms have a real consensus
- [x] **War Rooms are persisted** (new `WarRoom` / `WarRoomMessage` Prisma models) instead of living
      in an in-memory `Map` that vanished on restart.
- [x] **`POST /war-rooms/:id/run` runs a real multi-model debate** through `MultiDebateService`
      (independent answers → cross-critique → judge verdict), and the whole exchange is written to
      the transcript. It used to append text to an array without invoking a single agent.
- [x] **Deterministic consensus score** — `apps/api/src/war-rooms/consensus.ts` scores mean pairwise
      Jaccard similarity over the content words of each contribution (7 unit tests). No LLM involved,
      so the score is explainable and reproducible.
- [x] The judge's verdict is surfaced on the room, and the `/teams` page shows the consensus score
      plus a "Run debate" button.

### ✅ FIXED — Generative UI was effectively unsandboxed
`apps/web/src/components/chat/GenerativeUIWidget.tsx` used `sandbox="allow-scripts allow-same-origin"`
on a `srcdoc` iframe. Because `srcdoc` inherits the parent origin, that combination handed
agent-generated code full access to the OpenAgents document (cookies, localStorage, DOM) — stored XSS.
- [x] The frame is now sandboxed with **`allow-scripts` only** (opaque origin, no parent access),
      plus `referrerPolicy="no-referrer"`.
- [x] The dead "View Source" button now toggles the generated code.

### ✅ FIXED — Pins & Reactions are persistent and scoped
- [x] **New Prisma models** `PinnedMessage` and `MessageReaction` — both were in-memory `Map`s, so
      pins and reactions vanished on every restart.
- [x] **`userId` is taken from the token**, never from the request body. The old controllers passed
      `body.userId` straight through, which let a caller act as (or read the data of) another user.
- [x] **`POST /reactions/toggle`** adds or removes a reaction and returns the new counts.
- [x] **`GET /reactions/message/:id/counts`** returns both the counts and the caller's own reactions.
- [x] Invalid emoji now returns 400 (it was a 404 from a `NotFoundException`).

### ✅ FIXED — The four missing frontends
- [x] **Conversation search** — `apps/web/src/components/muse/ConversationSearchPanel.tsx` replaces the
      title-only client filter with real full-text search over the whole history, with highlighted
      snippets (the API returns `snippetParts` as plain text — no HTML is ever injected).
- [x] **Pins panel** — the same panel has a Pins tab listing pinned messages with their content.
- [x] **Reactions + pin toggle on messages** — `apps/web/src/components/chat/MessageFeedbackRow.tsx`
      renders reaction chips with counts, an emoji picker and a pin toggle.
- [x] **Templates launcher** — `apps/web/src/components/chat/TemplateLauncher.tsx` starts a chat from
      any of the built-in kits (research, code, content, business, learning, project management).
- [x] **SDK** — new `pins`, `reactions` and `templates` namespaces.

### ✅ FIXED — Background execution can actually act (the goal worker)
The long-horizon goal worker was the weakest link in the loop: its own docstring said
*"The worker only drafts work with the LLM (no tools), so it cannot take actions."*
A goal step like "find 5 leads and email them" produced **a draft of an email**, never an email.
- [x] **The worker now runs the agent**, not a bare LLM call — so a step uses tools and genuinely
      completes its task. Each goal gets its own isolated conversation (`Goal: <title>`).
- [x] **The step-level approval gate is intact** — a step the planner flags as risky still waits for
      explicit user approval before it runs (`approvalKind: 'plan'`).
- [x] **The tool-level approval gate is intact on top of it** — if the agent hits a tool that needs
      approval mid-run, the step pauses (`approvalKind: 'tool'`), the approvals queue owns the
      decision, and the step completes once it is resolved.
- [x] **Fixed a bug that meant background execution never worked at all**: the goal planner called
      the LLM *without the user's stored API key*, so every call fell back to the default provider
      and failed. It now resolves the key the same way the agent does.
- [x] **Verified live**: a goal step called `get_current_time` **and** `notes_create` — the note was
      really created — then summarised what it did.

### ✅ FIXED — Streaming can never break a request
- [x] Some providers (NVIDIA NIM) return a 500 when a streamed request asks for tool calls.
      `LLMService.streamWithFallback` retries the same call without streaming, so streaming stays an
      enhancement rather than a hard requirement.

### ✅ FIXED — The JSON-file stores are gone
Thirteen features kept their state in a JSON file on disk (`apps/api/data/<feature>/<userId>.json`).
That meant: state lost on restart, no transactions, no multi-instance safety, and nothing in the
backups. All of them are in Postgres now.
- [x] **A generic `UserDocument` table** (`userId`, `kind`, `key`, `data`) plus a `DocumentStore`
      service in `apps/api/src/prisma/document-store.service.ts`. Per-user documents keep a real
      foreign key to `User`; global indexes (slug → owner, call id → owner) live in a separate
      `GlobalDocument` table so they don't have to borrow a user id.
- [x] **Migrated to the document store**: graph · briefing · email autopilot · moments · lessons ·
      goal plans · cost router · phone calls · public agents (+ slug index) · research jobs ·
      recorded browser workflows · conversation trees · workspace threads.
- [x] **Migrated to proper relational models**: billing (`UserBilling` + `BillingCustomer`) and the
      marketplace (`MarketplacePrice` + `MarketplacePurchase` + `MarketplaceEarning`). Money in a
      JSON file could be lost; purchases and the earnings ledger are now transactional.
- [x] **Migrated to relational models**: handoffs · data lineage · skill reputation · mission control ·
      playbooks · workflows · **push subscriptions** (`PushSubscription`) · **Expo push tokens**
      (`ExpoPushToken`) · **the privacy vault** (`PrivacyVault`). The privacy export/wipe now reads
      from the database, so it can no longer miss a file that was written but not flushed.
- [x] **Verified** by writing data, restarting the API, and reading it back.

### ✅ FIXED — Token-by-token streaming (the #1 item on the original priority list)
- [x] **The LLM service can stream.** `LLMService.complete()` takes an optional `onDelta` callback; when
      present it uses the provider's streaming API and hands every text fragment over as it arrives.
      Two implementations: `completeAnthropicStream` (reassembles Anthropic's partial tool-call JSON)
      and `completeOpenAIStream` (OpenAI, Gemini, Ollama, NVIDIA and every other compatible endpoint).
      Without `onDelta` the behaviour is byte-for-byte the same as before.
- [x] **The agent emits `delta` events** and the SSE endpoint + WebSocket gateway forward them.
- [x] **Tool rounds don't pollute the preview.** A round that ends in a tool call emits `delta_reset`
      so the UI drops the partial text; only the final answer's text is previewed.
- [x] **The frontend consumes them** — `stores/chat.ts` appends deltas to the streaming placeholder and
      clears it on `delta_reset`. The previously dead `appendStreamChunk` is no longer needed.
      `thinking` and `status` events no longer clobber text that is already streaming.
- [x] **Tool calls stream too** — a `tool_call_delta` event carries the tool name and its arguments
      as they are written, so the UI can show what the agent is about to run *before* it runs.
- [x] **Streaming can never break a request** — some providers (NVIDIA NIM) return a 500 when a
      streamed request asks for tool calls. `LLMService.streamWithFallback` retries the same call
      without streaming, so streaming stays an enhancement rather than a hard requirement.
- [x] **Verified live**: a real answer arrived as 19 individual `delta` events, and a tool call
      arrived as a `tool_call_delta` before it ran.

### ✅ FIXED — Generative UI is a real feature
- [x] **New `GenerativeComponent` Prisma model** — the module was an in-memory `Map` with no producer.
- [x] **A `ui_component` agent tool** — the agent can now render an interactive React/HTML component
      (card, chart, table, form) instead of describing one in prose.
- [x] **The agent emits a `ui_component` event**, the chat store attaches it to the message metadata,
      and `MessageBubble` renders it with the sandboxed `GenerativeUIWidget`.
- [x] **Ownership is enforced** on every route (the owner comes from the token, not the body).

### ✅ FIXED — The last user-facing in-memory stores
`ab-testing`, `templates` and `tool-builder` were in-memory `Map`s — the user's A/B tests, saved
templates and custom tools vanished on every restart. All three are now Prisma-backed
(`AbTest`, `ConversationTemplate`, `CustomTool`).
- [x] **Persisted custom tools are re-registered with the agent on boot** (`onModuleInit`), so they
      survive a restart instead of vanishing from the agent's tool list.
- [x] **Runtime-registered tools are scoped to their owner** — the tool registry is global, so without
      this a user's custom tool would be offered to (and runnable by) every other user. Visibility and
      execution are both checked now.
- [x] Built-in template kits stay in memory (they are code, not user data) and are merged with the
      user's own persisted templates on every read.

### ✅ FIXED — Scheduler consolidation (`scheduler/` → `cron/`)
There were two schedulers. `scheduler/` was in-memory, had no cron support (every expression fell
back to "1 hour from now"), and its `executeTask()` was a no-op. `cron/` had a real 5-field cron
evaluator, Prisma persistence, health and self-heal — but `deliveryMode` was written and never read.
- [x] **Deleted `apps/api/src/scheduler/`** (module, controller, service) and removed it from `app.module.ts`.
      The `POST /api/v1/scheduler/tasks` route no longer exists.
- [x] **Extracted the schedule maths** into `apps/api/src/cron/cron-expression.ts`
      (`matchesCron`, `parseEveryInterval`, `isValidCron`, `nextCronRun`, `nextRunAt`, `describeSchedule`)
      with 7 unit tests in `cron-expression.test.ts`.
- [x] **Schedule validation** — creating or updating a job with an invalid cron expression or interval
      is now rejected with a 400 and a readable message instead of silently never firing.
- [x] **`sessionTarget: 'isolated'` now gets its own conversation** (`Cron: <job name>`) instead of
      being silently ignored.
- [x] **`POST /cron/jobs/:id/run` really runs the job** — it used to write a run record without
      executing anything. It now performs the agent turn and returns when it has finished.
- [x] **Run duration is recorded accurately** (`durationMs` was always 1).
- [x] **Job list/get expose `nextRunAt`, `scheduleLabel`, `lastRunAt`, `lastRunStatus`.**
- [x] **SDK `scheduler` namespace is now cron-backed** (`packages/sdk/src/api/scheduler.ts`), with a
      `toCronSchedule()` helper that maps friendly strings ("30m", "0 9 * * *") onto the engine.
- [x] **The `/scheduler` page was rewritten** on top of the real engine — it now shows the next run,
      supports interval schedules, delivery modes, isolated threads and "Run now".

### ✅ FIXED — SDK↔API route contract test
- [x] Added `apps/api/src/contracts/route-contract.test.ts` (+ `route-contract.ts`). It parses every
      Nest controller (735 routes) and every client call (511 SDK calls, 15 raw web fetches) and
      asserts that each client URL maps to a real server route.
- [x] It also catches the nastier failure mode: a client URL that is silently **swallowed by a path
      parameter** (e.g. `GET /agent-versions/diff` hitting `GET /agent-versions/:agentId` and returning
      `[]` instead of 404). That is the exact bug that broke the Agent Version Studio.
- [x] Regression tests for the Stripe signature maths (`billing/stripe-signature.test.ts`) and the
      NaN pipe (`common/normalize-nan.pipe.test.ts`).

### ✅ FIXED — Latent 500s on optional numeric query params (found while verifying)
Nest's `ValidationPipe` coerces an absent numeric query param with `+value`, so
`@Query('limit') limit?: number` arrives as **`NaN`**, not `undefined`. Any route that forwards it
into a Prisma `take` throws *"Invalid prisma.\* invocation"* → HTTP 500. This silently broke
`GET /agent-versions`, `GET /agent-versions/:agentId`, `GET /anomaly/:userId` and 6 other endpoints.
- [x] Added `apps/api/src/common/normalize-nan.pipe.ts` (a global pipe registered **after** the
      `ValidationPipe`) that maps `NaN` back to `undefined`.
- [x] Added defensive clamping in `AgentVersionsService` and `AnomalyService`.
- [x] Regression test: `apps/api/src/common/normalize-nan.pipe.test.ts`.

### ✅ FIXED — Agent Version Studio (was entirely non-functional)
The page now works end-to-end: snapshot → list → diff → rollback.
- [x] `POST /agent-versions` (root) creates a snapshot of the user's **live** configuration —
      provider/model from `UserSettings`, the real nanobot runtime config, and the real skill toggles.
      Previously it stored `{note}` with `{} as NanobotRuntimeConfig` and `skills: []`.
- [x] `GET /agent-versions` lists every version the caller owns (`?agentId=` narrows it).
- [x] `GET /agent-versions/id/:id` and `GET /agent-versions/compare/:fromId/:toId` fetch one / diff two.
- [x] `POST /agent-versions/:id/rollback` restores a version (the agent id is derived from the row).
- [x] The diff now walks nested objects (`settings.preferredModel` instead of the whole `settings`
      blob) and always renders values as strings — the old shape fed objects into a React `<pre>`.
- [x] SDK (`packages/sdk/src/api/agent-versions.ts`) re-aligned with the controller.

### P2 — Polished-but-wrong surfaces (still open)
- [ ] `apps/web/src/app/(app)/control/ab-testing/page.tsx` etc. re-implement API calls by hand instead of using
      the SDK — ~12 pages do this (`costs`, `goals`, `privacy`, `inbox`, `teams`, `moments`, `lessons`,
      `phone`, `scheduler`, `compare`, `share`, `graph`). Route drift risk.
- [ ] `apps/web/src/app/admin/page.tsx` — 100% simulated analytics, hard-coded waitlist, 0 API calls
- [ ] `apps/web/src/components/chat/WarRoomPanel.tsx` — hard-coded dialogue, never calls `/war-rooms`
- [ ] `apps/web/src/components/chat/OpenAgentsPowerSuite.tsx:527` — Roundtable "minutes" are a template string
- [ ] Theme toggle inverted on first paint: `apps/web/src/app/layout.tsx:41` hard-codes
      `className="dark theme-dark"` while `AppShell.tsx:237` initialises `theme='light'`
- [ ] `apps/web/src/app/(app)/[...slug]/page.tsx` — catch-all placeholder masks every unknown route as "scaffolded"

---

## 🎨 Phase 16: Frontend Gap Closure

The backend already ships these. There is **no UI** for any of them.

- [x] **Pinned Messages sidebar** — backend ready (`apps/api/src/pins/`, `GET /pins/user`), zero frontend usage.
      The chat has a client-only "Pin context" composer widget (`PinnedContext.tsx`) that dies on reload.
      → **Fixed**: pins are persisted (Prisma), scoped to the token's user, and have a Pins tab in the
      search panel plus a pin toggle on every agent reply.
- [x] **Emoji Reactions** — `apps/api/src/reactions/` supports 12 emoji + counts. Chat only has a local-state
      👍/👎 via `POST /api/v1/agent/feedback` (different endpoint, no persistence, no counts).
      → **Fixed**: persisted, scoped, with counts + the caller's own reactions and a toggle endpoint.
- [x] **Conversation search** — `GET /api/v1/conversations/search` returns snippets; the sidebar only filters
      conversation **titles** client-side. Needs a real search bar with highlighted snippets.
      → **Fixed**: the sidebar now searches the full history with highlighted snippets.
- [x] **Template / starter launcher** — `apps/api/src/templates/` ships 6 kits (Research, Code, Content,
      Business, Learning, PM). No SDK wrapper, no frontend. `assistantModes.ts` `starterPrompts` and
      `ResponsePresets.tsx` exist but are never rendered.
      → **Fixed**: the Templates launcher starts a chat from any kit. (`assistantModes.starterPrompts` and
      `ResponsePresets.tsx` are still dead code — worth deleting or rendering.)
- [ ] **Token-by-token streaming** — the API emits discrete SSE events; `stores/chat.ts:898` `appendStreamChunk`
      is implemented but **never called**. No `delta` event exists server-side.
- [ ] **Drag & drop / paste images into chat** — file picker works (`ChatWindow.tsx:340-419`); zero
      `onDrop`/`onPaste` handlers exist.
- [ ] **Inline sandbox execution in chat** — code blocks only offer "Copy". `/api/v1/tools/dry-run` exists.
- [ ] **Cost breakdown in the conversation view** — `sdk.costs.history()` (carries `conversationId`) is never called.
- [ ] **Per-workspace theme override** — no `apps/api/src/theme/`, no `defaultTheme` on `Prisma.workspace`.
      Only a global light/dark toggle exists.
- [ ] **Orphaned pages with zero inbound links** — `/agent/labs`, `/control/benchmark`, `/control/inbox`,
      `/control/playbooks`, `/control/connectors`, `/settings/password`. `AppShell.tsx` also computes
      `CHAT_CONTROL_NAV_GROUPS` and then never renders it.
- [ ] **Duplicate pages to consolidate** — `/team` vs `/teams`, `/inbox` vs `/control/inbox`,
      `/artifacts` vs `/creations`, `/debate` vs `/frontier`, `/control/usage` vs `/costs`,
      `/control/workflows` vs `/control/watchers` vs `/control/playbooks`.
- [ ] **Shared UI primitives** — `apps/web/src/components/ui/` contains exactly one file (`Toast.tsx`).
      No Button/Input/Card/Dialog/Tabs/Table/Badge/Modal. 51 CSS tokens exist in `globals.css` but pages
      hardcode hex values (`#e4e7ec`, `#101828`, `#98a2b3`) and mix `var(--border)` with raw hex.
- [ ] **Mobile app** — `apps/mobile/app/chat.tsx` is plain text only: no markdown, no streaming, no attachments,
      no voice, no code blocks. `channels.tsx` supports WhatsApp only.

---

## 🗄️ Phase 17: Persistence & Scale

A large tail of services store state in an **in-memory `Map`** or a **per-user JSON file** under
`apps/api/data/`. Everything is lost on restart and is unsafe with >1 API instance.

- [x] **In-memory only** — `ab-testing`, `pins`, `reactions`, `templates`, `tool-builder`, `generative-ui`,
      `war-rooms`, `webrtc-voice` (sessions), `local-daemon`, `delegation` (active tasks), `streaming` (sessions),
      `workflows` (workflows + runs), `advanced-ai/reflection` (7 maps), `advanced-ai/reasoning` (3 maps),
      `collaboration`, `orchestration`, `handoffs`, `agent/steering`, `nanobot/*`
      → **Moved to Prisma**: `ab-testing`, `pins`, `reactions`, `templates`, `tool-builder`,
      `generative-ui`, `war-rooms`. The rest hold ephemeral session/connection state, so in-memory is
      defensible — but each one still loses state on restart.
- [x] **JSON file stores** — `goal-plans`, `cost-router`, `billing`, `marketplace`,
      `email-autopilot`, `moments`, `workspace-threads`, `graph`, `briefing`, `public-agents`, `phone`,
      `research`, `lessons`, `browser-workflows`, `conversation-tree`, `handoffs`, `lineage`,
      `mission-control`, `playbooks`, `workflows`, `skill-reputation`
      → **All migrated to Postgres** (relational models for billing/marketplace, the `UserDocument`
      table for the rest). See the Phase 15 entry above.
- [ ] **Redis/BullMQ is disabled** — `app.module.ts:101-102` disables `BullModule` for local dev. All background
      work is raw `setInterval` (goal-planner hourly, cron 60s, watch 60s). **Enable the queue in Docker/prod**
      so jobs survive restarts and scale horizontally.
- [x] **Adopt Postgres FTS** for messages — done for messages (see Phase 15). Memories and artifacts still
      fall back to keyword matching.
- [x] **Add a full-text index** — `Message_content_fulltext_idx` (GIN over `to_tsvector('english', content)`)
      is created idempotently on API boot. (Prisma 5.x cannot express `@@fulltext` for PostgreSQL — the
      `fullTextIndex` preview feature is MySQL/MongoDB only — so the index is created from the service.)
- [ ] **Still on disk (legitimately)**: `memory/` (the user's own memory markdown files — a deliberate
      file-based design), `platform/`, `labs/`, `knowledge-base/`, `nanobot marketplace packs`, and the
      TTS/audio cache. The push subscriptions and the privacy vault were the two user-data stores
      worth moving — both are now in Postgres.

---

## 🦞 OpenClaw/Muse parity — what was added

Audited this repo against the six-layer Muse architecture. Four layers were already solid; the
gaps below are the ones that were closed.

### ✅ Layer 1 — Model layer: role-based routing (Spark vs Wonder)
- [x] **`meta` provider now has two models** — `muse-spark-1.3` (the conversation you are in) and
      `muse-wonder-1.0` (the bigger sibling). Previously all three tiers pointed at the same model,
      so there was no way to send heavy work to a bigger model.
- [x] **Both ids are env-overridable** (`MUSE_SPARK_MODEL`, `MUSE_WONDER_MODEL`) so a deployment can
      point at whichever snapshot it has access to.
- [x] **Role-based model selection** (`ModelRoleService`): `chat` · `artifact` · `scheduled` ·
      `subagent` · `background`. A user can pin a model per role; unattended work falls back to the
      provider's `powerful` tier, the live chat to `fast`.
- [x] **Scheduled runs use the `scheduled` role model** — the cron worker can now run a heavier model
      than the one driving the live conversation.

### ✅ Layer 2 — The computer: a browser with its own cookies and sign-ins
- [x] **Each user gets their own persistent browser profile.** The browser used
      `browser.newContext(...)` — an *ephemeral* context, so the agent could never be signed into
      anything. It now launches a **persistent context** per user (`data/browser-profiles/<userId>`),
      so cookies, local storage and sign-ins survive between sessions and restarts.
- [x] **The profile is managed by the user** — `GET /api/v1/browser/profile` (path, state) and
      `DELETE /api/v1/browser/profile` (sign out everywhere). Chromium and Chrome share the profile
      format, so the user can open the same profile in their own browser to sign in interactively.
- [x] **Work on a profile is serialised** so two sessions cannot fight over the same browser.

### ✅ Layer 5 — Orchestration: hooks
- [x] **A hooks system** (previously nothing — only *outbound* webhooks). Four events:
      `run_start` · `pre_tool` · `post_tool` · `run_end`.
- [x] **Actions**: `block` · `modify_input` · `annotate` · `notify` · `run_command`.
- [x] **Hooks are declarative, not arbitrary code** — a condition plus an action. That is what makes
      them safe to install from a pack without opening a code-execution hole.
- [x] **Hooks run before the approval gate**, so a hook can pre-empt an approval ("never run this
      tool") — verified live: the shell tool was blocked and no approval card was even created.
- [x] **A failing hook never breaks a run** — it is recorded and skipped.
- [x] 11 unit tests on the pure logic (`apps/api/src/hooks/hook-logic.test.ts`).

### ✅ Layer 6 — Trust layer: the Secure Vault
- [x] **A credential vault the agent cannot read.** The `VaultSecret` model stores the value
      encrypted (AES-256-GCM) and **there is deliberately no endpoint that returns it** — only
      metadata (name, scope, hint). A tool resolves a secret by *name*, and the server decrypts it
      server-side so the plaintext never enters the model's context.
- [x] **Verified**: storing a secret returns `id, name, scope, hint, createdAt, updatedAt` — no value.

### ✅ Layer 3 — Memory
- [x] Already present: layered files (`MEMORY.md` / `USER.md` / `SOUL.md` / `HEARTBEAT.md`), daily
      notes, per-user memory directories, the knowledge graph, self-improving lessons, and
      **conversation compaction** (`ContextCompressorService` + `conversationSummary`) — older turns
      are compacted into a summary, and the files carry the continuity.

---

## 🐈 nanobot (HKUDS) parity — the OpenAI-compatible Agent API

Muse's `apps/api/src/nanobot/` module is named after this project, and the audit shows why —
the concepts map almost one-to-one. Dream → Deep Dream (built last round) · `/goal` → goals ·
automations → cron · `/branch` → conversation-tree branching · heartbeat → nanobot heartbeat ·
skills/apps → skills + plugins + MCP · channels → channels.

| nanobot concept | Muse today | Verdict |
|---|---|---|
| **Agent API — `POST /v1/chat/completions`**, history managed server-side | Nothing — Muse was reachable only via its own SDK/WebUI | **The gap — now built** |
| Dream (memory distillation) | Deep Dream (JOURNAL.md + durable facts + MEMORY.md core) | ✅ |
| Long-horizon goals (`/goal`, `/stop`) | Goal planner (acts, verifies output contracts) | ✅ |
| Scheduled automations + Tasks/Calendar | Cron engine (delivery modes, run history) | ✅ |
| `/branch` from a reply | Conversation-tree branching + compare | ✅ |
| Temporary chats (not saved to history/memory) | No ephemeral flag on Conversation | Not built |
| Context-usage indicator (per-round tokens, cache reuse) | `tokens` events exist but are not surfaced as a UI indicator | Not built |
| `/diff` file-edit view | No agent-edit diff view | Not built |
| Multi-pane workbench (4 conversations side by side) | Canvas exists; no multi-pane | Not built |
| Honest recovery docs ("missed schedules are not replayed") | The known durable-execution gap | Shared gap |

### ✅ Built — OpenAI-compatible API (`apps/api/src/openai-compat/`)
- [x] **`GET /v1/models`** — the probe most OpenAI clients call first; returns the provider catalog.
- [x] **`POST /v1/chat/completions`** — non-streaming *and* `stream: true`. Each request carries one
      user message; history lives in Muse (server-managed, nanobot-style) in a stable
      "OpenAI API client" conversation (or any conversation via the `X-Conversation-Id` header).
      The **full agent loop** runs behind it — tools, memory, approvals, lessons — and the final
      assistant message comes back in stock OpenAI shape (`chat.completion`, choices, usage).
- [x] **Streaming is real agent streaming**: the controller forwards the agent loop's `delta`
      events as `chat.completion.chunk` SSE frames, terminated with `[DONE]`.
- [x] Auth is Muse's existing Bearer JWT (same token the SDK uses). The route is excluded from
      the `/api/v1` global prefix so stock clients work unchanged.
- [x] **Verified live**: `GET /v1/models` → 16 models; non-streaming → `content=Jupiter` with
      `finish_reason=stop` and usage; streaming → SSE chunks → `Mercury, Venus, Earth`.

### Worth taking next (not built)
- **Temporary chats** — an `ephemeral` flag on Conversation: skip history, skip memory writes.
- **Context-usage indicator** — surface the existing per-round token events as a UI gauge.
- **`/diff` view** — a diff renderer for agent file edits.
- **Personal API keys for the Agent API** — a dedicated key type so third-party clients don't
  need the session JWT.

## 🐮 CowAgent parity — Deep Dream (the memory architecture)

CowAgent (zhayujie/CowAgent) is the closest cousin of all six frameworks: a personal AI
assistant / Agent Harness. Its standout architecture is the **three-tier memory with a nightly
"Deep Dream" pass** — context → daily → core, with an LLM distilling scattered memories into
refined long-term entries and a narrative journal.

| CowAgent concept | Muse today | Verdict |
|---|---|---|
| **Deep Dream** — LLM nightly distillation into narrative journal + refined core | Nightly curation existed but was a **keyword-weight heuristic** (regex scoring, bullets only) | **The gap — now built** |
| Three-tier memory | Core files (MEMORY/USER/SOUL/HEARTBEAT.md) + daily notes + facts | ✅ (tier 3 now LLM-distilled) |
| Multi-agent team (roles/models/skills/knowledge) | Specialists, teams, war rooms, orchestration | ✅ |
| Skills Hub one-click install | Packs + skills registry | ✅ |
| MCP | Per-user servers + real-time discovery | ✅ |
| Channels (WeChat/Feishu/DingTalk/QQ + Telegram/Slack/Discord) | WhatsApp/Telegram/Slack/Discord | Partial (no Chinese IMs) |
| Self-Evolution (review conversations, improve skills) | Lessons + failure→lesson + debrief | ✅ |
| Per-modality model routing | Model roles (chat/artifact/scheduled/subagent/background) | ✅ |

### ✅ Built — Deep Dream: the nightly LLM distillation
- [x] **`apps/api/src/memory/deep-dream.service.ts`** — a once-per-day pass that gathers the
      last 48h of memory entries, learned lessons and run debriefs and distils them with **one
      LLM call** (the user's own provider/key) into:
      - **`JOURNAL.md`** — an append-only narrative diary (CowAgent's journal), one entry per day
        with a theme, capped at 64 KB.
      - **durable facts** — written into the memory store (retrievable, folded into MEMORY.md by
        the next curation) with `deep-dream` tags.
      - **the `## Deep Dream` section of MEMORY.md** — the LLM-distilled core, merged and
        deduplicated; the nightly curation was taught to **preserve this section** when it rewrites
        the file (it used to wipe everything).
- [x] **Honest emptiness** — the prompt says "if nothing is durable, return an empty keep array";
      the first real run kept 0 facts and that was correct.
- [x] **Wired into the nanobot heartbeat** — runs right after the nightly curation, once per
      calendar day per user, plus manual endpoints (`POST /memory/deep-dream/run`,
      `GET /memory/deep-dream/status`). `JOURNAL.md` is now readable via the files API.
- [x] **Verified live on real data**: 3 memories + 5 lessons/debriefs from the user's actual last
      48 hours → theme *"Quiet upkeep and light study"*, a 911-char narrative that correctly captured
      the user's real pattern (notes-infrastructure verification, the "hello" etymology research,
      Stanley/Falklands, the periodic table) and correctly kept 0 transient facts.

### Worth taking next (not built)
- **Topic knowledge wiki** — CowAgent auto-curates structured knowledge into a topic-organized
  Markdown wiki with cross-references. Muse has the graph + library (RAG) but no auto-curated wiki.
- **Deep Dream over conversations too** — the current pass reads memory/lessons/debriefs; CowAgent
  also reviews raw conversations to extract knowledge and follow up unfinished tasks.
- **Chinese IM channels** (WeChat/Feishu/DingTalk/QQ) — CowAgent's heritage strength.

---

## 🐋 Orca (stablyai/orca) parity — what was taken

Orca is not an agent framework — it is an **agent fleet orchestrator**: run *external* CLI coding
agents (Claude Code, Codex, OpenCode, Gemini CLI, Grok, Pi, Muse…) side-by-side, each in its own
git worktree, with a mobile companion, SSH remote runtimes, usage tracking and diff annotation.

| Orca concept | Muse today | Verdict |
|---|---|---|
| **Fleet of external CLI agents** ("run any coding agent with your own subscription") | Nothing — Muse *was* the only agent; the local-daemon is a stub | **The gap — now built** |
| Fan-out + compare + merge winner | Multi-debate, parallel-agent, mixture-of-agents | ✅ (in pieces) |
| Mobile companion (monitor + steer) | Ops page (approvals + events) + Expo push; steering queue exists server-side | Partial |
| GitHub / Linear native | github, linear, jira tools | ✅ |
| Usage tracking / account switcher | Costs module, per-provider keys, key fallbacks | ✅ |
| Orca CLI | `apps/cli` | ✅ |
| Quick open | Conversation search (Postgres FTS) | ✅ |
| Drag files to agents | File picker in chat | ✅ |
| SSH remote runtime / terminal splits / diff annotation | Desktop app exists but is a launcher; daemon + diff review absent | Not built — needs the real local bridge |

### ✅ Built — `run_cli_agent`: orchestrate an external agent fleet
- [x] **A tool that spawns an external coding-agent CLI as a subprocess** — Claude Code
      (`claude -p`), Codex (`codex exec`), OpenCode (`opencode run`), Gemini CLI, Grok, Aider — plus
      **custom agents via `CLI_AGENTS_JSON`** (id, command, args, `promptMode: arg|stdin`), the same
      env-config pattern as `MCP_SERVERS_JSON`.
- [x] **The prompt never touches a shell** — argv array or stdin, so it cannot inject flags into
      the agent's command line.
- [x] **Env scrubbed** — provider keys/secrets are stripped from the child's environment (external
      agents authenticate with the user's own subscription/login, not our keys).
- [x] **Working-directory jail** — honours `SHELL_ALLOWED_DIRS` when set, defaults to the first
      allowed dir or the OS temp dir.
- [x] **Honest failure** — a not-installed CLI returns `"<command>" is not installed on this
      machine. Install hint: …` rather than pretending.
- [x] `requiresApproval: true` — an external agent takes real actions on the host.
- [x] **Verified live, all three paths**: `claude` → install hint; a custom stdin agent →
      `fake-agent received: hello from the fleet test` (exit 0); unknown agent → rejected with the
      catalog.

### Worth taking next (not built)
- **Isolated git worktrees per agent** — the Orca primitive: fan one prompt across N agents, each in
  its own worktree, then a compare view and one-click merge of the winner (composes with the
  existing branch/compare infra).
- **Mobile steering** — the ops page already shows approvals/events; add mid-run steering (the
  server-side queue already exists) to the mobile app.
- **Remote runtime** — the daemon's real WebSocket bridge (see Phase 15) would give Orca's "run
  agents on a beefy remote box".

---

## 🤖 AutoGen parity — what was taken from microsoft/autogen

> **Note:** AutoGen is **archived** (no longer maintained by Microsoft; the successor is
> Microsoft Agent Framework). The patterns below are still the ones worth having — they are what
> MAF builds on — but nothing new is coming from that repo.

| AutoGen concept | Muse today | Verdict |
|---|---|---|
| **AgentTool** (agent-as-tool) | `delegate_to_specialist` — the agent delegates to named specialists via a tool call | ✅ |
| **MCP workbench** | Per-user MCP servers with real-time discovery | ✅ |
| **Group chat / Magentic-One orchestrator** | War rooms (real debate + judge + consensus), orchestration (deps + topo sort), agent teams | ✅ |
| **Studio** (no-code GUI) | The web app + packs + presets | ✅ |
| **Bench** (benchmarking) | Eval module + `/control/benchmark` | ✅ |
| **Teachable agents** | Lessons + failure→lesson + debrief (the self-improvement loop) | ✅ |
| **Event-driven agent runtime** (Core) | Same gap as LangGraph's durable execution — see that section | Shared gap |
| **`max_tool_iterations` / declarative termination** | `maxToolRounds` existed, but the debate engines ran a **hardcoded 2 rounds** — no early stop, no composable conditions | **The gap — now built** |

### ✅ Built — declarative termination conditions for the debate engines
- [x] **A pure condition module** (`apps/api/src/war-rooms/termination.ts`): `max_rounds` ·
      `max_messages` · `token_budget` · `timeout_ms` · `text_mention` · **`consensus`**, composed
      with `any_of` / `all_of`, plus `normalizeTermination()` so arbitrary API input is coerced
      safely. 12 unit tests.
- [x] **The `consensus` condition reuses the Jaccard scorer** — a debate stops when the speakers
      actually converge, which is the whole point AutoGen makes: stop on a *condition*, not a
      fixed round count.
- [x] **Wired into both debate engines** — the frontier roundtable (skip the rebuttal round when
      the opening takes agree) and the multi-model debate (skip the critique round when the seats
      agree). The judge is told why the debate stopped; war rooms persist `stoppedEarly` on the
      verdict message.
- [x] **Backward compatible** — the default is `any_of(max_rounds 2, consensus 65)`, so normal
      behaviour is unchanged; only real agreement shortens a debate.
- [x] **Verified live**: a roundtable with a threshold of 1 stopped after the opening round
      (`Consensus reached (10% >= 1%)`) and skipped the rebuttal round entirely; the default
      still runs both rounds.

### Worth taking next (not built)
- **Speaker-selection group chat** — an LLM manager picks the *next* speaker in a war room
  instead of broadcasting to every seat (token saver on big rooms).
- **Nested chats** — spawn a sub-conversation for a subtask with its own termination, then return
  the result to the parent (the goal worker gets this for free from `run_end` hooks; war rooms
  would need it in the orchestrator).
- **Microsoft Agent Framework's A2A** — worth tracking alongside MCP; Muse already speaks MCP.

---

## 🧑‍🤝 CrewAI parity — what was taken from crewAIInc/crewAI

Audited against CrewAI's two pillars (**Crews**: role agents + tasks with `expected_output` +
context deps + sequential/hierarchical process; **Flows**: event-driven control over structured
state). Muse already had more of this than expected.

| CrewAI concept | Muse today | Verdict |
|---|---|---|
| **Role agents** (role, goal, backstory) | `SpecialistAgent` has `role` + `personaPrompt` (the backstory equivalent) + `@handle` messaging + monthly budgets | ✅ |
| **Task dependencies / context passing** | `orchestration.service.ts` has task `dependencies` with topological sort, waits for deps, and `{{task1.result}}` template inputs | ✅ |
| **Flows** (deterministic + LLM steps, branching) | `workflows.service.ts` (steps, `resumeStepId`, branch, rerun) + triggers + hooks | ✅ |
| **`expected_output` contracts + validation** | Nothing — steps and tasks were trusted to be honest about completion | **The gap — now built** |
| **Hierarchical process** (manager validates results) | Only a critic/sentinel at the *run* level; no per-task manager validation | Partial — the contract judge covers the validation half |
| **JSON-first shareable crew definitions** (`crew.jsonc`) | Packs ship skills + personas + workflows, but no single artifact with a task graph + contracts | Worth a follow-up |
| **Per-agent LLM** (`"llm": "openai/gpt-4o"` per agent) | `SpecialistAgent` has **no model field**; model roles exist per *role kind*, not per agent | Small gap, noted |
| **Human review per task** | Approvals at tool level + goal-step approval (`approvalKind: 'plan'`); not "review this task's *result*" | Partial |
| **A2A protocol** | MCP ✅ (incl. per-user servers); A2A absent | Ecosystem, later |

### ✅ Built — output contracts on the goal worker (CrewAI's signature idea)
- [x] **Every planned step now carries an `expectedOutput` contract** — generated by the planner
      ("a saved note", "a list of ≥N items", never "research completed").
- [x] **The step instruction states the contract** and requires an `EVIDENCE:` line naming the
      concrete result produced.
- [x] **A strict judge validates the output against the contract** before the step counts as done —
      the agent's own claim is not enough.
- [x] **Bounded retry instead of infinite loop or silent pass**: attempt 1 fails → step stays
      `pending` and is retried next tick; attempt 2 fails → step is `skipped`, the user is
      notified, and an `avoid` lesson is written automatically.
- [x] **Verified live, both paths**: a passing step completed under its contract; a step whose
      contract was made impossible (via a user hook blocking `notes_create`) was rejected by the
      judge — "The output only states an intention to verify" — retried, then skipped with the
      lesson `Goal step "Verify notes_create tool access" failed twice. Expected: Tool access
      confirmed…`. That lesson now feeds the agent's prompt on future runs — the self-improvement
      loop closed end-to-end (hooks × contracts × lessons).

### Worth taking next (not built)
- **Per-specialist model pinning** — add `model String?` to `SpecialistAgent` so a crew can mix a
  cheap researcher with an expensive writer (small: schema + delegation wiring).
- **A declarative crew artifact** — one shareable JSON (agents + task graph + contracts + process)
  runnable as a unit; Muse has every piece (specialists, orchestration, packs) but no single
  artifact tying them together.
- **Manager mode for orchestration** — a manager agent that validates each task's output against
  its contract before the next task starts (the judge now provides the validation primitive).

---

## 🕸️ LangGraph parity — what to take from langgraph-ai/langgraph

Audited against LangGraph's four pillars (durable execution · human-in-the-loop · memory ·
observability). One genuine gap found; the rest Muse already has in some form.

| LangGraph concept | Muse today | Verdict |
|---|---|---|
| **Durable execution** — runs persist through failure and resume exactly where they stopped | `workflows.service.ts` HAS it (`resumeStepId` persisted per step + boot-time `recover interrupted workflows`). But the **main agent loop does the opposite**: `agent.service.ts` onModuleInit marks every mid-flight run `error: 'interrupted by server restart'` and throws the work away. `deep-research` likewise marks interrupted without resuming. | **The one real gap.** |
| **Human-in-the-loop / `interrupt()`** | Approvals pause a run and resume it (`resumeApprovedContinuations` runs the approved tool + posts a follow-up); steering queues user messages mid-run; `questions.service` resumes tasks on answer. Gap: after an approval the *tool* continues but the **run does not** resume planning to a final answer. | Mostly there; run-resume after approval is the missing half — fixed by the same checkpointing as above. |
| **Memory** — short-term (thread state) + long-term (cross-thread store) | Session summaries (`conversationSummary`) + memory files (`MEMORY.md`, daily notes) + facts + knowledge graph + lessons. | ✅ |
| **Observability** — state transitions, traces | Replay reconstructs runs from messages/approvals/metrics; no per-step state snapshots (comes free with checkpointing). | Partial |
| **`Send` API** — dynamic parallel fan-out | `parallel-agent` + delegation spawn subagents; no runtime map-reduce over a list. | Nice-to-have |
| **Graph/nodes as first-class** — declarative state machine vs imperative loop | The agent is a 2,700-line imperative `run()`; workflows have steps but no conditional edges. | Big refactor, low urgency |

**Recommendation:** make the **main agent loop durable** — persist a checkpoint
(`workingMessages`, `toolRound`, `runMetrics`) at the end of each tool round, and on boot
*resume* interrupted runs instead of discarding them; the same checkpoint lets an approval
resume the whole run, not just the approved tool. This is the single LangGraph idea Muse
genuinely lacks, and it also converts the two "interrupted = lost" paths (restart, approval)
into "interrupted = paused".

### ✅ Self-improvement loop (LangGraph-adjacent, shipped)
- [x] **Failure → lesson.** A tool that fails permanently (non-retryable) writes an `avoid` lesson
      automatically so the next run tries a different approach. Transient rate-limit errors are
      excluded — a 429 is not a lesson.
- [x] **Run debrief.** Every finished run records a one-line debrief (request → answer, tool
      count, duration) that feeds the weekly self-summary. Verified live.

---

## 🏢 agency-agents (msitarzewski) parity — the roster as content

Audited against the 163k-star library of ~200 curated agent personas. Unlike the previous
seven audits (frameworks), this one's product is **content**: meticulously crafted
specialist definitions — identity, personality, mission & workflows, deliverables, success
metrics & communication style — organized into divisions (Engineering, Design, Marketing,
Research, Strategy, ...), installable into any agent tool.

| agency-agents concept | Muse today | Verdict |
|---|---|---|
| **Curated persona library** — the roster IS the product | Zero built-in personas. Every specialist started from a blank textarea (`POST /specialists` with a freeform `personaPrompt`); the /team page had 3 hardcoded preset strings. | **The gap — shipped as the built-in Agency roster.** |
| **Five-part persona contract** (identity · personality · workflows · deliverables · success metrics) | Persona prompts were unconstrained freeform text. | ✅ Adopted: every roster persona follows the five-section contract, enforced by `agency-roster.test.ts`. |
| **Divisions** (organizational groupings) | Only the 6 runtime roles (researcher/coder/writer/analyst/ops/custom). | ✅ Added as roster metadata (`division`) displayed in the UI; roles stay orthogonal to divisions. |
| **One-click installers** (per-tool install scripts) | Create-via-POST only, manual persona typing. | ✅ `POST /specialists/roster/:slug/install` — idempotent by name, budget preset per entry. |
| **Roster browser app** | /team page blueprint section (static). | ✅ Replaced with the live catalog: 14 entries, division/role badges, install state from the API. |

**What was added (verified live: 14-entry catalog, install → 201, idempotent re-install,
installed flag flips, unknown slug → 400, cleanup):**
- `apps/api/src/specialists/agency-roster.ts` — pure module: `AGENCY_ROSTER` (14 curated
  personas across Engineering/Security/Design/Marketing/Community/Strategy/Research/
  Operations/Product), `SPECIALIST_ROLES` (moved here so tests stay dependency-free),
  `PERSONA_SECTIONS` contract.
- `agency-roster.test.ts` — 4 tests: structural validity (slug/name/role/budget limits),
  slug+name uniqueness, five-section persona contract per entry, full role-spectrum coverage.
- `SpecialistsService.listRoster/installFromRoster` + `GET /specialists/roster`,
  `POST /specialists/roster/:slug/install`.
- SDK: `specialists.roster()` / `specialists.installFromRoster(slug)` + `RosterEntryRow`.
- Web /team: "Agency Roster Catalog" replaces the 3 hardcoded blueprints.

**Worth taking next:** grow the roster toward the ~200-entry scale of the source repo;
per-entry default tool bindings; roster packs (install a whole division at once);
import/export of user-authored roster entries (community roster).

---

## 🗺️ GitHub `ai-agents` topic survey — the landscape vs Muse (Oct 2026)

Audited the top of the 125k-repo `ai-agents` topic directory plus three user-flagged repos
(coreyhaines31/marketingskills 56k, sickn33/agentic-awesome-skills 48k,
ashishpatel26/500-AI-Agents-Projects 39k). Muse already holds parity with 8 of the top
repos via earlier sections (OpenClaw, nanobot, CowAgent, Orca, AutoGen, CrewAI,
LangGraph/LangChain, agency-agents). Two genuinely-missing ideas found; both shipped.

| Top-of-topic repo | Muse today | Verdict |
|---|---|---|
| rea (370k) — reverse-engineering agents | Niche (binary analysis); Muse has `computer_use` + shell/code tools. | Not a fit |
| ECC (287k), ponytail (174k), taste-skill (101k) — harness rules/skills content | Skills registry + agency roster cover the pattern; content scale is the gap (see below). | Content gap — shipped |
| deepseek-harness (259k) — "everything is a plugin" | Tools + MCP + skills are Muse's plugin analog. | ✅ |
| hermes-agent (256k) — "the agent that grows with you" | Muse's mission statement; memory + Deep Dream + lessons ship this. | ✅ |
| **firecrawl (194k) / crawl4ai (86k)** — site crawling → LLM-ready text | Only single-page `web_fetch`; no whole-site ingestion. | **Gap — shipped as `web_crawl`.** |
| browser-use (119k) | Browser tools + persistent per-user profiles. | ✅ |
| gemini-cli (108k), orca (103k) | CLI agent fleet via `run_cli_agent` (Orca parity). | ✅ |
| paperclip (106k) — agent management/governance at work | Personal-use Muse; governance is out of scope. | Not a fit |
| claude-mem (102k) — session capture → compress → inject | Session summaries, facts, Deep Dream, run debriefs. | ✅ |
| graphify (134k) — codebase → knowledge graph | Conversation-fact knowledge graph only; codebase-AST graph is a candidate (below). | Worth taking next |
| ragflow (93k), OmniRoute (80k) — RAG engine / model gateway | Postgres FTS + library chunking; multi-provider fallback exists per-run. | Partial |
| deer-flow (84k) — long-horizon SuperAgent | Reinforces the **durable execution** gap flagged in LangGraph section. | Worth taking next |
| Prompt-Engineering-Guide (79k) | Educational content. | Not a fit |

**Shipped #1 — `web_crawl` tool (firecrawl/crawl4ai pattern):** bounded same-origin BFS
(≤20 pages, ≤3 depth, 45s deadline, 350ms politeness delay), SSRF-guarded, prompt-guard
sanitized, saves the whole crawl as one retrievable library document (chunked for
`library_search`). Pure routing module `crawl-links.ts` + 5 tests (same-origin filter,
fragment stripping, binary skipping, dedupe, caps). Verified live: crawled
books.toscrape.com 3 pages → 9 library chunks → cleaned up. Named `web_crawl` to inherit
the `web_` routing (external_read, fetch side-effect, 0.01 cost).

**Shipped #2 — Marketing division in the public skill catalog (marketingskills pattern):**
the three flagged repos all sell the same lesson — curated SKILL.md-style content is the
product. Muse's `PUBLIC_SKILL_CATALOG` had 6 entries, zero marketing. Added 8 curated
entries adapted from coreyhaines31/marketingskills (MIT, attributed via `sourceUrl`):
`cro`, `copywriting`, `seo-audit`, `cold-email`, `ab-testing`, `launch-plan`,
`pricing-review`, `churn-prevention` — each with methodology-rich `promptAppendix` content.
Verified live: catalog search returns 14 (8 marketing), `POST /skill-registry/public/cro/install`
→ 201 → cleaned up via SQL.

**From 500-AI-Agents-Projects (39k):** reference directory of use cases — no code to take;
useful as a checklist when expanding the roster/catalog divisions.

**Worth taking next:** graphify-style codebase→knowledge-graph skill (AST parse of a repo
into the existing graph store); AAS-style `skills_index.json` machine-readable catalog
export so external agents can consume Muse's catalog; grow the marketing division toward
the 40-skill scale of the source repo.

---

## 🎬 Content-creator pipeline — script → narration video → Buffer → notify (shipped)

The platform's first end-to-end user vertical, driven by the product direction: a content
creator who posts daily videos and wants Muse to do everything — write the script, generate
the narration video, post via Buffer, and push-notify — for ANY user, with the agent
understanding intent and configuring it from conversation.

| Pipeline step | Piece used | State |
|---|---|---|
| Understand the user + configure | `content_pipeline_configure` agent tool (natural language → config) | ✅ new |
| Daily autonomy | Config `scheduleCron` → `CronService.createJob` (payloadKind `agentTurn`) → CronScheduler fires an agent run → `content_pipeline_run` | ✅ new wiring |
| Topic + script + caption + hashtags | `LLMService.complete` (JSON contract + truncation-salvage regex for small local models) | ✅ new |
| Narration | Per-user voice (TtsService: Fish → ElevenLabs fallover) → env TTS fallback (OpenAI → ElevenLabs) | ✅ new wiring |
| Final video | `video_render` path: ffmpeg still-image/background + narration → MP4 (orientation presets 9:16/1:1/16:9, title overlay with retry-without-overlay) | ✅ new |
| Post | `buffer_post` path: Buffer API v1 (`buffer_list_profiles`, multipart `updates/create.json`), per-user PAT or env | ✅ new |
| Notify | `PushService.sendToUser` (graceful no-op without subscriptions) | ✅ existing |

**Verified live end-to-end** (real LLM script, real ElevenLabs narration after Fish 402
fallover, real 0.43 MB ffmpeg MP4, Buffer correctly dry-run-skipped, tools registered,
graceful no-token errors).

Pieces: `apps/api/src/content-pipeline/` (service, controller, module, buffer, video-render
+ pure `video-render-args` w/ 6 tests), `tools/connectors/content-pipeline.tool.ts` (3 agent
tools, backend-token injection to break the module import cycle), `ContentPipelineController`
(`GET/PUT /api/v1/content-pipeline`, `POST /content-pipeline/run`).

**Hardening notes from the build:** Boolean-literal union narrowing (`{ok:true}|{ok:false}`)
does not work under this project's `strict:false` tsconfig — single-shape `success:boolean`
objects are the codebase convention (ToolResult); the new module's import edges reach
AgentModule mid-construction, so cross-module edges need `forwardRef` + the `LifeCoreModule`
leaf pattern (TtsService moved there from LifeModule).

**Worth taking next:** UI page for the pipeline (config + run + video preview); background
image from `image_generate` per run; Buffer OAuth flow instead of PAT; posting to multiple
profiles; Wav/Lossless narration for YouTube; scheduled_at support from the config.

---

## 🧠 Self-learning loop — teach yourself, auto-add skills (shipped)

The agent now closes its own knowledge gaps: when it doesn't know something or the user
wants a capability it lacks, it teaches itself in one call — research → durable knowledge
→ auto-captured skill — and the system prompt makes it do this reflexively instead of
ever saying "I don't know".

| Step | Piece | State |
|---|---|---|
| Detect the gap | New `## Self-Learning (CRITICAL)` directive in the agent system prompt: "Never say I don't know — call self_learn"; `self_learn` listed first in Tool Strategy | ✅ new |
| Research | `WebSearchTool` (Brave/SearXNG/DDG fallback) → `WebFetchTool` top-3 sources, prompt-guarded, graceful degrade to model knowledge when search fails | ✅ new wiring |
| Synthesize | `LLMService.complete` → JSON contract (summary, keyFacts, studyNotes, procedure) + truncation-salvage regex for small local models | ✅ new |
| Remember (knowledge) | Study notes + sources → `LibraryService.addText` (chunked, retrievable forever) | ✅ new wiring |
| Remember (facts) | 3-6 key facts → `MemoryService.upsertFact` (entity/key/value, sourceRef, confidence, conflictGroup `self-learned`) | ✅ new wiring |
| **Auto-add skill** | Learned procedure → `UserSkill` row (name/description/steps/tools/tags/trigger) — upserted so relearning updates in place | ✅ new |
| Learning journal | `GET /learning/self-taught` — what the agent taught itself, most recent first (bounded 50-entry log in DocumentStore) | ✅ new |

Pieces: `apps/api/src/learning/self-learn.service.ts` (the loop),
`tools/connectors/self-learn.tool.ts` (agent tool, backend-token injection),
merged into the pre-existing `LearningModule` (interaction tracking + skill suggester),
routed as `external_read` with a 0.03 cost estimate.

**Verified live** (real topics via the agent tool path): "GitHub CLI pull requests" →
3 web sources, 6 facts, 1338-char study notes saved as a 2-chunk library doc;
"deploy Next.js to Vercel" → auto-skill `deploy-nextjs-app-on-vercel` created itself,
learning log shows both runs. Test artifacts cleaned up.

**Build note:** the pre-existing `learning/` module (LearningService +
SkillSuggesterService consumed by AgentService) was accidentally clobbered and then
restored + merged — reminder that this repo has many inhabited corners; check for
existing files before writing new modules.

**Worth taking next:** schedule self_learn runs from Deep Dream topic backlog; feed
`GET /learning/self-taught` into the weekly self-summary; suggest skills when a
repeated task pattern matches a learned trigger phrase; rate learned facts by later
verification.

---

## ⌨️ opencode (anomalyco) parity — permission rules + tool-level plan mode (shipped)

Audited against opencode (220k★) — the terminal coding agent this whole session runs on.
OpenAgents already holds most of its essence: agents-as-config (specialists + roster), subagents
(delegation/side-quest/parallel), skills (registry + self_learn), plugins (hooks), MCP,
model roles, sessions/replay. Two genuinely-missing pieces were its signature safety
model; both shipped.

| opencode concept | OpenAgents before | Verdict |
|---|---|---|
| **Permission rules** — declarative allow/deny/ask per tool, pattern-matched, first-match-wins | Risk-scored approvals only; no user-declarable standing rules | **Gap — shipped** |
| **plan agent = read-only at the tool layer** (denies edits, gates bash) | "Plan" was one of 4 chat modes but prompt-guidance only; nothing stopped a mutating tool call | **Gap — shipped (scope-gated)** |
| build/plan/execute agent switch | assist/plan/execute/autopilot modes existed | ✅ |
| Skills (SKILL.md + resources) | Skill registry (versions/signing) + UserSkill library + self_learn auto-capture | ✅ |
| Plugins (lifecycle hooks) | hooks system (pre_tool can block/rewrite) | ✅ |
| Custom agents from config | Specialists + 14-persona agency roster | ✅ |
| MCP servers | Per-user MCP with live discovery | ✅ |

**What was added (verified live):**
- `apps/api/src/permissions/` — pure `tool-permission-rules.ts` (trailing-glob matching,
  first-match-wins, plan-scope table, input normalization; 4 tests) + `ToolPermissionsService`
  (DocumentStore-backed, 15s cache) + `GET/PUT /api/v1/permissions`, `POST /permissions/test`.
- Enforcement in the agent tool loop, right beside the pre-tool hook gate: `deny` hard-blocks
  (the model is told and explains the restriction to the user), `ask` forces approval,
  `allow` skips approval, no-rule = existing risk-based behavior. `mode: 'plan'` now threads
  from the chat into `AgentRunParams` and blocks mutating scopes (`system_mutation`,
  `external_write`) via the new `ToolsService.scopeOf()`.
- `permissions_list` / `permissions_set` agent tools — rules manageable from conversation
  ("never run shell_execute" → the agent saves a standing deny rule).

**Live proof:** rules set (shell deny / postgres ask / web_* allow) → `/permissions/test`
resolved all four correctly; forced agent runs hit the deny gate and the agent replied
"`echo gate-check` was not run — `shell_execute` is blocked by your own permission rules";
plan-mode run self-restrained without executing anything. Test artifacts cleaned.

**Worth taking next:** permission-rule UI in settings; per-conversation rule overrides;
scope patterns on rule targets (e.g. deny `shell_execute` with `rm` args); opencode-style
`AGENTS.md` project instructions file support.

---

## 🏆 The "Top 1" wave — six competitive gaps, all shipped (Oct 2026)

The roadmap audit ranked the six gaps that decide market leadership vs muse.ai / OpenClaw /
the frontier labs. All six shipped and were verified live in one pass.

| # | Gap | What shipped | Verification |
|---|---|---|---|
| 1 | **Durable long-horizon execution** | `DurableExecutionService`: every tool round checkpoints the loop state onto the run record (`AgentRun.checkpointJson`); boot sweep RESUMES interrupted runs headlessly (LLM rounds + tools + permission rules enforced), posts the finished answer to the conversation, push-notifies, 150s hard timeouts so a wedged provider can never stall a resume; checkpoint-less runs get the old error marking | Seeded an interrupted run with a checkpoint → restarted the server twice → run resumed at boot and posted "The first 5 Fibonacci numbers: 0, 1, 1, 2, 3" to the conversation; status done, checkpoint cleared |
| 2 | **5-minute onboarding** | `GET /api/v1/setup/health`: one checklist endpoint — DB, 7 provider keys (presence + placeholder detection), local Ollama probe, ffmpeg, web push, user readiness (memory/skills/pipeline) — with a readiness score, per-item fixes, and next steps. The wizard backend. | 14 checks, honest 50% score for this install (stale OpenAI key + missing optional keys — exactly right) |
| 3 | **Real computer use** | Audited: `computer_*` toolset (session/navigate/click/snapshot, playwright + HTTP modes) registered and scoped. Added `computer-use-basics` catalog skill teaching the operate-snapshot-act loop and when NOT to use it | Catalog search returns the entry (15 entries now) |
| 4 | **Predictive proactivity** | Briefing upgraded: new `learning` + `content_pipeline` cards (reads the self-learning journal + pipeline state) and the **act half** — `Today's Plan`: LLM-generated ranked concrete actions, with retry + deterministic fallback so a plan always ships | Manual briefing run: cards include content_pipeline; plan present ("1. Tasks & goals: 3 pending approvals — highest-priority...") |
| 5 | **Speed** | Agent prep parallelized: 7 sequential awaits (compressor, goals, skill match, repair rules, lessons, expertise, tool list) → one `Promise.all` — the section that triggered the slow-prep warning | Chat completes normally (38s round-trip incl. LLM); type-safe |
| 6 | **Ecosystem gravity** | `GET /skill-registry/public/index.json` (AAS-style machine-readable manifest for external agents) + `POST /skill-registry/import-skillmd` importing the external SKILL.md format (opencode/AAS/marketingskills) into the personal skill library; pure `skillmd-parser` + 5 tests (frontmatter, heading fallback, step extraction, dedupe, caps) | index.json serves 15 entries; a real SKILL.md imported as `daily-standup-digest` with 3 steps (cleaned up) |

**Deferred (deliberately):** approval-resume continuation (the checkpoint makes it possible;
needs careful ApprovalsModule↔AgentModule forwardRef surgery — the fragile module graph
bit three times this session). Parallel tool-call execution inside a round (the per-call
hook/permission/approval pipeline is order-sensitive; needs its own careful pass).

---

## ✅ Phases Shipped & Verified (kept for history)

### Phase 1 — Advanced AI Capabilities ✅
- Multi-Agent Collaboration — `apps/api/src/collaboration/`, `docs/multi-agent-architecture.md`
- OAuth Integration — `apps/api/src/auth/oauth.service.ts`, `docs/oauth-implementation.md`
- Advanced AI Engine (reasoning + reflection) — `apps/api/src/advanced-ai/`

### Phase 2 — CLI Tool ✅
- `apps/cli/src/index.ts` — chat, send, memory, status, config, learn · `docs/cli-tool.md`

### Phase 3 — Security & Compliance ✅ (core)
- AES-256-GCM encryption, audit trail, GDPR/SOC2/HIPAA framework — `apps/api/src/security/`
- WAF shield, constant-time auth, tool sandboxes — commit `3a8a9a0`
- New feature routes protected in middleware — commit `b178d45`

### Phase 4 — Analytics & Monitoring ✅ (core)
- `apps/api/src/analytics/`, `apps/api/src/metrics/`, `apps/api/src/anomaly/` (see Phase 15 for the fake baseline)

### Phase 9 — Core AI Power-Ups — mixed
- [x] Streaming SSE + Socket.IO gateway — `apps/api/src/events/ws.gateway.ts`, `conversations.controller.ts:88-160`
- [x] Delegation sub-agent spawner — `apps/api/src/delegation/subagent.service.ts` (merger is naive)
- [x] Goals: Prisma goal + memory sync + hourly auto-advance — `apps/api/src/goals/`
- [x] Production voice: TTS `apps/api/src/life/tts.service.ts` (ElevenLabs + Fish Audio), Whisper
      `apps/api/src/nanobot/agent/nanobot-voice.service.ts` — **note: not in `apps/api/src/tts|whisper/`**
- [x] Session replay — `apps/api/src/replay/` + `apps/web/src/app/(app)/replay`
- [x] Cost router + spend series — `apps/api/src/cost/`
- [x] Team workspaces: RBAC, invites, shared memory, threads — `apps/api/src/workspaces/`
- [ ] Full-text index / search UI (see Phase 16)
- [ ] Vision upload + analysis pipeline (see Phase 15)

### Phase 10 — UX ✅ (backend) / 🔴 (frontend)
- Backend shipped for templates, pins, reactions, search. **Frontend never built** — see Phase 16.
- Theme override never started on either side.

### Phase 11 — Integrations — partial
- [x] Notion — `apps/api/src/tools/connectors/notion.tool.ts` (read/create/query)
- [x] Google Drive — OAuth + `drive_list_files` only (`apps/api/src/connectors/oauth-providers.ts:90`)
- [x] RSS — `apps/api/src/tools/connectors/news.tool.ts` (2 tools, 17 feed presets)
- [x] URL watcher — `apps/api/src/frontier/watch.service.ts` (SSRF-guarded, LLM-judged)
- [ ] Stripe webhook **working** (blocked by Phase 15), Stripe Connect payouts — explicitly `NotImplementedException`
- [ ] Email inbound catch-all — `apps/api/src/email/email.service.ts` is **outbound SMTP only**
      (`email-autopilot` polls the user's Gmail; `email.received` is a trigger type with no publisher)

### Phase 12 — Developer & Power User
- [x] Tool builder service/controller/module (execution is stubbed — Phase 15)
- [x] Scheduler service/controller/module (execution is a no-op — Phase 15; real cron is in `cron/`)
- [x] Code execution tool (`apps/api/src/tools/connectors/code-execution.tool.ts` — no isolation)
- [ ] API playground — **no implementation anywhere** (types only exist in a proposal doc)
- [ ] Webhook builder — outbound webhooks + delivery logs ✅; inbound→agent lives in
      `proactive-agents/proactive-webhook.controller.ts`; no unified builder or inbound log UI
- [ ] Leaderboard — **types only** (`packages/shared/src/types/leaderboard.ts`), zero backend, zero UI

### Phase 13 — Analytics & Ops
- [x] Cost per conversation, token tracking, per-model pricing, daily series
- [x] Session replay
- [ ] Anomaly spike detection + push/email alerts (Phase 15)

### Phase 14 — Ambitious & Cutting-Edge — mixed
- [x] Browser automation with **real Playwright** — `apps/api/src/browser-automation/browser-automation.service.ts`
      (SSRF guard w/ DNS re-check, approval gates for risky actions, value redaction)
- [ ] DOM accessibility tree — only raw `page.content()`; no `ariaSnapshot()` / role extraction
- [x] Proactive agents — Prisma triggers + logs + real web-push + Telegram + Expo push
- [x] Workflow recorder — `apps/api/src/browser-automation/workflow-recorder.service.ts`
- [ ] War Room consensus (real engine exists in `frontier/roundtable.service.ts`)
- [ ] Local daemon bridge (desktop app does **not** register as a daemon)
- [ ] Generative UI producer + sandbox
- [ ] WebRTC / LiveKit / TURN

### Phase 15+ — Frontier features (commit `02566e2`, 18 features) ✅
Shipped: self-improving lessons, multi-model debate, long-horizon goals, knowledge graph, privacy vault,
sandbox replay, email autopilot, proactive moments, shareable agents + widget, team workspace threads,
billing + marketplace, phone agent, live avatar, time-travel branch compare, workflow recorder,
desktop quick-ask.
- [ ] **Desktop "quick-ask"** is a *screenshot→clipboard→pop-up* helper, not a quick-ask overlay.
      `apps/desktop/src/preload/index.ts` exposes only 3 methods — no quick-ask IPC.

---

## 💡 Phase 18: New Ideas

Prioritised by leverage-per-effort against the gaps above.

### A. Trust & Correctness (do these first — they're cheap and they buy credibility)
1. **Contract tests between the SDK and the API.** A single Vitest suite that walks `packages/sdk/src/api/**`
   and asserts each method maps to a real Nest route. It would have caught the 9 broken fetch paths *and* the
   4 broken agent-versions calls automatically. Highest-leverage test in the repo.
2. **OpenAPI as the single source of truth.** The API already builds Swagger. Generate the SDK types *and* a
   route manifest from it, then fail CI on drift. Fixes the whole class of "frontend calls a 404" bugs.
3. **A `/health` that actually checks.** Currently health means "process is up". Make it verify Postgres,
   Redis, the configured provider, and the background workers (cron tick age, goal-worker tick age).
4. **Fake-data radar.** A CI grep for hard-coded arrays in service files (`[10, 15, 12, 18, 9]`) and
   `console.log` where a notification is expected — this repo's stubs are mostly *silent*, so lint for them.
5. **Dead-endpoint detector.** Diff the set of `@Controller`/`@Get|@Post|...` routes against every URL the web
   app and SDK touch. Emit a report on every PR.

### B. Make the frontier features real (they're the product story right now)
6. **Turn the debate arena into a real tournament.** The `/debate` page already has a judge — add
   Elo-rated model leaderboards fed by the same debate runs, plus a "rematch" button. This kills the
   orphaned `leaderboard.ts` types with data that already flows.
7. **Time-travel → branch-and-compare as a first-class primitive.** `conversation-tree.service.ts` exists;
   the compare page is manual. Add "fork from this message" with the branch carrying its own artifact,
   cost, and lesson set — the lessons feature already has a store to write into.
8. **Goal planner with tool execution.** `goal-planner.service.ts` `executeStep()` is LLM-only ("cannot take
   external actions"). Let steps declare tools, route through the existing approvals pipeline, and post
   results back to the goal thread. That turns "plans" into "autonomy".
9. **Knowledge graph as a retrieval layer, not a visualisation.** `graph.service.ts` builds a real graph —
   wire it into the agent's context assembly so every answer cites the graph entities it used.
10. **Privacy vault as a policy, not a page.** The vault has local-only mode + sensitive-memory toggles;
    enforce them in `agent.service.ts` context assembly and add a per-request redaction audit row.

### C. Product loops that make the platform sticky
11. **Mission digest.** The morning-briefing machinery already exists; make it a *digest of what the agent
    did while you were away* — runs, approvals waiting, goals advanced, budget burn.
12. **Approval inbox on steroids.** Approvals are per-request and blocking. Add **bundles** ("approve 8 read-only
    browser steps at once"), TTLs, and role-scoped auto-approve rules so trusted agents stop stalling.
13. **Replay as a debugging primitive.** `replay.service.ts` reconstructs runs beautifully. Add "re-run this run
    with a different model" and a diff of the two outputs. That is a killer dev-tool and the data already exists.
14. **Cost → outcome attribution.** `cost.service.ts` tracks spend per model; `reactions`/`ab-testing` track
    outcome. Join them: "the $0.12 model wins 73% of tasks". Auto-route on that. The router already exists.
15. **Onboarding that actually onboards.** `/settings/get-started` exists; wire it to real health checks so the
    checklist reflects live state (provider configured? DB migrated? Ollama reachable?).
16. **Public agent widget → viral loop.** `public-agents` + `widget.js` exist. Add per-agent "powered by
    OpenAgents" attribution, a share-card image, and a hosted demo transcript.

### D. Platform & extensibility
17. **MCP server + marketplace.** The repo already speaks MCP for plugins (`/plugins`, `skill-registry`).
    Expose OpenAgents itself as an MCP server so other agents can call your agents — and expose your
    50+ tools over MCP for other clients.
18. **Plugin sandboxing.** Plugins run in-process today. Move them to a worker/child-process with a capability
    manifest (network, fs, secrets), mirroring the tool-builder stub's intent.
19. **Real tool-builder code generation.** The schema generator already works. Add "generate a typed TS SDK
    client for this webhook/tool" as the export path — turns a 4-minute task into a shipped SDK method.
20. **A `packages/sdk` React hooks layer.** Every page hand-rolls fetch + state. Ship `useQuery`-style hooks
    from the SDK so the mismatch class of bugs becomes impossible.
21. **Provider-agnostic tool-call streaming.** Normalise Anthropic/OpenAI/Gemini/Ollama delta formats into one
    `delta` event at the edge, so the frontend has exactly one streaming contract to implement.
22. **Multi-tenant workspaces as first-class tenancy.** Workspaces have roles today; add tenant isolation
    (schema-level `workspaceId` scoping), which unblocks real SaaS self-hosting.

### E. Mobile & desktop (currently the weakest surfaces)
23. **Real mobile chat** — markdown, streaming, attachments, voice, code blocks. The store already receives
    events; only the rendering is missing.
24. **Desktop quick-ask overlay** — global hotkey → inline omnibox → agent answer → paste to focused window.
    The `desktopCapturer` plumbing exists; the IPC surface doesn't.
25. **Desktop as the local daemon.** The API has `POST /daemon/register` and `POST /daemon/:id/execute`; the
    Electron app never registers. Making it the daemon would turn the stub into a real local-execution
    capability (with an allow-list) — the single highest-value desktop feature.

---

## 📋 Implementation Priority (updated)

### 🔥 Immediate (week 1) — credibility
1. ~~`main.ts` → `{ rawBody: true }`~~ ✅ **done**
2. ~~Fix the 6 broken web fetch paths + the 4 agent-versions calls~~ ✅ **done**
3. ~~Real conversation search (`content` filter + `tsvector` index)~~ ✅ **done**
4. ~~Resolve the duplicate `/conversations/search` route~~ ✅ **done**
5. ~~Anomaly baseline from `MetricLog` + wire `PushService`~~ ✅ **done**
6. ~~Wire `vision.service.ts` to `parseMultimodalContent()`~~ ✅ **done**
7. ~~Add an SDK↔route contract test so the "web calls a 404" class of bug can never come back~~ ✅ **done**
   (`apps/api/src/contracts/route-contract.test.ts` — 735 routes, 511 SDK calls, 15 web fetches)
8. ~~`prisma db push` does not manage the GIN index; document `DISABLE_SEARCH_INDEX_BOOTSTRAP`~~ ✅ **done**
   (the index is created in `onModuleInit`; the env var disables it)

### 📈 Next (weeks 2–4) — make it real
9. Re-point the roundtable (`frontier/roundtable.service.ts`) at the same debate engine, so both
    surfaces behave the same
10. Token streaming for the **tool results** too (the text and the tool *arguments* stream; the
    tool's output still arrives whole)
11. Container/VM isolation for `code_execute` and `shell_execute` (they still run on the API host)
12. Local daemon: real WebSocket bridge so the Electron app can execute local commands
13. Merge the duplicate scheduler UIs — `/scheduler` and `/control/cron-jobs` now show the same jobs;
    fold the run history + self-heal view into `/scheduler` and drop one page
14. Enable BullMQ in Docker/prod so background jobs survive restarts and scale horizontally
15. Move the last file-backed feature state: `platform/`, `labs/` and the nanobot marketplace packs

### 🚀 Then (month 2+) — product depth
16. Goal planner tool execution + approvals
17. Replay → "re-run with a different model" diff
18. SDK React hooks + generated OpenAPI client
19. OpenAgents as an MCP server
20. Electron as local daemon
21. Mobile chat parity

### 🧭 Deferred (explicitly not now)
- CRM/ERP integrations, Kubernetes, custom model training, HA — the platform isn't the bottleneck; the
  correctness of what's already built is.
