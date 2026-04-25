# Agent Visibility & UX Features

This document tracks the implementation of features that make the agent feel alive, responsive, and always visible - matching the premium feel of Claude/GPT-4o/Gemini.

---

## ✅ Implemented

### 1. Agent Mode End-to-End Wiring
- Mode parameter flows: ChatWindow → chat store → SDK → API → agent service
- Backend injects mode behavior privately via system prompt
- Frontend no longer shows mode operating instructions in user message bubble
- Default mode: `autopilot` (full autonomous execution)

### 2. Status Tracking
- Progress state calculation with percentage
- Workflow detection for image/video generation
- Artifact tracking and display
- Status labels and ETA calculation

### 3. Thinking Chain Events (Backend)
- Backend emits `thinking` events during agent execution
- Events: `Analyzing your request...`, `Building execution plan...`
- `emit('thinking', { step, message })` pattern ready for frontend to consume

---

## 🚧 In Progress

### 4. Thinking Chain UI (Frontend Rendering)
**Status: In Progress**

Render emitted `thinking` events as animated expanding "thought trail" above the answer.

**Frontend changes needed:**
- `chat.ts` - handle new `thinking` event, store thinking steps in state
- `MessageBubble.tsx` - render thinking chain as expandable section above response
- CSS: animated expanding text, muted color, monospace font, collapsible

**Design:**
- Small muted text like "🧠 Analyzing your request..."
- Expands to show full chain of thoughts
- Animates as new thoughts appear
- Tap to collapse/expand
- Different from final response styling

### 5. Agent Heartbeat Indicator
**Status: Planned**

Subtle pulsing dot in corner of chat header:
- ⚫ Gray = idle
- 🟡 Yellow = thinking/processing
- 🟢 Green = done/success
- 🔴 Red = error

**Implementation:**
- Add `AgentStatusDot` component to ChatWindow header
- CSS animation: subtle pulse scale 1.0→1.1 for active states
- Reads from `useChatStore.agentStatus`
- Color transitions with CSS

---

## 📋 Priority Features

### 6. Typing Speed Variation
Stream tokens with varying speed:
- Fast (40ms/token) for simple quick answers
- Normal (25ms/token) for regular responses
- Slow (15ms/token) for complex reasoning/multi-step
- Algorithm based on response complexity score

### 7. Idle Return Greeting
After 30+ minutes of inactivity:
- Detect when user returns
- Show: "Welcome back — want to pick up where we left off?"
- Based on `lastMessageAt` timestamp check

### 8. Auto-Memory Extraction
After conversations:
- Scan for learnable facts (jobs, preferences, projects, contacts)
- Auto-save to memory silently
- Show subtle confirmation toast: "Saved to memory"

### 9. Confidence Meter (Backend Ready)
Agent shows confidence (High/Medium/Low) after responses:
- `AGENT_SELF_EVAL=true` enables self-evaluation
- Embeds `<confidence score="3/5">reason</confidence>` in response
- Frontend renders as colored badge below message

### 10. Context Timeline (Sidebar)
Visual sidebar showing all loaded facts about user:
- Grouped by category: Work, Projects, Preferences, People
- Toggle visibility
- Shows which facts come from which conversation

---

## 📋 Cross-Conversation Features

### 11. Cross-Conversation References
When referencing past conversations:
- "You asked about this 3 weeks ago — here's what changed since then"
- Stored in memory with timestamps
- Triggered when similar topics arise

### 12. Memory Conflict Detection
If new info contradicts old memory:
- Flag the conflict
- Ask: "You mentioned X before, but now you say Y. Which is correct?"
- Update memory accordingly

### 13. Context Summaries on Session Start
On conversation load:
- Check for memory summary
- Show: "Last time we worked on X. Continue or start fresh?"
- "Continue" or "Start fresh" buttons

---

## 🤖 Autonomous & Multi-Agent

### 14. Goal Persistence
Multi-day goals across sessions:
- Set goal once, agent works on it incrementally
- Reports progress on each login
- Stores partial progress in memory

### 15. Scheduled Agent Runs
Recurring tasks:
- "Every Monday morning summarize emails"
- Uses scheduling system
- Posts digest to memory/channel

### 16. Trigger-Based Agents
If-this-then-that:
- "When new file added to Google Drive, summarize and notify"
- Event-driven execution
- Stored as automation rules

### 17. Specialist Roster
Named persistent sub-agents:
- Researcher, Coder, Critic, Writer
- Each with own memory slice and personality
- Summon with @mention in chat

### 18. Agent Audit Trail
Full replay timeline:
- Every decision, tool call, branch taken
- Stored as structured event log
- Viewable as timeline visualization

### 19. Human-in-the-Loop Escalation
Agent detects when stuck:
- Pauses execution
- Says: "I need your input on this one thing before I continue"
- Highlights the decision point

### 20. Agent Debate Mode
Two agents argue opposite positions:
- User picks topic
- Agent A vs Agent B debate
- Watch and pick winner

---

## 🔊 Voice & Presence

### 21. Full Duplex Voice
- Hold to talk, agent responds in audio
- Persistent voice session
- Feels like a phone call

### 22. Voice Persona
- Choose agent voice (calm/energetic/serious/friendly)
- Consistent across TTS responses
- Stored as user preference

### 23. Audio Summaries
- Auto-generate 60-second audio briefing after long research
- Playable while doing other things
- Generated via TTS

---

## ⚡ Power User Features

### 24. Prompt Diff Viewer
When editing prompts/presets:
- Show visual diff of what changed
- Explain how it affects agent behavior
- Side-by-side comparison

### 25. Token Budget Control
Slider in chat:
- "Use up to X tokens on this reply"
- Cheap mode for quick answers
- Deep mode for research

### 26. Agent Sandbox
Test new configs:
- Isolated environment
- Test against sample prompts
- Before deploying live

### 27. API Usage Forecasting
Predict monthly cost:
- Based on usage patterns
- Warn if trending high
- Show projected bill

### 28. One-Click Agent Sharing
Export presets:
- Shareable link
- Others import into their OpenAgents
- Community presets

---

## 📱 Mobile-First

### 29. Widget / Home Screen Agent
iOS/Android:
- Shows last agent message
- Lets you reply without opening app
- Quick actions

### 30. Voice-First Mobile Mode
On mobile:
- Default to voice input
- Agent response auto-plays as audio
- No typing needed

### 31. Swipe Actions
On messages:
- Swipe left = branch conversation
- Swipe right = save to memory
- Long-press = run follow-up

---

## 🔮 Future (Nice to Have)

- Agent persona builder (name, voice, avatar)
- Morning briefing (auto-daily digest)
- Draft-on-hover (background reply drafting)
- Haptic micro-animations on tool execution