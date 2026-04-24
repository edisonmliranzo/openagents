'use client'

export type AssistantMode = 'assist' | 'plan' | 'execute' | 'autopilot'

export interface AssistantModeDefinition {
  id: AssistantMode
  label: string
  caption: string
  description: string
  placeholder: string
  starterPrompts: string[]
  executionRules: string[]
}

export const ASSISTANT_MODE_STORAGE_KEY = 'openagents.chat.assistant-mode'

export const ASSISTANT_MODE_DEFINITIONS: AssistantModeDefinition[] = [
  {
    id: 'assist',
    label: 'Assist',
    caption: 'Conversational',
    description: 'Best for general help, drafting, summaries, and quick answers.',
    placeholder: 'Ask your assistant to help, draft, summarize, or think through a task...',
    starterPrompts: [
      'Summarize what matters most from this session and tell me what to do next.',
      'Draft a clear response I can send to a customer about an urgent delivery issue.',
      'Turn these scattered notes into a clean plan with priorities and risks.',
      'Explain the tradeoffs between these two approaches in plain language.',
    ],
    executionRules: [
      'Be concise, helpful, and conversational.',
      'Execute only when the user clearly asks or when execution is obviously helpful.',
      'Prefer clarity and good judgment over raw tool use.',
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    caption: 'Think first',
    description: 'Decompose work, sequence steps, and avoid taking action until the path is clear.',
    placeholder: 'Ask for a plan, breakdown, checklist, or recommended next steps...',
    starterPrompts: [
      'Break this project into phases, milestones, and the first three actions I should take.',
      'Make a plan to ship this feature with risks, dependencies, and fallback options.',
      'Turn this goal into a weekly execution plan with owners and checkpoints.',
      'Review this request and tell me what information is missing before execution.',
    ],
    executionRules: [
      'Focus on decomposition, sequencing, and identifying blockers.',
      'Do not take external actions or tool-driven changes unless the user explicitly asks to execute.',
      'Surface assumptions, risks, and what should happen next.',
    ],
  },
  {
    id: 'execute',
    label: 'Execute',
    caption: 'Do the work',
    description: 'Prefer taking concrete actions, using tools when useful, and driving toward completion.',
    placeholder: 'Ask the assistant to complete a task end-to-end and use tools where needed...',
    starterPrompts: [
      'Research this problem, gather what you need, and then produce the final answer.',
      'Create the first draft, clean it up, and prepare it so I can send or publish it.',
      'Use the available tools to complete this task and only stop if you hit a real blocker.',
      'Handle this request with the fastest safe path and tell me what changed.',
    ],
    executionRules: [
      'Prefer concrete progress over discussion-only responses.',
      'Use tools when they materially help complete the request.',
      'If approval is required, queue it and keep the user informed with short updates.',
    ],
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    caption: 'Proactive',
    description: 'Act like an operator: chain steps together, minimize back-and-forth, and keep moving until blocked.',
    placeholder: 'Give the assistant an outcome, not just a question...',
    starterPrompts: [
      'Own this task until it is complete, and only interrupt me if you need approval or missing information.',
      'Monitor this issue, keep track of changes, and tell me when intervention is needed.',
      'Turn this repeated task into a reusable watcher or workflow with a clean operating loop.',
      'Handle this like a chief of staff: plan, execute, follow up, and report back with outcomes.',
    ],
    executionRules: [
      'Work proactively and complete the request end-to-end when possible.',
      'Chain steps together instead of stopping after a single answer.',
      'Only pause for approvals, permissions, or genuinely missing context.',
    ],
  },
]

export function isAssistantMode(value: string): value is AssistantMode {
  return ASSISTANT_MODE_DEFINITIONS.some((definition) => definition.id === value)
}

export function getAssistantModeDefinition(mode: AssistantMode) {
  return ASSISTANT_MODE_DEFINITIONS.find((definition) => definition.id === mode) ?? ASSISTANT_MODE_DEFINITIONS[0]
}

export function buildAssistantModePrompt(mode: AssistantMode, content: string) {
  const trimmed = content.trim()
  if (!trimmed) return ''
  // For non-assist modes, mode instructions are already injected by the backend
  // via the modeAppendix in agent.service.ts. Do not include visible mode labels
  // in the user content that will be displayed in the chat history.
  return trimmed
}
