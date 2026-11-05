import type { OpenAgentsClient } from '../client'

export type GovRuleEffect = 'deny' | 'require_approval' | 'warn' | 'allow'
export type GovRuleScope = 'local' | 'external_read' | 'external_write' | 'system_mutation'

export interface GovRuleMatch {
  tools?: string[]
  scopes?: GovRuleScope[]
  minRiskScore?: number
  costOverUsd?: number
  dailySpendOverUsd?: number
  recipientDomainNotIn?: string[]
  recipientDomainIn?: string[]
  urlHostIn?: string[]
  urlHostNotIn?: string[]
  inputContains?: string[]
}

export interface GovPolicyRule {
  id: string
  name: string
  description?: string
  enabled: boolean
  effect: GovRuleEffect
  priority: number
  match: GovRuleMatch
  createdAt: string
  updatedAt: string
}

export interface GovRuleInput {
  name: string
  description?: string
  enabled?: boolean
  effect: GovRuleEffect
  priority?: number
  match?: GovRuleMatch
}

export interface GovRuleEvaluation {
  decision: 'allow' | 'warn' | 'require_approval' | 'deny'
  matched: Array<{ ruleId: string; name: string; effect: GovRuleEffect; reasons: string[] }>
  evaluatedRules: number
}

export interface GovEvaluationLogEntry {
  id: string
  at: string
  toolName: string
  decision: GovRuleEvaluation['decision']
  dryRun: boolean
  matched: GovRuleEvaluation['matched']
  inputPreview: string
}

export interface GovRuleTestInput {
  toolName: string
  input?: Record<string, unknown>
  scope?: GovRuleScope
  riskScore?: number
  estimatedCostUsd?: number
  draftRule?: GovRuleInput
}

export interface LedgerEntry {
  seq: number
  ts: string
  action: string
  actor: string
  resource: string
  data: Record<string, unknown>
  prevHash: string
  hash: string
  sig?: string
}

export interface LedgerVerification {
  ok: boolean
  total: number
  signed: boolean
  headHash: string
  brokenAt?: number
  reason?: string
}

export interface LedgerTamperDemo {
  available: boolean
  message?: string
  tamperedSeq?: number
  original?: string
  before?: LedgerVerification
  after?: LedgerVerification
}

export interface LedgerExport {
  exportedAt: string
  userId: string
  algorithm: string
  signed: boolean
  verification: LedgerVerification
  entries: LedgerEntry[]
}

export type FirewallCategory =
  | 'instruction_override'
  | 'role_spoofing'
  | 'exfiltration'
  | 'hidden_text'
  | 'encoded_payload'
  | 'tool_hijack'

export interface FirewallFinding {
  id: string
  category: FirewallCategory
  label: string
  weight: number
  excerpt: string
}

export interface FirewallScan {
  riskScore: number
  level: 'clean' | 'suspicious' | 'dangerous'
  findings: FirewallFinding[]
  sanitized: string
  quarantined: boolean
  threshold: number
  source: string
  scannedChars: number
}

export interface FirewallDetection {
  id: string
  at: string
  source: string
  riskScore: number
  level: FirewallScan['level']
  quarantined: boolean
  categories: FirewallCategory[]
  excerpt: string
}

export function createGovernanceApi(client: OpenAgentsClient) {
  return {
    policyRules: {
      list: () => client.get<GovPolicyRule[]>('/api/v1/policy-rules'),
      create: (rule: GovRuleInput) => client.post<GovPolicyRule>('/api/v1/policy-rules', rule),
      update: (id: string, rule: GovRuleInput) =>
        client.put<GovPolicyRule>(`/api/v1/policy-rules/${encodeURIComponent(id)}`, rule),
      remove: (id: string) => client.delete<{ ok: boolean }>(`/api/v1/policy-rules/${encodeURIComponent(id)}`),
      test: (input: GovRuleTestInput) => client.post<GovRuleEvaluation>('/api/v1/policy-rules/test', input),
      log: (limit = 50) => client.get<GovEvaluationLogEntry[]>(`/api/v1/policy-rules/log?limit=${limit}`),
    },
    auditLedger: {
      list: (limit = 100, offset = 0) =>
        client.get<{ total: number; entries: LedgerEntry[] }>(`/api/v1/audit-ledger?limit=${limit}&offset=${offset}`),
      verify: () => client.get<LedgerVerification>('/api/v1/audit-ledger/verify'),
      export: () => client.get<LedgerExport>('/api/v1/audit-ledger/export'),
      append: (entry: { action: string; resource?: string; data?: Record<string, unknown> }) =>
        client.post<LedgerEntry | null>('/api/v1/audit-ledger/entries', entry),
      tamperDemo: () => client.post<LedgerTamperDemo>('/api/v1/audit-ledger/tamper-demo'),
    },
    injectionFirewall: {
      scan: (text: string, source?: string, threshold?: number) =>
        client.post<FirewallScan>('/api/v1/injection-firewall/scan', { text, source, threshold }),
      detections: (limit = 50) =>
        client.get<FirewallDetection[]>(`/api/v1/injection-firewall/detections?limit=${limit}`),
    },
  }
}
