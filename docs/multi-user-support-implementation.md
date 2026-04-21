# Multi-User Support Implementation Plan

This document turns the backlog item for multi-user support into a grounded implementation plan based on the current OpenAgents codebase.

It assumes the current baseline already exists:

- Prisma models for `Workspace`, `WorkspaceMember`, `WorkspaceInvitation`, `WorkspaceConversation`, `WorkspaceWorkflow`, and `WorkspaceMemoryEntry`
- API endpoints in `apps/api/src/workspaces/workspaces.controller.ts`
- invite and accept flows in `apps/api/src/workspaces/workspaces.service.ts`
- a Team Workspaces UI in `apps/web/src/app/(app)/workspaces/page.tsx`

## Current State

OpenAgents already has a workspace-based collaboration foundation.

What exists now:

- users can create workspaces
- users can invite collaborators by email
- invited users can accept pending invitations
- workspaces can share conversations, workflows, artifacts, and memory entries
- workspace settings already include invite policy, default role, and shared memory / shared agents toggles

What is still missing for real multi-user support:

- full invitation lifecycle management beyond accept-only flows
- durable member administration and member removal / suspension
- true shared conversation authorship and access control
- workspace-scoped pinned references and goal tracking
- clean separation between personal memory and shared workspace memory
- auditability for membership, sharing, and permission changes
- convergence on one canonical type model for collaboration

## Canonical Model Decision

OpenAgents should use the existing workspace model as the canonical multi-user abstraction.

Reasoning:

- `Workspace` already exists in the Prisma schema and API
- the web app already exposes a Team Workspaces surface
- collaboration types already live in `packages/shared/src/types/collaboration.ts`
- adding a second top-level `Team` abstraction from `packages/shared/src/types/multi-user.ts` would duplicate ownership, roles, and workspace membership concepts

Decision:

- keep `Workspace` as the top-level shared container
- treat members, invitations, shared memory, shared conversations, and shared assets as workspace capabilities
- fold or deprecate `packages/shared/src/types/multi-user.ts` in favor of the workspace/collaboration types once implementation work begins

## Gaps In The Current Data Model

The current schema is close, but it still models collaboration as shared access to primarily single-user data.

The main gaps are:

1. `Conversation` is still owned by a single `userId`
2. `Message` does not record a human author identity beyond the generic `role`
3. invitations can be accepted, but the lifecycle is not fully represented operationally
4. member state is effectively binary instead of managed over time
5. there is no workspace-scoped pin or goal model yet

## Proposed Schema Changes

### 1. Strengthen Workspace Membership

Keep the existing models and extend them.

#### `Workspace`

Add or confirm support for:

- `slug String? @unique`
- `visibility String @default("private")`
- `archivedAt DateTime?`
- `lastActivityAt DateTime?`

Purpose:

- stable routing
- future workspace switching UX
- clearer active vs archived workspace state

#### `WorkspaceMember`

Add:

- `status String @default("active")` // active | suspended | removed
- `lastActiveAt DateTime?`
- `removedAt DateTime?`
- `removedByUserId String?`

Purpose:

- suspend or remove members without destroying history
- support admin UI, audits, and team activity views

#### `WorkspaceInvitation`

Add:

- `respondedAt DateTime?`
- `acceptedByUserId String?`
- `revokedAt DateTime?`
- `revokedByUserId String?`
- `message String?`

Status should explicitly support:

- `pending`
- `accepted`
- `declined`
- `expired`
- `revoked`

Purpose:

- complete the invite lifecycle already implied by the product requirement
- enable decline, revoke, resend, and audit-safe invite handling

### 2. Make Conversations Workspace-Aware

The current share table is useful for MVP sharing, but not enough for true collaborative chat.

#### `Conversation`

Add:

- `workspaceId String?`
- `createdByUserId String?`
- `visibility String @default("private")` // private | workspace

Keep `userId` during migration for backward compatibility, then treat it as the personal owner for legacy conversations.

#### New `ConversationParticipant`

Create:

