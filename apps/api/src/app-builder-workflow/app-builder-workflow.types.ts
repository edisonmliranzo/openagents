export type AppBuilderIntent =
  | 'web_app'
  | 'mobile_app'
  | 'saas'
  | 'landing_page'
  | 'api_backend'
  | 'dashboard'
  | 'ecommerce'
  | 'portfolio'
  | 'blog'
  | 'unknown'

export type TechStack =
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'nestjs'
  | 'express'
  | 'fastapi'
  | 'flutter'
  | 'react_native'
  | 'prisma'
  | 'postgresql'
  | 'mongodb'
  | 'supabase'
  | 'vercel'
  | 'railway'
  | 'tailwindcss'
  | 'typescript'

export type AppAgentRole =
  | 'product_manager'
  | 'frontend_engineer'
  | 'backend_engineer'
  | 'database_architect'
  | 'qa_tester'
  | 'deployment_engineer'

export type FeaturePriority = 'must_have' | 'should_have' | 'nice_to_have'

export interface AppFeature {
  name: string
  description: string
  priority: FeaturePriority
  agentRole: AppAgentRole
  estimatedHours: number
}

export interface DatabaseField {
  name: string
  type: string
  required: boolean
  unique?: boolean
  description: string
}

export interface DatabaseTable {
  name: string
  fields: DatabaseField[]
  relations: string[]
}

export interface ApiRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  description: string
  auth: boolean
  agentRole: AppAgentRole
}

export interface UiPage {
  name: string
  path: string
  description: string
  sections: string[]
  agentRole: AppAgentRole
}

export interface DeploymentStep {
  order: number
  name: string
  provider: string
  action: string
  requiresApproval: boolean
}

export interface AgentRoleAssignment {
  role: AppAgentRole
  responsibilities: string[]
  outputArtifacts: string[]
}

export interface AppBuilderPlan {
  intent: AppBuilderIntent
  title: string
  summary: string
  techStack: TechStack[]
  features: AppFeature[]
  databaseSchema: DatabaseTable[]
  apiRoutes: ApiRoute[]
  uiPages: UiPage[]
  deploymentPlan: DeploymentStep[]
  agentRoles: AgentRoleAssignment[]
  finalDeliverables: string[]
  missingInputs: string[]
}
