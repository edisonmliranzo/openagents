import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'
import type { AppBuilderIntent, TechStack } from './app-builder-workflow.types'

export class CreateAppBuilderWorkflowDto {
  @IsString()
  prompt!: string

  @IsOptional()
  @IsIn(['web_app', 'mobile_app', 'saas', 'landing_page', 'api_backend', 'dashboard', 'ecommerce', 'portfolio', 'blog'])
  intent?: AppBuilderIntent

  @IsOptional()
  @IsString()
  appName?: string

  @IsOptional()
  @IsString()
  targetAudience?: string

  @IsOptional()
  @IsArray()
  preferredStack?: TechStack[]

  @IsOptional()
  @IsBoolean()
  needsAuth?: boolean

  @IsOptional()
  @IsBoolean()
  needsPayments?: boolean

  @IsOptional()
  @IsBoolean()
  needsAdminPanel?: boolean

  @IsOptional()
  @IsString()
  deploymentTarget?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[]
}
