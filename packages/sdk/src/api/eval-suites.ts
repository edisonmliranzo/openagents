import type { OpenAgentsClient } from '../client'

export type EvalAssertionType = 'contains' | 'notContains' | 'regex' | 'jsonSchema' | 'judge'

export interface EvalAssertionDef {
  type: EvalAssertionType
  value?: string
  caseSensitive?: boolean
  schema?: Record<string, unknown> | string
  rubric?: string
  minScore?: number
}

export interface EvalCaseDef { id?: string; name?: string; prompt: string; assertions: EvalAssertionDef[] }

export interface EvalSuiteRow {
  id: string
  name: string
  description?: string
  system?: string
  cases: Array<EvalCaseDef & { id: string }>
  baselineRunId?: string
  createdAt: string
  updatedAt: string
}

export interface EvalSuiteTarget { presetId?: string; versionId?: string; /** "provider:model" */ model?: string }

export interface EvalAssertionResult { type: EvalAssertionType; passed: boolean; detail: string; judgeScore?: number }
export interface EvalCaseResult {
  caseId: string
  name?: string
  score: number
  passed: boolean
  output: string
  assertions: EvalAssertionResult[]
  error?: string
  durationMs: number
}

export interface EvalSuiteRunSummary {
  id: string
  at: string
  target: { presetId?: string; versionId?: string; provider: string; model?: string; label: string }
  score: number
  passRate: number
  durationMs: number
  cases: number
}

export interface EvalSuiteRunDetail extends Omit<EvalSuiteRunSummary, 'cases'> {
  suiteId: string
  cases: EvalCaseResult[]
}

export interface EvalSuiteComparison {
  runId: string
  baselineRunId: string | null
  score: number
  baselineScore: number | null
  scoreDelta: number | null
  cases: Array<{
    caseId: string
    name?: string
    score: number
    baselineScore: number | null
    delta: number | null
    passed: boolean
    baselinePassed: boolean | null
    status: 'new' | 'regression' | 'improvement' | 'same'
  }>
  regressions: string[]
  improvements: string[]
}

export interface EvalGateResult {
  pass: boolean
  score: number
  baselineScore: number | null
  scoreDelta: number | null
  runId: string
  baselineRunId: string | null
  regressions: string[]
  reasons: string[]
}

export interface EvalGateOptions extends EvalSuiteTarget {
  runId?: string
  /** Run the suite first (CI mode). */
  run?: boolean
  maxDrop?: number
  minScore?: number
  failOnCaseRegression?: boolean
}

export function createEvalSuitesApi(client: OpenAgentsClient) {
  const base = '/api/v1/eval/suites'
  const e = encodeURIComponent
  return {
    list: () => client.get<EvalSuiteRow[]>(base),
    get: (id: string) => client.get<EvalSuiteRow>(`${base}/${e(id)}`),
    create: (input: { name: string; description?: string; system?: string; cases?: EvalCaseDef[] }) => client.post<EvalSuiteRow>(base, input),
    update: (id: string, input: { name?: string; description?: string; system?: string; cases?: EvalCaseDef[] }) => client.put<EvalSuiteRow>(`${base}/${e(id)}`, input),
    remove: (id: string) => client.delete<{ ok: boolean }>(`${base}/${e(id)}`),
    run: (id: string, target: EvalSuiteTarget = {}) => client.post<EvalSuiteRunDetail>(`${base}/${e(id)}/run`, target),
    runs: (id: string) => client.get<EvalSuiteRunSummary[]>(`${base}/${e(id)}/runs`),
    runDetail: (id: string, runId: string) => client.get<EvalSuiteRunDetail>(`${base}/${e(id)}/runs/${e(runId)}`),
    setBaseline: (id: string, runId: string | null) => client.post<{ ok: boolean; baselineRunId: string | null }>(`${base}/${e(id)}/baseline`, { runId }),
    compare: (id: string, runId?: string, against?: string) =>
      client.get<EvalSuiteComparison>(`${base}/${e(id)}/compare?${new URLSearchParams({ ...(runId ? { runId } : {}), ...(against ? { against } : {}) }).toString()}`),
    gate: (id: string, options: EvalGateOptions = {}) => client.post<EvalGateResult>(`${base}/${e(id)}/gate`, options),
  }
}
