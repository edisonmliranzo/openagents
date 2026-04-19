/**
 * Conversation Templates / Starters Types for OpenAgents
 * Pre-built prompt kits for quick task initialization
 */

export enum TemplateCategory {
  SEO_AUDIT = 'seo_audit',
  CODE_REVIEW = 'code_review',
  MARKET_RESEARCH = 'market_research',
  CONTENT_WRITING = 'content_writing',
  DATA_ANALYSIS = 'data_analysis',
  CUSTOMER_SUPPORT = 'customer_support',
  SALES_OUTREACH = 'sales_outreach',
  PROJECT_PLANNING = 'project_planning',
  RESEARCH = 'research',
  CUSTOM = 'custom',
}

export enum TemplateDifficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  label: string;
  description?: string;
  defaultValue?: string | number | boolean;
  required: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export interface TemplateStep {
  order: number;
  prompt: string;
  description?: string;
  expectedDuration?: string;
  tools?: string[];
}

export interface ConversationTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  difficulty: TemplateDifficulty;
  
  // Content
  icon: string;
  color: string;
  steps: TemplateStep[];
  variables: TemplateVariable[];
  
  // Metadata
  tags: string[];
  author: string;
  isPublic: boolean;
  isFeatured: boolean;
  usageCount: number;
  rating: number;
  
  // Lifecycle
  createdAt: Date;
  updatedAt: Date;
  version: string;
  deprecated?: boolean;
  
  // Configuration
  defaultAgentPreset?: string;
  systemPrompt?: string;
  maxSteps?: number;
}

export interface TemplateUsage {
  id: string;
  templateId: string;
  userId: string;
  startedAt: Date;
  completedAt?: Date;
  currentStep: number;
  totalSteps: number;
  isCompleted: boolean;
  variables: Record<string, unknown>;
  output?: string;
}

export interface TemplateRating {
  id: string;
  templateId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

export interface TemplateSearchFilter {
  category?: TemplateCategory[];
  difficulty?: TemplateDifficulty[];
  tags?: string[];
  searchQuery?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface TemplateMetrics {
  totalTemplates: number;
  totalUsages: number;
  averageCompletionRate: number;
  templatesByCategory: Record<TemplateCategory, number>;
  topRatedTemplates: string[];
  mostUsedTemplates: string[];
}

export interface TemplateCustomization {
  templateId: string;
  name?: string;
  description?: string;
  steps?: TemplateStep[];
  variables?: TemplateVariable[];
  defaultAgentPreset?: string;
  systemPrompt?: string;
}

export type TemplateEventType =
  | 'template.created'
  | 'template.used'
  | 'template.completed'
  | 'template.rated'
  | 'template.updated'
  | 'template.deprecated';

export interface TemplateEvent {
  type: TemplateEventType;
  templateId: string;
  userId?: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}
