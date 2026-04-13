# Multi-Agent Collaboration Architecture

## Overview

OpenAgents is a general-purpose AI agent platform designed for handling complex, long-horizon tasks through multi-agent collaboration. The platform powers content creation, coding, research, and multimodal generation using a sophisticated multi-agent system that breaks down tasks, plans steps, and executes subtasks.

## Core Capabilities

### 1. Multi-Agent System (MCP Protocol)

The platform uses the Model Context Protocol (MCP) to enable seamless integration with external tools and services:

- **MCP Server Integration**: Full stdio MCP server support for connecting to external MCP servers
- **Tool Discovery**: Auto-discovery of external tools at runtime with naming convention `mcp_<serverId>_<toolName>`
- **Approval Gating**: MCP tools are gated based on `readOnlyHint` for security
- **Dynamic Tool Composition**: Tools from multiple MCP servers can be composed together

### 2. Task Breakdown & Planning

The platform implements sophisticated task decomposition:

- **ResearchService**: Autonomous goal execution with plan-and-act flow
- **NanobotOrchestrationService**: Manages planner/executor/reviewer roles
- **Policy Evaluation**: Each step is evaluated against policies before execution
- **Parallel Delegation**: Tasks can be delegated to multiple agents simultaneously

### 3. Tool Integration

Comprehensive tool support including:

- **Built-in Tools**: Gmail, Calendar, Web search, Computer use, Cron, Notes
- **MCP Integration**: Extensible through MCP server connections
- **Approval System**: Sensitive operations require user approval
- **Dry-run Previews**: Actions can be previewed before execution

### 4. File Operations & Shell Commands

- **Memory File System**: Persistent files including SOUL.md, USER.md, MEMORY.md, HEARTBEAT.md
- **Local Knowledge Sync**: Sync local files and folders as knowledge sources
- **CRUD Operations**: Full create, read, update, delete on memory entries

### 5. Persistent Memory

PostgreSQL-backed memory system with:

- **Memory Facts**: Structured facts with confidence scores
- **Memory Events**: Time-stamped events with temporal decay
- **Conflict Resolution**: Automatic detection and resolution of conflicting memories
- **Memory Curation**: Nightly summarization and deduplication

## Enhanced Multi-Agent Collaboration

### Agent Teams

Teams of specialized agents can be created with defined roles:

```typescript
interface AgentTeam {
  id: string
  name: string
  userId: string
  roles: AgentRole[]
  members: AgentTeamMember[]
  sharedBlackboard: SharedBlackboard
  collaborationProtocol: CollaborationProtocol
}
```

**Agent Specializations:**
- `researcher` - Information gathering and analysis
- `builder` - Code generation and implementation
- `operator` - Tool execution and automation
- `reviewer` - Quality assurance and validation
- `planner` - Task decomposition and planning
- `coordinator` - Team coordination and communication
- `critic` - Critical analysis and risk assessment
- `synthesizer` - Result synthesis and summarization

### Shared Blackboard

A collaborative workspace for inter-agent communication:

```typescript
interface SharedBlackboard {
  id: string
  teamId: string
  entries: BlackboardEntry[]
  locks: BlackboardLock[]
  version: number
  lastUpdated: string
}
```

**Entry Types:**
- `fact` - Shared knowledge fact
- `hypothesis` - Proposed explanation or prediction
- `plan` - Current execution plan
- `result` - Task execution result
- `constraint` - Problem constraint or requirement
- `question` - Open question for the team
- `decision` - Made decision with rationale
- `artifact` - Generated artifact reference

### Negotiation Protocol

Agents can negotiate to resolve disagreements:

```typescript
interface NegotiationSession {
  id: string
  teamId: string
  topic: string
  participants: string[]
  proposals: NegotiationProposal[]
  currentRound: number
  maxRounds: number
  status: 'active' | 'resolved' | 'deadlocked' | 'abandoned'
}
```

**Negotiation Outcomes:**
- `consensus` - All agents agree
- `compromise` - Partial agreement with concessions
- `majority` - Majority wins
- `arbitration` - Coordinator decides
- `merge` - Proposals combined

### Consensus Mechanisms

Formal voting rounds for team decisions:

```typescript
interface ConsensusRound {
  id: string
  teamId: string
  topic: string
  proposal: string
  voters: ConsensusVoter[]
  threshold: number
  status: 'active' | 'reached' | 'failed' | 'timeout'
}
```

### Agent Communication

