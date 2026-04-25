# Agent Visibility & UX Features

This document tracks the implementation of features that make the agent feel alive, responsive, and always visible - matching the premium feel of Claude/GPT-4o/Gemini.

---

## ✅ Implemented

### 1. Agent Mode End-to-End Wiring (Done)
- Mode parameter flows: ChatWindow → chat store → SDK → API → agent service
- Backend injects mode behavior privately via `modeAppendix` in system prompt
- Frontend no longer shows mode operating instructions in user message bubble
- Default mode: `autopilot` (full autonomous execution)

### 2. Status Tracking (Done)
- Progress state calculation with percentage
- Workflow detection for image/video generation
- Artifact tracking and display
- Status labels and ETA calculation

### 3. Thinking Chain Events (Done)
- Backend emits `thinking` events during agent execution
- Events: `Analyzing your request...`, `Building execution plan...`
- Frontend can render these as visible "thought trail"
- `emit('thinking', { step, message })` pattern ready for frontend to consume

---

## 🚧 In Progress

### 3. Visible Inner Monologue (Thinking Chain)
**Status: Planned**

Show the agent's actual reasoning steps in real time, like Claude's extended thinking but styled as a collapsible "thought trail."

**Implementation approach:**
- Backend emits `thinking` events during tool execution
- Frontend renders expandable "thinking" section in MessageBubble
- Events: `Analyzing request...`, `Breaking into subtasks...`, `Checking memory...`, `Planning next action...`
- Collapsible - tap to expand/collapse
- Different style from final response (muted color, smaller text)

**Backend changes needed:**
- `agent.service.ts` - emit thinking events during planning phases
- Add `thinking_chain` event type to stream events

**Frontend changes needed:**
- `MessageBubble.tsx` - render thinking chain when event received
- `chat.ts` - handle new `thinking_update` event type
- `ChatWindow.tsx` - show thinking status in header

### 4. Agent Status Indicator (Heartbeat)
**Status: Planned**

Persistent subtle pulse in the corner showing the agent's current state:
- 💬 Idle - waiting for input
- 🧠 Thinking - processing request
- ⚡ Using a tool - executing action
- 🔍 Searching - web research
- 💾 Saving memory
- ✅ Done

**Implementation:**
- Add status indicator component to ChatWindow header
- CSS animation: subtle pulse for active states
- Color-coded states

---

## 📋 Planned

### 5. Live Tool Call Visualizer
Show a flowing diagram as tools execute: `Message → Tool → Result → Next Tool`

**Implementation:**
- Add tool visualization panel to ChatWindow
- Show tool chain with animated connectors
- Display partial results as they come in
- Color-code by tool type

### 6. Context Summaries on Session Start
Show: "Last time we worked on X. Continue or start fresh?"

**Implementation:**
- On conversation load, check for memory summary
- Display one-shot summary banner before first message
- "Continue" or "Start fresh" buttons

### 7. Proactive Memory Prompts
After significant info: "Should I remember that your deadline is Friday?"

**Implementation:**
- Backend detects key info (dates, preferences, projects)
- Emits `memory_suggestion` event
- Frontend shows toast/banner with one-tap save

### 8. Confidence Meter
Agent shows confidence (High/Medium/Low) with brief reason.

**Implementation:**
- Backend generates confidence score after response
- Frontend shows small badge below message
- Low confidence triggers "Verify this?" button

### 9. Source Citations Inline
Factual claims link directly to sources within message.

**Implementation:**
- Backend attaches source URLs to response
- Frontend renders as inline links
- Different style from regular links (subtle underline)

### 10. Auto-Summarize Long Context
When conversation gets long (>50 messages): "This conversation is getting long. Summarize?"

**Implementation:**
- Count messages on each addition
- Show banner with summarize button
- One-tap summary replaces oldest messages

---

## 🔮 Future (Nice to Have)

- Agent persona builder (name, voice, avatar)
- Morning briefing (auto-daily digest)
- Draft-on-hover (background reply drafting)
- Voice personality (TTS responses)
- Specialist agents panel (Researcher, Coder, Writer)
- Agent handoff notes between sub-agents
- Haptic micro-animations on tool execution