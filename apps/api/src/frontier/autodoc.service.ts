import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LLMService } from '../agent/llm.service'
import { LibraryService } from '../library/library.service'
import { flag, clamp } from './frontier.util'

@Injectable()
export class AutodocService {
  private readonly logger = new Logger(AutodocService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LLMService,
    private readonly library: LibraryService,
  ) {}

  get enabled(): boolean {
    return flag(this.config, 'AUTO_DOCS')
  }

  async record(
    userId: string,
    input: { task: string; steps: string[]; result: string; source?: string },
  ): Promise<{ title: string } | null> {
    if (!this.enabled) return null
    const fallback = [
      `# How-to: ${input.task}`,
      '',
      '## Steps',
      ...input.steps.map((s, i) => `${i + 1}. ${s}`),
      '',
      '## Outcome',
      clamp(input.result, 1200),
    ].join('\n')

    let content = fallback
    try {
      const res = await this.llm.complete(
        [{ role: 'user', content: `Task: ${input.task}\n\nWhat happened:\n${clamp(fallback, 3000)}\n\nRewrite as a concise reusable how-to card in markdown (Goal / Steps / Notes, <=250 words):` }],
        [],
        'You turn completed AI-agent work into reusable how-to documentation.',
        'ollama',
      )
      if (res.content.trim().length > 80) content = res.content.trim()
    } catch (err: any) {
      this.logger.debug(`Autodoc polish skipped: ${err?.message ?? err}`)
    }

    const title = `How-to: ${clamp(input.task, 80)}`
    await this.library.addText(userId, { title, content, source: input.source ?? 'auto-doc' })
    return { title }
  }
}