Message-based communication between agents:

```typescript
type MessageType = 
  | 'inform' | 'request' | 'propose' | 'accept' | 'reject'
  | 'challenge' | 'query' | 'answer' | 'coordinate' | 'sync' | 'alert'
```

## API Reference

### Team Management

```
POST /collaboration/teams?userId={userId}
GET /collaboration/teams?userId={userId}&limit={limit}
GET /collaboration/teams/:teamId?userId={userId}
PATCH /collaboration/teams/:teamId/status
```

### Shared Blackboard

```
GET /collaboration/teams/:teamId/blackboard
POST /collaboration/teams/:teamId/blackboard/entries
GET /collaboration/teams/:teamId/blackboard/entries?type={type}&tags={tags}
POST /collaboration/blackboard/entries/:entryId/endorse
POST /collaboration/blackboard/entries/:entryId/challenge
PATCH /collaboration/blackboard/entries/:entryId/challenges/:challengeId/resolve
POST /collaboration/blackboard/entries/:entryId/lock
DELETE /collaboration/blackboard/entries/:entryId/lock
```

### Negotiation

```
POST /collaboration/negotiations?teamId={teamId}
GET /collaboration/negotiations/:sessionId
POST /collaboration/negotiations/:sessionId/proposals
POST /collaboration/negotiations/:sessionId/vote
```

### Consensus

```
POST /collaboration/consensus?teamId={teamId}
GET /collaboration/consensus/:roundId
POST /collaboration/consensus/:roundId/vote
```

### Messaging

```
GET /collaboration/teams/:teamId/messages?limit={limit}&type={type}
POST /collaboration/teams/:teamId/messages/:messageId/acknowledge
```

### Task Delegation

```
POST /collaboration/teams/:teamId/delegations
POST /collaboration/delegations/:delegationId/accept
POST /collaboration/delegations/:delegationId/complete
```

### Metrics

```
GET /collaboration/teams/:teamId/metrics
POST /collaboration/teams/:teamId/activity
```

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenAgents Platform                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Nanobot   │  │  Research   │  │ Collaboration│             │
│  │   Module    │  │   Service   │  │   Service   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                 │                 │                   │
│  ┌──────┴─────────────────┴─────────────────┴──────┐           │
│  │                   Agent Core                     │           │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │           │
│  │  │ Planner │  │Executor │  │ Reviewer│         │           │
│  │  └─────────┘  └─────────┘  └─────────┘         │           │
│  └─────────────────────────────────────────────────┘           │
│                              │                                  │
│  ┌───────────────────────────┴───────────────────────────┐     │
│  │                    Tool Layer                         │     │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │     │
│  │  │ Built-in│  │   MCP   │  │  File   │  │  Shell  │ │     │
│  │  │  Tools  │  │ Server  │  │  Ops    │  │ Commands│ │     │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘ │     │
│  └─────────────────────────────────────────────────────┘     │
│                              │                                  │
│  ┌───────────────────────────┴───────────────────────────┐     │
│  │                   Memory Layer                        │     │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐              │     │
│  │  │  Facts  │  │ Events  │  │Conflicts│              │     │
│  │  └─────────┘  └─────────┘  └─────────┘              │     │
│  └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Task Input**: User provides a high-level objective
2. **Role Assignment**: System assigns appropriate agent roles
3. **Planning Phase**: Planner agent decomposes task into steps
4. **Execution Phase**: Executor agents perform actions using tools
5. **Review Phase**: Reviewer agents validate results
6. **Synthesis**: Results are synthesized and presented to user

## Security & Approvals

- **Approval Gating**: Sensitive operations require explicit user approval
- **Read-Only Hints**: MCP tools are categorized by safety level
- **PII Redaction**: Automatic detection and redaction of sensitive data
- **Audit Logging**: All agent actions are logged for traceability

## Performance Optimizations

- **Parallel Execution**: Independent tasks run concurrently
- **Caching**: Results are cached to avoid redundant work
- **Memory Decay**: Old memories decay in confidence over time
- **Resource Limits**: Configurable limits on parallel tasks and memory

## Future Enhancements

1. **Enhanced Agent-to-Agent Communication**: More sophisticated protocols
2. **Hierarchical Task Network Planning**: Advanced planning algorithms
3. **Distributed Memory Synchronization**: Cross-user memory sharing
4. **Dynamic Tool Composition**: Automatic tool chain creation
5. **Learning from Feedback**: Agents improve based on user feedback