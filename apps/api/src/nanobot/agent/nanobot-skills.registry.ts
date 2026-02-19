import { Injectable } from '@nestjs/common'
import type { NanobotSkillManifest } from '../types'

const BUNDLED_SKILLS: NanobotSkillManifest[] = [
  {
    id: 'github',
    title: 'GitHub',
    description: 'Repository lookups and issue triage helpers.',
    tools: ['web_fetch'],
    promptAppendix: 'When discussing repos, prefer concrete file paths and diffs.',
  },
  {
    id: 'weather',
    title: 'Weather',
    description: 'Weather lookup and planning assistant.',
    tools: ['web_fetch'],
  },
  {
    id: 'tmux',
    title: 'Terminal Session',
    description: 'Terminal workflow automation and command sequencing.',
    tools: ['notes'],
  },
]

@Injectable()
export class NanobotSkillsRegistry {
  async listBundled() {
    return BUNDLED_SKILLS
  }

  async getActiveForUser(_userId: string) {
    // Placeholder strategy: all bundled skills are active.
    // Future: load per-user enabled skills from DB/config.
    return BUNDLED_SKILLS
  }
}