```prisma
model ConversationParticipant {
  id             String   @id @default(cuid())
  conversationId String
  userId         String
  role           String   @default("viewer") // owner | editor | viewer
  joinedAt       DateTime @default(now())
  lastReadAt     DateTime?

  @@unique([conversationId, userId])
  @@index([userId, joinedAt])
}
```

Purpose:

- multiple humans can access the same workspace conversation
- read/write permissions become explicit instead of inferred

#### `Message`

Add:

- `authorUserId String?`
- `workspaceId String?`

Purpose:

- show which workspace member authored a user message
- support replay, audit, and shared chat UI attribution

### 3. Add Workspace Pins

Create:

```prisma
model WorkspacePin {
  id             String   @id @default(cuid())
  workspaceId     String
  entityType      String   // message | conversation | artifact | workflow | memory
  entityId        String
  label           String?
  pinnedByUserId  String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([workspaceId, createdAt])
  @@unique([workspaceId, entityType, entityId])
}
```

Purpose:

- satisfy the pinned-message requirement in a reusable way
- allow a persistent sidebar across workspace surfaces

### 4. Add Workspace Goals

Create:

```prisma
model WorkspaceGoal {
  id              String   @id @default(cuid())
  workspaceId      String
  title            String
  description      String?
  status           String   @default("active") // active | paused | completed | archived
  priority         String   @default("medium")
  ownerUserId      String?
  createdByUserId  String
  linkedConversationId String?
  dueAt            DateTime?
  resumedAt        DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([workspaceId, status, updatedAt])
}
```

Purpose:

- support long-term goal tracking in a shared workspace context
- enable auto-resume and workspace onboarding summaries later

### 5. Add Audit Events For Collaboration

If a dedicated workspace audit model is preferred, add one. Otherwise extend the existing audit system.

Minimum event coverage:

- invitation sent
- invitation accepted
- invitation declined
- invitation revoked
- member role changed
- member suspended or removed
- conversation shared to workspace
- workspace pin created or removed
- workspace goal created, resumed, completed, or archived

## API Plan

Extend the existing `workspaces` module instead of creating a parallel `team` module first.

### Phase A: Finish Membership Lifecycle

Add endpoints for:

- `POST /workspaces/:id/invitations`
- `POST /workspaces/invitations/:invitationId/accept`
- `POST /workspaces/invitations/:invitationId/decline`
- `POST /workspaces/invitations/:invitationId/revoke`
- `POST /workspaces/invitations/:invitationId/resend`
- `PATCH /workspaces/:id/members/:memberId`
- `DELETE /workspaces/:id/members/:memberId`

Behavior rules:

- owner cannot be removed by non-owner users
- admins can manage editors and viewers, but not transfer ownership
- invite creation respects `allowMemberInvites`
- declined or revoked invites are terminal
- expired invites can be resent by creating a fresh expiry window

### Phase B: Workspace-Scoped Conversation Access

Add endpoints for:

- `POST /workspaces/:id/conversations`
- `GET /workspaces/:id/conversations`
- `GET /workspaces/:id/conversations/:conversationId/messages`
- `POST /workspaces/:id/conversations/:conversationId/messages`
- `POST /workspaces/:id/conversations/:conversationId/participants`

Migration rule:

- keep `shareConversation` for legacy personal-to-workspace promotion
- new workspace conversations should be created as workspace-native conversations instead of personal conversations with a share link

### Phase C: Pins And Goals

Add endpoints for:

- `GET /workspaces/:id/pins`
- `POST /workspaces/:id/pins`
- `DELETE /workspaces/:id/pins/:pinId`
- `GET /workspaces/:id/goals`
- `POST /workspaces/:id/goals`
- `PATCH /workspaces/:id/goals/:goalId`
- `POST /workspaces/:id/goals/:goalId/resume`

## UI Plan

The current Team Workspaces page should evolve into a real collaboration hub, not just a workspace administration form.

### 1. Workspace Switcher

Primary flows:

- switch between personal and shared workspaces
- show current role badge
- show pending invite count
- show archived workspaces separately

### 2. Invitation Inbox

Current state already shows pending invitations.

Add:

- accept
- decline
- view inviter and workspace name
- expired and revoked states

### 3. Members Panel

Add:

- member list with display name, email, role, and last active time
- role change action
- suspend / remove action
- owner-only transfer ownership flow
- invite history and resend / revoke controls

### 4. Shared Chat Experience

This is the largest UX gap.

Add:

- create conversation inside a selected workspace
- show participant avatars in the conversation header
- attribute each human-authored message to a member
- support read-only access for viewers
- support sidebar filters for mine, shared, and archived

### 5. Shared Sidebar

Add a persistent workspace sidebar with:

- pinned messages
- pinned artifacts
- active goals
- shared memory highlights
- recent member activity

### 6. Personal vs Shared Memory UX

Do not merge personal memory and workspace memory into one undifferentiated list.

Required UX:

- explicit memory scope picker: personal or workspace
- badges on retrieved memory explaining its scope
- permission checks before saving to workspace memory
- owner/admin controls for editing or deleting shared memory

## Permission Model

Keep the existing role ladder:

- `owner`
- `admin`
- `editor`
- `viewer`

Recommended behavior:

- `owner`: full control, transfer ownership, delete workspace
- `admin`: manage members, invitations, pins, goals, workspace settings, shared assets
- `editor`: create and edit shared conversations, memory, pins, goals, workflows, and artifacts
- `viewer`: read shared conversations, memory, pins, goals, workflows, and artifacts

Do not add a `guest` role until there is a concrete external-sharing requirement. The extra role exists in `packages/shared/src/types/multi-user.ts`, but it does not map cleanly to the current workspace implementation.

## Migration Strategy

### Step 1: Type Convergence

- keep `packages/shared/src/types/collaboration.ts` as the source of truth
- mark `packages/shared/src/types/multi-user.ts` as legacy or merge its useful fields into collaboration types
- avoid shipping both `Team` and `Workspace` abstractions to the frontend API at the same time

### Step 2: Membership Lifecycle

- add decline, revoke, resend, suspend, and remove flows without changing conversation ownership yet
- this is the lowest-risk first release and improves the existing page immediately

### Step 3: Workspace-Native Conversations

- add `workspaceId` and participant support
- continue to support legacy personal conversations
- migrate shared conversation creation to workspace-native records

### Step 4: Pins And Goals

- add workspace pins first because the model is simpler and immediately visible
- add workspace goals next and connect them to auto-resume later

### Step 5: Audit And Analytics

- track member events, invite funnel metrics, and shared conversation activity
- use that data later for team analytics and anomaly detection

## Suggested Delivery Order

1. Invitation lifecycle completion
2. Member administration
3. Workspace-native conversations and participants
4. Shared message authorship
5. Workspace pins
6. Workspace goals
7. Audit and team analytics

## Acceptance Criteria

Multi-user support should not be considered complete until all of the following are true:

- a user can invite, revoke, resend, accept, or decline workspace invitations
- admins can change member roles and remove or suspend members
- a workspace can host conversations that multiple human users can open and contribute to
- each human-authored shared message is attributable to a specific member
- users can distinguish personal memory from workspace memory at both write time and retrieval time
- users can pin messages or other entities in a persistent workspace sidebar
- users can create and resume shared long-term goals inside a workspace
- permission failures are explicit and audit-safe

## Risks

### 1. Duplicate Collaboration Models

Risk:

- `Workspace` and `Team` abstractions drift and create incompatible APIs

Mitigation:

- converge on workspace-first types before building more surfaces

### 2. Shared Conversation Retrofits

Risk:

- current conversation ownership is single-user and will cause authorization edge cases if only patched superficially

Mitigation:

- introduce participant records instead of relying only on share tables

### 3. Memory Scope Confusion

Risk:

- users accidentally save private context into shared memory

Mitigation:

- make scope explicit in the composer and retrieval UI

### 4. Role Creep

Risk:

- adding more roles too early complicates the authorization surface

Mitigation:

- keep the current four-role ladder until there is a real business case for more

## Recommended First Build Slice

Start with membership lifecycle completion inside the existing workspaces module.

That slice is the best first move because:

- the schema already supports most of it
- the web page already exposes pending invites and member lists
- it closes the visible gap between the current MVP and the advertised multi-user feature
- it does not require the higher-risk conversation ownership migration yet