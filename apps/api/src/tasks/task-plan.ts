// Pure plan helpers for the task runtime. No framework imports, so they can be
// unit tested with `node --experimental-strip-types --test`.

export type StepKind = 'tool' | 'llm'
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface PlanStep {
  id: string
  kind: StepKind
  instruction: string
  tool?: string
  input?: Record<string, unknown>
  status: StepStatus
  output?: string
  error?: string
}

const SIDE_EFFECT = /(send|create|delete|remove|cancel|place|post|publish|pay|transfer|update|add_comment|draft_send|_write|submit|book|order)/i

/** Tools that change the outside world need explicit user approval first. */
export function isSideEffectTool(toolName: string): boolean {
  return SIDE_EFFECT.test(toolName)
}

/** Parse and validate a planner response. Unknown tools are rejected, not guessed. */
/** Pull the first JSON object out of model text: strips code fences and trailing commas. */
export function extractJson(raw: string): unknown | null {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const isArray = cleaned.startsWith('[')
  const open = isArray ? '[' : '{'
  const close = isArray ? ']' : '}'
  const start = cleaned.indexOf(open)
  if (start < 0) return null
  const tail = cleaned.slice(start)
  const end = tail.lastIndexOf(close)
  if (end >= 0) {
    const body = tail.slice(0, end + 1).replace(/,\s*([}\]])/g, '$1')
    try {
      return JSON.parse(body)
    } catch {
      /* try recovery below */
    }
  }
  // Truncated output: back off to the last complete container and close it.
  const suffixes = isArray ? [']', ']}', ']'] : ['}]', ']}', '] }']
  let idx = tail.length
  for (let attempt = 0; attempt < 8; attempt += 1) {
    idx = tail.lastIndexOf(close, idx - 1)
    if (idx < 0) break
    for (const suffix of suffixes) {
      const candidate = `${tail.slice(0, idx + 1)}${suffix}`.replace(/,\s*([}\]])/g, '$1')
      try {
        return JSON.parse(candidate)
      } catch {
        /* try next closing form */
      }
    }
  }
  return null
}

export function parsePlan(
  raw: string,
  allowedTools: Set<string>,
  maxSteps: number,
): { steps: PlanStep[]; errors: string[] } {
  const errors: string[] = []
  const parsed: any = extractJson(raw)
  if (!parsed) return { steps: [], errors: ['planner JSON did not parse'] }

  // Models sometimes return a bare array of steps instead of {"steps": [...]}.
  const list: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.steps) ? parsed.steps : []
  const steps: PlanStep[] = []

  list.slice(0, maxSteps).forEach((raw, i) => {
    // Plain strings are accepted as llm instructions, or as tool names with no input.
    if (typeof raw === 'string') {
      const text = raw.trim().slice(0, 400)
      if (!text) return errors.push(`step ${i + 1} is empty`)
      const named = text.replace(/^use\s+/i, '').trim()
      if (allowedTools.has(named)) {
        steps.push({ id: `s${i + 1}`, kind: 'tool', instruction: `Use ${named}`, tool: named, input: {}, status: 'pending' })
      } else {
        steps.push({ id: `s${i + 1}`, kind: 'llm', instruction: text, status: 'pending' })
      }
      return
    }
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    // Models often put the tool name in "kind". Treat any step that names a tool as a tool step.
    const kindName = String(s.kind ?? '').trim()
    const toolName = String(s.tool ?? (allowedTools.has(kindName) ? kindName : '')).trim()
    const isTool = s.kind === 'tool' || toolName.length > 0

    const instruction = String(s.instruction ?? s.why ?? (isTool ? `Use ${toolName}` : '')).trim().slice(0, 400)
    if (!instruction) {
      errors.push(`step ${i + 1} has no instruction`)
      return
    }
    if (isTool) {
      if (!allowedTools.has(toolName)) {
        errors.push(`step ${i + 1} uses unavailable tool "${toolName}"`)
        return
      }
      const input = s.input && typeof s.input === 'object' && !Array.isArray(s.input) ? (s.input as Record<string, unknown>) : {}
      steps.push({ id: `s${i + 1}`, kind: 'tool', instruction, tool: toolName, input, status: 'pending' })
      return
    }
    steps.push({ id: `s${i + 1}`, kind: 'llm', instruction, status: 'pending' })
  })

  if (steps.length === 0 && errors.length === 0) errors.push('planner returned no usable steps')
  return { steps, errors }
}

export interface Verdict {
  met: boolean
  gaps: string[]
  answer: string
}

/** Text a model emits when it copies the output format instead of answering. */
export function isPlaceholderAnswer(answer: string): boolean {
  const a = answer.trim().toLowerCase()
  if (a.length < 40) return true
  return /the final deliverable|your answer here|<answer>|\.\.\.$|placeholder/.test(a)
}

/**
 * Parse the verifier's judgement. A verdict only counts as met when the
 * verifier says so AND the answer is a real deliverable. Anything else is not met.
 */
export function parseVerdict(raw: string, hadToolEvidence = true): Verdict {
  const found = extractJson(raw) as any
  if (!found) return { met: false, gaps: ['verifier output could not be parsed'], answer: raw.slice(0, 8000) }

  const answer = String(found.answer ?? '').slice(0, 8000)
  const gaps = Array.isArray(found.gaps) ? found.gaps.map(String).slice(0, 6) : []
  let met = found.met === true
  if (met && isPlaceholderAnswer(answer)) {
    met = false
    gaps.push('verifier returned no real deliverable')
  }
  if (met && !hadToolEvidence) {
    met = false
    gaps.push('no tool step produced evidence')
  }
  return { met, gaps, answer }
}

/** Compact schema summary for the planner: required fields and types. */
export function describeInputSchema(schema: Record<string, unknown> | undefined): string {
  const props = (schema?.properties ?? {}) as Record<string, { type?: string; description?: string }>
  const required = new Set(Array.isArray(schema?.required) ? (schema!.required as string[]) : [])
  const parts = Object.entries(props).slice(0, 8).map(([k, v]) => `${k}${required.has(k) ? '*' : ''}:${v?.type ?? 'any'}`)
  return parts.length ? parts.join(', ') : 'no inputs'
}

export function missingRequired(schema: Record<string, unknown> | undefined, input: Record<string, unknown>): string[] {
  const required = Array.isArray(schema?.required) ? (schema!.required as string[]) : []
  return required.filter((k) => input[k] === undefined || input[k] === '')
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}
