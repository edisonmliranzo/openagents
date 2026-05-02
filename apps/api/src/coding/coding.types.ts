export type CodingTaskType =
  | 'explain_code'
  | 'fix_bug'
  | 'add_feature'
  | 'refactor'
  | 'write_tests'
  | 'review_code'
  | 'create_project'

export type CodingRiskLevel = 'low' | 'medium' | 'high'

export interface SupportedLanguage {
  id: string
  label: string
  extensions: string[]
  packageManagers?: string[]
  testCommands?: string[]
  formatCommands?: string[]
}

export interface CodeFileIndex {
  path: string
  language: string
  sizeBytes: number
  lineCount: number
  summary: string
  imports: string[]
  exports: string[]
  functions: string[]
  classes: string[]
  components: string[]
  dependencies: string[]
  riskSignals: string[]
}

export interface CodebaseAnalysis {
  rootPath: string
  generatedAt: string
  filesScanned: number
  languages: Record<string, number>
  packageManagers: string[]
  likelyFrameworks: string[]
  suggestedCommands: string[]
  files: CodeFileIndex[]
}

export interface CodingPlan {
  taskType: CodingTaskType
  language: string
  summary: string
  steps: string[]
  filesToRead: string[]
  filesToEdit: string[]
  commandsToRun: string[]
  toolsRequired: string[]
  riskLevel: CodingRiskLevel
  needsApproval: boolean
  safetyNotes: string[]
  systemPrompt: string
}
