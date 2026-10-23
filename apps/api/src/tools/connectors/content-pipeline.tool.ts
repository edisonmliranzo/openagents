import { Injectable, Inject, forwardRef } from '@nestjs/common'
import type { ToolResult } from '@openagents/shared'
import type { ToolDefinition } from '../tools.service'
import type { ListProfilesResult } from '../../content-pipeline/content-pipeline.service'

/**
 * Structural backend contract for the content-creator pipeline. The tool file
 * deliberately holds NO value import of the pipeline service: tools.service
 * already sits in a module cycle with ContentPipelineModule, and adding the
 * service to that import chain poisoned type inference elsewhere in the app
 * (observed with TS 5.9 + this project's loose strict flags). The module
 * binds CONTENT_PIPELINE_BACKEND to the real service.
 */
export interface ContentPipelineBackend {
  configure(userId: string, patch: Record<string, unknown>): Promise<unknown>
  run(userId: string, options?: { dryRun?: boolean }): Promise<unknown>
  listBufferProfiles(userId: string): Promise<ListProfilesResult>
}

export const CONTENT_PIPELINE_BACKEND = Symbol('CONTENT_PIPELINE_BACKEND')

/**
 * Agent-facing surface of the content-creator pipeline. When a user says
 * "I post daily videos about cooking", the agent configures the pipeline;
 * when the daily cron fires, the agent runs it.
 */
@Injectable()
export class ContentPipelineTool {
  constructor(
    @Inject(forwardRef(() => CONTENT_PIPELINE_BACKEND))
    private readonly pipeline: ContentPipelineBackend,
  ) {}

  get configureDef(): ToolDefinition {
    return {
      name: 'content_pipeline_configure',
      displayName: 'Configure Content Pipeline',
      description:
        'Configure the user\'s daily content-creator pipeline (script -> narration video -> Buffer post -> push notification). Call this when the user describes what they create, their niche, platform, tone, or posting schedule. Setting scheduleCron registers a daily automated run (e.g. "0 9 * * *" for 9am). The Buffer access token comes from the user (or the BUFFER_ACCESS_TOKEN env); store it here once via bufferAccessToken.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          niche: { type: 'string', description: 'What the videos are about (e.g. "home cooking recipes")' },
          audience: { type: 'string', description: 'Who watches (e.g. "busy parents on TikTok")' },
          tone: { type: 'string', description: 'Voice and energy of the scripts' },
          platform: { type: 'string', description: 'Target platform: tiktok, instagram, youtube, x, linkedin' },
          orientation: { type: 'string', description: 'vertical (9:16), square (1:1), or landscape (16:9)' },
          voice: { type: 'string', description: 'Optional narration voice override. Empty = the voice the user configured in Settings (recommended). Can be a Fish preset (us-preset-*), an ElevenLabs voice id, or an OpenAI voice (alloy, echo, fable, onyx, nova, shimmer).' },
          language: { type: 'string', description: 'Script/narration language' },
          topicHint: { type: 'string', description: 'Recurring topic direction from the creator' },
          scheduleCron: { type: 'string', description: 'Cron expression for the daily automated run, e.g. "0 9 * * *". Empty string = manual runs only.' },
          bufferProfileId: { type: 'string', description: 'Buffer profile id to post to (from buffer_list_profiles)' },
          bufferAccessToken: { type: 'string', description: 'Buffer personal access token (only send when the user shares one)' },
          autoPost: { type: 'boolean', description: 'true = post to Buffer automatically each run' },
          notify: { type: 'boolean', description: 'true = push notification when the video is ready (default true)' },
        },
      },
    }
  }

  get runDef(): ToolDefinition {
    return {
      name: 'content_pipeline_run',
      displayName: 'Run Content Pipeline',
      description:
        'Run the user\'s content-creator pipeline NOW in one call: generates today\'s topic + script + caption, narrates it (TTS), renders the final video (ffmpeg), optionally posts it to Buffer, and sends a push notification. Returns the script, caption, and video file path. Use when the user asks for today\'s video or when the daily schedule fires.',
      requiresApproval: false,
      inputSchema: {
        type: 'object',
        properties: {
          topicHint: { type: 'string', description: 'Optional one-off topic direction for this run only' },
          dryRun: { type: 'boolean', description: 'true = do everything except the actual Buffer post' },
        },
      },
    }
  }

  get bufferProfilesDef(): ToolDefinition {
    return {
      name: 'buffer_list_profiles',
      displayName: 'List Buffer Profiles',
      description:
        'List the social media profiles connected to the user\'s Buffer account, so the pipeline can be pointed at the right one. Requires a Buffer access token (bufferAccessToken in pipeline config or BUFFER_ACCESS_TOKEN env).',
      requiresApproval: false,
      inputSchema: { type: 'object', properties: {} },
    }
  }

  async configure(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const config = await this.pipeline.configure(userId, input)
      const withSchedule = Boolean((config as any)?.scheduleCron)
      return {
        success: true,
        output: {
          configured: true,
          config,
          note: withSchedule
            ? 'Pipeline scheduled — the cron job will trigger a daily run and you will be notified.'
            : 'Pipeline configured — runs will happen when requested (no schedule set).',
        },
      }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to configure pipeline.' }
    }
  }

  async run(input: { topicHint?: string; dryRun?: boolean }, userId: string): Promise<ToolResult> {
    try {
      if (input?.topicHint?.trim()) {
        await this.pipeline.configure(userId, { topicHint: input.topicHint.trim().slice(0, 400) })
      }
      const result = await this.pipeline.run(userId, { dryRun: input?.dryRun === true })
      if (result && typeof result === 'object' && 'error' in result) {
        return { success: false, output: null, error: String((result as any).error) }
      }
      return { success: true, output: result }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Pipeline run failed.' }
    }
  }

  async listProfiles(_input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const result = await this.pipeline.listBufferProfiles(userId)
      if (!result.success || !result.profiles) {
        return { success: false, output: null, error: result.error ?? 'Failed to list Buffer profiles.' }
      }
      return { success: true, output: { profiles: result.profiles } }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message ?? 'Failed to list Buffer profiles.' }
    }
  }
}
