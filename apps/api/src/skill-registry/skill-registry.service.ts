import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { createHmac } from 'node:crypto'
import type {
  InstallSkillVersionInput,
  PinSkillVersionInput,
  PublicSkillCatalogEntry,
  PublishSkillVersionInput,
  PublishSkillVersionResult,
  RollbackSkillVersionInput,
  SearchPublicSkillsInput,
  SkillCompatibility,
  SkillManifest,
  SkillRegistryEntry as SkillRegistryEntryDto,
  SkillRegistryVersion as SkillRegistryVersionDto,
} from '@openagents/shared'
import { API_VERSION } from '@openagents/shared'
import { NanobotSkillsRegistry } from '../nanobot/agent/nanobot-skills.registry'
import { PrismaService } from '../prisma/prisma.service'
import { ToolsService } from '../tools/tools.service'

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/

interface StoredSkillVersion {
  version: string
  changelog: string
  manifest: SkillManifest
  compatibility: SkillCompatibility | null
  signature: string
  publishedAt: string
}

interface PublicCatalogDefinition {
  catalogId: string
  publisher: string
  tags: string[]
  featured: boolean
  downloads: number
  sourceUrl?: string
  version: string
  changelog: string
  manifest: SkillManifest
  compatibility?: SkillCompatibility
  publishedAt: string
}

const PUBLIC_SKILL_CATALOG: PublicCatalogDefinition[] = [
  {
    catalogId: 'research-briefing',
    publisher: 'OpenAgents Catalog',
    tags: ['research', 'analysis', 'briefing'],
    featured: true,
    downloads: 1840,
    sourceUrl: 'https://github.com/HKUDS/nanobot',
    version: '1.0.0',
    changelog: 'Initial public catalog release for research synthesis and citation-ready briefings.',
    manifest: {
      id: 'catalog-research-briefing',
      title: 'Research Briefing',
      description: 'Search, fetch, and summarize public sources into a concise, citation-ready briefing.',
      tools: ['web_search', 'web_fetch', 'deep_research', 'notes_create', 'notes_list'],
      promptAppendix: 'Prioritize current sources, extract verifiable facts, and separate evidence from inference.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_search', 'web_fetch', 'deep_research', 'notes_create'],
    },
    publishedAt: '2026-02-16T00:00:00.000Z',
  },
  {
    catalogId: 'bug-triage',
    publisher: 'OpenAgents Catalog',
    tags: ['engineering', 'debugging', 'triage'],
    featured: true,
    downloads: 1530,
    sourceUrl: 'https://github.com/HKUDS/nanobot',
    version: '1.0.0',
    changelog: 'Initial public catalog release for issue triage and patch planning.',
    manifest: {
      id: 'catalog-bug-triage',
      title: 'Bug Triage',
      description: 'Turn vague bug reports into actionable triage notes, hypotheses, and next checks.',
      tools: ['web_fetch', 'notes_create', 'notes_list'],
      promptAppendix: 'Ask for reproduction context, isolate likely root causes, and propose the smallest validating check first.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_fetch', 'notes_create'],
    },
    publishedAt: '2026-02-18T00:00:00.000Z',
  },
  {
    catalogId: 'incident-commander',
    publisher: 'OpenAgents Catalog',
    tags: ['ops', 'incident', 'sre'],
    featured: true,
    downloads: 1275,
    version: '1.0.0',
    changelog: 'Initial public catalog release for incident response coordination.',
    manifest: {
      id: 'catalog-incident-commander',
      title: 'Incident Commander',
      description: 'Structure production incidents into timeline, blast radius, mitigations, and follow-up actions.',
      tools: ['web_fetch', 'notes_create', 'notes_list'],
      promptAppendix: 'Use a calm incident-command style, capture time-stamped facts, and clearly separate mitigation from root cause.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_fetch', 'notes_create'],
    },
    publishedAt: '2026-02-20T00:00:00.000Z',
  },
  {
    catalogId: 'release-readiness',
    publisher: 'OpenAgents Catalog',
    tags: ['engineering', 'release', 'qa'],
    featured: false,
    downloads: 890,
    version: '1.0.0',
    changelog: 'Initial public catalog release for release checklist and rollback prep.',
    manifest: {
      id: 'catalog-release-readiness',
      title: 'Release Readiness',
      description: 'Generate a pragmatic release checklist with rollback guidance and verification gates.',
      tools: ['notes_create', 'notes_list', 'cron_add'],
      promptAppendix: 'Prefer concrete launch gates, rollback triggers, owner assignments, and post-release verification steps.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['notes_create', 'cron_add'],
    },
    publishedAt: '2026-02-21T00:00:00.000Z',
  },
  {
    catalogId: 'content-researcher',
    publisher: 'OpenAgents Catalog',
    tags: ['content', 'social', 'research'],
    featured: false,
    downloads: 1040,
    version: '1.0.0',
    changelog: 'Initial public catalog release for content idea research and script planning.',
    manifest: {
      id: 'catalog-content-researcher',
      title: 'Content Researcher',
      description: 'Research content angles, gather examples, and produce structured briefs for short-form content.',
      tools: ['web_search', 'deep_research', 'notes_create', 'notes_list'],
      promptAppendix: 'Focus on audience fit, hook quality, and repeatable content angles instead of generic inspiration.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_search', 'deep_research', 'notes_create'],
    },
    publishedAt: '2026-02-22T00:00:00.000Z',
  },
  {
    catalogId: 'market-watch',
    publisher: 'OpenAgents Catalog',
    tags: ['finance', 'markets', 'monitoring'],
    featured: false,
    downloads: 760,
    version: '1.0.0',
    changelog: 'Initial public catalog release for market monitoring and scheduled briefings.',
    manifest: {
      id: 'catalog-market-watch',
      title: 'Market Watch',
      description: 'Track market context, summarize changes, and prepare recurring watchlist updates.',
      tools: ['web_search', 'web_fetch', 'deep_research', 'get_current_time', 'notes_create', 'cron_add'],
      promptAppendix: 'Highlight price-moving events, watchlist updates, and uncertainty. Avoid unsupported trading claims.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_search', 'web_fetch', 'deep_research', 'cron_add'],
    },
    publishedAt: '2026-02-24T00:00:00.000Z',
  },
  // --- Marketing division (content adapted from coreyhaines31/marketingskills, MIT) ---
  {
    catalogId: 'cro',
    publisher: 'OpenAgents Catalog',
    tags: ['marketing', 'cro', 'conversion', 'landing-pages'],
    featured: true,
    downloads: 0,
    sourceUrl: 'https://github.com/coreyhaines31/marketingskills',
    version: '1.0.0',
    changelog: 'Marketing division: conversion-rate optimization for pages and forms.',
    manifest: {
      id: 'catalog-cro',
      title: 'CRO — Conversion Rate Optimization',
      description: 'Diagnose and optimize marketing pages and forms for conversion: funnels, landing pages, signup flows.',
      tools: ['web_fetch', 'web_crawl', 'browser_screenshot', 'notes_create'],
      promptAppendix:
        'Work the CRO loop, never opinions: (1) Define the single conversion action and measure it. (2) Walk the page as three visitors — newcomer, expert, someone in a hurry — and log friction points in order of severity. (3) Check the fundamentals before ideas: offer clarity, headline-message match, one primary CTA, form effort, mobile layout, load speed. (4) Form hypotheses as "because [observed friction], changing [element] will move [metric]" and rank by impact x confidence x ease. (5) Recommend the cheapest decisive test first, with sample size and decision rule stated before launch. Never claim a win on single-digit conversions.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_fetch'],
    },
    publishedAt: '2026-10-23T00:00:00.000Z',
  },
  {
    catalogId: 'copywriting',
    publisher: 'OpenAgents Catalog',
    tags: ['marketing', 'copywriting', 'landing-pages'],
    featured: true,
    downloads: 0,
    sourceUrl: 'https://github.com/coreyhaines31/marketingskills',
    version: '1.0.0',
    changelog: 'Marketing division: conversion copywriting for marketing pages.',
    manifest: {
      id: 'catalog-copywriting',
      title: 'Copywriting — Marketing Pages',
      description: 'Write benefit-first marketing copy: homepages, landing pages, feature pages, emails.',
      tools: ['web_search', 'web_fetch', 'notes_create', 'library_save'],
      promptAppendix:
        'Sculpt, do not pour: (1) Name the one reader, the one problem, the one action. (2) Lead with the benefit; features are evidence, never the headline. (3) Draft the headline ten ways; deliver the two that would stop a scroll, with reasoning. (4) Structure for skimmers: headline, subhead, bullets, CTA — depth lives below the fold. (5) Use the reader\'s own words; steal phrasing from reviews, support tickets, and search queries. (6) Read aloud and cut every sentence that trips. Deliver finished copy plus 2-3 headline variants. The piece must get shorter with every pass.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: [],
    },
    publishedAt: '2026-10-23T00:00:00.000Z',
  },
  {
    catalogId: 'seo-audit',
    publisher: 'OpenAgents Catalog',
    tags: ['marketing', 'seo', 'audit'],
    featured: false,
    downloads: 0,
    sourceUrl: 'https://github.com/coreyhaines31/marketingskills',
    version: '1.0.0',
    changelog: 'Marketing division: technical and on-page SEO audit.',
    manifest: {
      id: 'catalog-seo-audit',
      title: 'SEO Audit',
      description: 'Audit a site\'s technical and on-page SEO: crawlability, structure, titles, schema, internal links.',
      tools: ['web_fetch', 'web_crawl', 'web_search', 'notes_create'],
      promptAppendix:
        'Audit in layers, evidence first: (1) Crawlability and indexation: robots rules, sitemap presence, canonical tags, redirect chains. (2) Site architecture: URL depth, internal linking to key pages, orphan pages. (3) On-page: title/uniqueness, meta descriptions, heading hierarchy, image alt text. (4) Structured data: which schema types are present, missing, or broken. (5) For each finding report: location, severity, evidence, and a concrete fix. Rank by expected impact; end with the top five actions for the next 30 days.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_fetch'],
    },
    publishedAt: '2026-10-23T00:00:00.000Z',
  },
  {
    catalogId: 'cold-email',
    publisher: 'OpenAgents Catalog',
    tags: ['marketing', 'sales', 'outbound', 'email'],
    featured: false,
    downloads: 0,
    sourceUrl: 'https://github.com/coreyhaines31/marketingskills',
    version: '1.0.0',
    changelog: 'Marketing division: B2B cold outbound sequences.',
    manifest: {
      id: 'catalog-cold-email',
      title: 'Cold Email Outbound',
      description: 'Write B2B cold email sequences that get replies: research, first lines, offers, follow-ups.',
      tools: ['web_search', 'web_fetch', 'deep_research', 'notes_create'],
      promptAppendix:
        'Earn the reply: (1) Research the recipient until you have one specific, true observation — their post, release, hiring page. No research, no first line. (2) Lead with the observation, bridge to the problem you solve, one sentence. (3) The ask must be tiny: "worth a look?" not "book a 30-minute call." (4) Under 90 words, no attachments, one link maximum, plain text. (5) Plan a 3-4 touch follow-up cadence: each follow-up adds a new angle, never "just bumping this." (6) State the list hygiene rules: opt-out honored instantly, no purchased lists.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_search'],
    },
    publishedAt: '2026-10-23T00:00:00.000Z',
  },
  {
    catalogId: 'ab-testing',
    publisher: 'OpenAgents Catalog',
    tags: ['marketing', 'experimentation', 'analytics'],
    featured: false,
    downloads: 0,
    sourceUrl: 'https://github.com/coreyhaines31/marketingskills',
    version: '1.0.0',
    changelog: 'Marketing division: A/B test design and analysis.',
    manifest: {
      id: 'catalog-ab-testing',
      title: 'A/B Testing — Experiment Design',
      description: 'Design honest experiments: hypotheses, sample sizes, decision rules, and readouts that survive review.',
      tools: ['notes_create', 'library_save'],
      promptAppendix:
        'No test without a written "we believe X, we will know if Y": (1) One metric decides, guardrail metrics protect. (2) Compute the minimum sample size BEFORE launch from baseline rate and minimum detectable effect; refuse to call a test under it. (3) Randomize by user, not by session. (4) Fix the runtime in advance; no peeking, no stopping when it looks good. (5) Report effect size with confidence interval, not just win/lose. (6) A killed hypothesis is progress — log what was learned either way.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: [],
    },
    publishedAt: '2026-10-23T00:00:00.000Z',
  },
  {
    catalogId: 'launch-plan',
    publisher: 'OpenAgents Catalog',
    tags: ['marketing', 'launch', 'product'],
    featured: false,
    downloads: 0,
    sourceUrl: 'https://github.com/coreyhaines31/marketingskills',
    version: '1.0.0',
    changelog: 'Marketing division: product launch planning.',
    manifest: {
      id: 'catalog-launch-plan',
      title: 'Product Launch Plan',
      description: 'Plan a product or feature launch: positioning, channels, assets, timeline, and success metrics.',
      tools: ['web_search', 'web_fetch', 'notes_create', 'library_save'],
      promptAppendix:
        'Ship the story, not the feature list: (1) One-sentence positioning: for [who] who [need], [product] is the [category] that [key benefit], unlike [alternative]. (2) Pick one primary channel for launch day; the rest support. (3) Asset checklist in build order: landing page, demo/walkthrough, changelog, social thread, email to existing users, press/doc note. (4) Timeline backwards from launch date with owners. (5) Define success metrics: activation, signups, press replies — with targets set BEFORE launch. (6) Plan the quiet-week follow-up: most launches die from day-3 silence.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_search'],
    },
    publishedAt: '2026-10-23T00:00:00.000Z',
  },
  {
    catalogId: 'pricing-review',
    publisher: 'OpenAgents Catalog',
    tags: ['marketing', 'pricing', 'monetization'],
    featured: false,
    downloads: 0,
    sourceUrl: 'https://github.com/coreyhaines31/marketingskills',
    version: '1.0.0',
    changelog: 'Marketing division: pricing and packaging review.',
    manifest: {
      id: 'catalog-pricing-review',
      title: 'Pricing & Packaging Review',
      description: 'Review pricing strategy: value framing, tiers, packaging, and monetization experiments.',
      tools: ['web_search', 'web_fetch', 'notes_create'],
      promptAppendix:
        'Price the value, not the cost: (1) Identify the job the product is hired for and the metric of value the buyer already tracks. (2) Frame tiers by outcome and scale-of-use, never by feature count. (3) Three tiers maximum plus enterprise; name tiers after the customer, not metals. (4) Check the three Fs: fair (predictable), flexible (upgrade path), forgiving (no gotchas). (5) Comparison-shop two close competitors and state where you deliberately sit. (6) Propose one pricing experiment with a decision rule, not a full reprice.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: ['web_search'],
    },
    publishedAt: '2026-10-23T00:00:00.000Z',
  },
  {
    catalogId: 'churn-prevention',
    publisher: 'OpenAgents Catalog',
    tags: ['marketing', 'retention', 'churn'],
    featured: false,
    downloads: 0,
    sourceUrl: 'https://github.com/coreyhaines31/marketingskills',
    version: '1.0.0',
    changelog: 'Marketing division: churn diagnosis and save flows.',
    manifest: {
      id: 'catalog-churn-prevention',
      title: 'Churn Prevention',
      description: 'Diagnose churn signals and design save offers, cancellation flows, and win-back campaigns.',
      tools: ['notes_create', 'library_save'],
      promptAppendix:
        'Save the right users, let the wrong ones go: (1) Segment churn: active-value, low-value, hard-churned — each needs a different play. (2) Instrument the leading signals (usage drop, support spikes, failed payment) before designing anything. (3) Cancellation flow: ask one honest question, offer one tailored save, then let go gracefully — dark patterns cost more than they save. (4) Dunning: retry with clear emails before suspension; failed payments are recoverable churn. (5) Win-back campaigns target churned users with a what-changed message, not a discount. (6) Report: save rate, saved-MRR, and false-saves that churned anyway within 60 days.',
    },
    compatibility: {
      minApiVersion: '1.0.0',
      requiredTools: [],
    },
    publishedAt: '2026-10-23T00:00:00.000Z',
  },
]

@Injectable()
export class SkillRegistryService {
  private readonly apiSemver = this.normalizeApiSemver()

  constructor(
    private prisma: PrismaService,
    private skills: NanobotSkillsRegistry,
    private tools: ToolsService,
  ) {}

  async list(userId: string): Promise<SkillRegistryEntryDto[]> {
    const rows = await this.prisma.skillRegistryEntry.findMany({
      where: { userId },
      include: {
        versions: {
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map((row) => this.toEntry(row))
  }

  async get(userId: string, skillId: string): Promise<SkillRegistryEntryDto> {
    const normalizedSkillId = this.normalizeSkillId(skillId)
    const row = await this.prisma.skillRegistryEntry.findUnique({
      where: {
        userId_skillId: {
          userId,
          skillId: normalizedSkillId,
        },
      },
      include: {
        versions: {
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    })
    if (!row) throw new NotFoundException(`Skill "${normalizedSkillId}" is not in the registry.`)
    return this.toEntry(row)
  }

  async listPublic(userId: string, input: SearchPublicSkillsInput = {}): Promise<PublicSkillCatalogEntry[]> {
    const query = this.optionalText(input.q)?.toLowerCase() ?? null
    const toolFilter = this.optionalText(input.tool)?.toLowerCase() ?? null
    const tagFilter = this.optionalText(input.tag)?.toLowerCase() ?? null
    const featuredFilter = typeof input.featured === 'boolean' ? input.featured : undefined
    const limit = this.normalizeCatalogLimit(input.limit)
    const skillIds = PUBLIC_SKILL_CATALOG.map((skill) => skill.manifest.id)

    const [installedRows, toolDefinitions] = await Promise.all([
      this.prisma.skillRegistryEntry.findMany({
        where: {
          userId,
          skillId: { in: skillIds },
        },
        select: {
          skillId: true,
          installedVersion: true,
          updatedAt: true,
        },
      }),
      this.tools.getAllDefinitions(),
    ])

    const installedBySkillId = new Map(installedRows.map((row) => [row.skillId, row]))
    const knownTools = new Set(toolDefinitions.map((tool) => tool.name))

    const results = PUBLIC_SKILL_CATALOG
      .map((definition) => {
        const latestVersion = this.buildCatalogVersionDto(definition)
        const installed = installedBySkillId.get(definition.manifest.id)
        const missingTools = this.collectMissingCatalogTools(definition, knownTools)
        const entry: PublicSkillCatalogEntry = {
          catalogId: definition.catalogId,
          skillId: definition.manifest.id,
          title: definition.manifest.title,
          description: definition.manifest.description,
          publisher: definition.publisher,
          tags: definition.tags,
          featured: definition.featured,
          downloads: definition.downloads,
          latestVersion,
          installedVersion: installed?.installedVersion ?? null,
          installable: this.isCatalogDefinitionInstallable(definition, missingTools),
          missingTools,
          ...(definition.sourceUrl ? { sourceUrl: definition.sourceUrl } : {}),
          updatedAt: installed?.updatedAt.toISOString() ?? latestVersion.publishedAt,
        }
        return entry
      })
      .filter((entry) => {
        if (featuredFilter !== undefined && entry.featured !== featuredFilter) return false
        if (toolFilter && !entry.latestVersion.manifest.tools.some((tool) => tool.toLowerCase() === toolFilter)) {
          return false
        }
        if (tagFilter && !entry.tags.some((tag) => tag.toLowerCase() === tagFilter)) return false
        if (!query) return true

        const haystack = [
          entry.title,
          entry.description,
          entry.publisher,
          ...entry.tags,
          ...entry.latestVersion.manifest.tools,
        ].join(' ').toLowerCase()
        return haystack.includes(query)
      })
      .sort((left, right) => {
        if (left.featured !== right.featured) return left.featured ? -1 : 1
        if (left.downloads !== right.downloads) return right.downloads - left.downloads
        return left.title.localeCompare(right.title)
      })

    return results.slice(0, limit)
  }

  async publish(userId: string, input: PublishSkillVersionInput): Promise<PublishSkillVersionResult> {
    const manifest = this.sanitizeManifest(input.skill)
    const version = this.normalizeVersion(input.version)
    const changelog = this.normalizeChangelog(input.changelog)
    const compatibility = this.sanitizeCompatibility(input.compatibility)
    this.assertCompatibilityReferences(compatibility)

    const existing = await this.prisma.skillRegistryEntry.findUnique({
      where: {
        userId_skillId: {
          userId,
          skillId: manifest.id,
        },
      },
      select: { id: true },
    })
    const created = !existing

    const entry = existing
      ? await this.prisma.skillRegistryEntry.update({
        where: { id: existing.id },
        data: {
          title: manifest.title,
          description: manifest.description,
        },
      })
      : await this.prisma.skillRegistryEntry.create({
        data: {
          userId,
          skillId: manifest.id,
          title: manifest.title,
          description: manifest.description,
          pinnedAgents: '{}',
        },
      })

    const duplicateVersion = await this.prisma.skillRegistryVersion.findUnique({
      where: {
        entryId_version: {
          entryId: entry.id,
          version,
        },
      },
      select: { id: true },
    })
    if (duplicateVersion) {
      throw new BadRequestException(`Version "${version}" already exists for skill "${manifest.id}".`)
    }

    const nowIso = new Date().toISOString()
    const signature = this.signVersion({
      skillId: manifest.id,
      version,
      changelog,
      manifest,
      compatibility,
      publishedAt: nowIso,
    })

    await this.prisma.skillRegistryVersion.create({
      data: {
        entryId: entry.id,
        version,
        changelog,
        manifestJson: this.safeSerialize(manifest),
        compatibilityJson: compatibility ? this.safeSerialize(compatibility) : null,
        signature,
        publishedAt: new Date(nowIso),
      },
    })

    const next = await this.get(userId, manifest.id)
    return {
      entry: next,
      created,
    }
  }

  async install(
    userId: string,
    skillId: string,
    input: InstallSkillVersionInput = {},
  ): Promise<SkillRegistryEntryDto> {
    const entry = await this.requireEntryWithVersions(userId, skillId)
    const selected = this.pickVersion(entry, input.version)
    await this.assertVersionCompatible(selected)

    await this.skills.upsertCustomSkill(userId, {
      id: selected.manifest.id,
      title: selected.manifest.title,
      description: selected.manifest.description,
      tools: selected.manifest.tools,
      promptAppendix: selected.manifest.promptAppendix,
    })

    const pinnedAgents = this.parsePinnedAgents(entry.pinnedAgents)
    const agentId = this.normalizeAgentId(input.agentId)
    if (agentId) {
      pinnedAgents[agentId] = selected.version
    }

    await this.prisma.skillRegistryEntry.update({
      where: { id: entry.id },
      data: {
        installedVersion: selected.version,
        pinnedAgents: this.safeSerialize(pinnedAgents),
      },
    })

    return this.get(userId, entry.skillId)
  }

  async installPublic(
    userId: string,
    catalogId: string,
    input: InstallSkillVersionInput = {},
  ): Promise<SkillRegistryEntryDto> {
    const definition = this.requirePublicCatalogDefinition(catalogId)
    const requestedVersion = input.version ? this.normalizeVersion(input.version) : null
    if (requestedVersion && requestedVersion !== definition.version) {
      throw new NotFoundException(
        `Catalog skill "${definition.catalogId}" does not publish version "${requestedVersion}".`,
      )
    }

    const entry = await this.upsertPublicCatalogEntry(userId, definition)
    await this.ensureCatalogVersion(entry.id, definition)

    return this.install(userId, entry.skillId, {
      ...input,
      version: definition.version,
    })
  }

  async rollback(
    userId: string,
    skillId: string,
    input: RollbackSkillVersionInput = {},
  ): Promise<SkillRegistryEntryDto> {
    const entry = await this.requireEntryWithVersions(userId, skillId)
    const target = input.targetVersion
      ? this.pickVersion(entry, input.targetVersion)
      : this.findRollbackTarget(entry)

    if (!target) {
      throw new BadRequestException('No rollback target available for this skill.')
    }

    return this.install(userId, entry.skillId, {
      version: target.version,
      agentId: input.agentId,
    })
  }

  async pin(
    userId: string,
    skillId: string,
    input: PinSkillVersionInput,
  ): Promise<SkillRegistryEntryDto> {
    const entry = await this.requireEntryWithVersions(userId, skillId)
    const agentId = this.normalizeRequiredAgentId(input.agentId)
    const target = this.pickVersion(entry, input.version)
    const pinnedAgents = this.parsePinnedAgents(entry.pinnedAgents)
    pinnedAgents[agentId] = target.version

    await this.prisma.skillRegistryEntry.update({
      where: { id: entry.id },
      data: {
        pinnedAgents: this.safeSerialize(pinnedAgents),
      },
    })

    return this.get(userId, entry.skillId)
  }

  private async requireEntryWithVersions(userId: string, skillId: string) {
    const normalizedSkillId = this.normalizeSkillId(skillId)
    const row = await this.prisma.skillRegistryEntry.findUnique({
      where: {
        userId_skillId: {
          userId,
          skillId: normalizedSkillId,
        },
      },
      include: {
        versions: {
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    })
    if (!row) throw new NotFoundException(`Skill "${normalizedSkillId}" is not in the registry.`)
    if (row.versions.length === 0) {
      throw new BadRequestException(`Skill "${normalizedSkillId}" has no published versions.`)
    }
    return row
  }

  private pickVersion(
    entry: {
      skillId: string
      versions: Array<{
        version: string
        changelog: string
        manifestJson: string
        compatibilityJson: string | null
        signature: string
        publishedAt: Date
      }>
    },
    requestedVersion?: string,
  ): StoredSkillVersion {
    const versions = entry.versions
      .map((row) => this.toVersion(row))
      .filter((row): row is StoredSkillVersion => Boolean(row))
    if (versions.length === 0) {
      throw new BadRequestException(`Skill "${entry.skillId}" has no valid versions.`)
    }

    if (!requestedVersion) return versions[0]

    const normalized = this.normalizeVersion(requestedVersion)
    const match = versions.find((version) => version.version === normalized)
    if (!match) {
      throw new NotFoundException(`Version "${normalized}" not found for skill "${entry.skillId}".`)
    }
    return match
  }

  private findRollbackTarget(entry: {
    installedVersion: string | null
    versions: Array<{
      version: string
      changelog: string
      manifestJson: string
      compatibilityJson: string | null
      signature: string
      publishedAt: Date
    }>
  }): StoredSkillVersion | null {
    const versions = entry.versions
      .map((row) => this.toVersion(row))
      .filter((row): row is StoredSkillVersion => Boolean(row))

    if (versions.length < 2) return null
    if (!entry.installedVersion) return versions[1]

    const currentIndex = versions.findIndex((row) => row.version === entry.installedVersion)
    if (currentIndex < 0) return versions[1] ?? null
    return versions[currentIndex + 1] ?? null
  }

  private async assertVersionCompatible(version: StoredSkillVersion) {
    const compatibility = version.compatibility
    if (!compatibility) return

    if (compatibility.minApiVersion && this.compareSemver(this.apiSemver, compatibility.minApiVersion) < 0) {
      throw new BadRequestException(
        `Skill version ${version.version} requires API >= ${compatibility.minApiVersion}. Current API is ${this.apiSemver}.`,
      )
    }
    if (compatibility.maxApiVersion && this.compareSemver(this.apiSemver, compatibility.maxApiVersion) > 0) {
      throw new BadRequestException(
        `Skill version ${version.version} requires API <= ${compatibility.maxApiVersion}. Current API is ${this.apiSemver}.`,
      )
    }

    if (compatibility.requiredTools && compatibility.requiredTools.length > 0) {
      const knownTools = new Set((await this.tools.getAllDefinitions()).map((tool) => tool.name))
      const missing = compatibility.requiredTools.filter((tool) => !knownTools.has(tool))
      if (missing.length > 0) {
        throw new BadRequestException(
          `Skill version ${version.version} is missing required tools: ${missing.join(', ')}.`,
        )
      }
    }
  }

  private requirePublicCatalogDefinition(catalogId: string) {
    const normalizedCatalogId = this.normalizeSkillId(catalogId)
    const match = PUBLIC_SKILL_CATALOG.find((entry) => entry.catalogId === normalizedCatalogId)
    if (!match) {
      throw new NotFoundException(`Public catalog skill "${normalizedCatalogId}" was not found.`)
    }
    return match
  }

  private async upsertPublicCatalogEntry(userId: string, definition: PublicCatalogDefinition) {
    const manifest = this.sanitizeManifest(definition.manifest)
    return this.prisma.skillRegistryEntry.upsert({
      where: {
        userId_skillId: {
          userId,
          skillId: manifest.id,
        },
      },
      update: {
        title: manifest.title,
        description: manifest.description,
      },
      create: {
        userId,
        skillId: manifest.id,
        title: manifest.title,
        description: manifest.description,
        pinnedAgents: '{}',
      },
      select: {
        id: true,
        skillId: true,
      },
    })
  }

  private async ensureCatalogVersion(entryId: string, definition: PublicCatalogDefinition) {
    const version = this.buildCatalogVersion(definition)
    await this.prisma.skillRegistryVersion.upsert({
      where: {
        entryId_version: {
          entryId,
          version: version.version,
        },
      },
      update: {
        changelog: version.changelog,
        manifestJson: this.safeSerialize(version.manifest),
        compatibilityJson: version.compatibility ? this.safeSerialize(version.compatibility) : null,
        signature: version.signature,
        publishedAt: new Date(version.publishedAt),
      },
      create: {
        entryId,
        version: version.version,
        changelog: version.changelog,
        manifestJson: this.safeSerialize(version.manifest),
        compatibilityJson: version.compatibility ? this.safeSerialize(version.compatibility) : null,
        signature: version.signature,
        publishedAt: new Date(version.publishedAt),
      },
    })
  }

  private buildCatalogVersion(definition: PublicCatalogDefinition): StoredSkillVersion {
    const manifest = this.sanitizeManifest(definition.manifest)
    const version = this.normalizeVersion(definition.version)
    const changelog = this.normalizeChangelog(definition.changelog)
    const compatibility = this.sanitizeCompatibility(definition.compatibility)
    if (compatibility) {
      this.assertCompatibilityReferences(compatibility)
    }

    return {
      version,
      changelog,
      manifest,
      compatibility,
      signature: this.signVersion({
        skillId: manifest.id,
        version,
        changelog,
        manifest,
        compatibility,
        publishedAt: definition.publishedAt,
      }),
      publishedAt: definition.publishedAt,
    }
  }

  private buildCatalogVersionDto(definition: PublicCatalogDefinition): SkillRegistryVersionDto {
    return this.buildCatalogVersion(definition)
  }

  private collectMissingCatalogTools(definition: PublicCatalogDefinition, knownTools: Set<string>) {
    const required = new Set(definition.manifest.tools)
    const compatibility = this.sanitizeCompatibility(definition.compatibility)
    for (const tool of compatibility?.requiredTools ?? []) {
      required.add(tool)
    }
    return [...required].filter((tool) => !knownTools.has(tool)).sort((left, right) => left.localeCompare(right))
  }

  private isCatalogDefinitionInstallable(definition: PublicCatalogDefinition, missingTools: string[]) {
    if (missingTools.length > 0) return false

    const compatibility = this.sanitizeCompatibility(definition.compatibility)
    if (!compatibility) return true

    if (compatibility.minApiVersion && this.compareSemver(this.apiSemver, compatibility.minApiVersion) < 0) {
      return false
    }
    if (compatibility.maxApiVersion && this.compareSemver(this.apiSemver, compatibility.maxApiVersion) > 0) {
      return false
    }
    return true
  }

  private assertCompatibilityReferences(compatibility: SkillCompatibility | null) {
    if (!compatibility) return
    if (compatibility.minApiVersion && !SEMVER_PATTERN.test(compatibility.minApiVersion)) {
      throw new BadRequestException('compatibility.minApiVersion must be a semantic version (x.y.z).')
    }
    if (compatibility.maxApiVersion && !SEMVER_PATTERN.test(compatibility.maxApiVersion)) {
      throw new BadRequestException('compatibility.maxApiVersion must be a semantic version (x.y.z).')
    }
    if (compatibility.minApiVersion && compatibility.maxApiVersion) {
      if (this.compareSemver(compatibility.minApiVersion, compatibility.maxApiVersion) > 0) {
        throw new BadRequestException('compatibility.minApiVersion cannot be greater than maxApiVersion.')
      }
    }
  }

  private sanitizeManifest(input: SkillManifest): SkillManifest {
    const rawId = this.optionalText(input.id)
    if (!rawId) {
      throw new BadRequestException('skill.id is required.')
    }

    const rawTitle = this.optionalText(input.title)
    if (!rawTitle) {
      throw new BadRequestException('skill.title is required.')
    }

    const rawDescription = this.optionalText(input.description)
    if (!rawDescription) {
      throw new BadRequestException('skill.description is required.')
    }

    const normalizedTools = this.sanitizeTools(input.tools)

    const promptAppendix = this.optionalText(input.promptAppendix)

    return {
      id: this.normalizeSkillId(rawId),
      title: rawTitle.slice(0, 80),
      description: rawDescription.slice(0, 280),
      tools: normalizedTools,
      ...(promptAppendix ? { promptAppendix: promptAppendix.slice(0, 1000) } : {}),
    }
  }

  private sanitizeCompatibility(input: SkillCompatibility | undefined): SkillCompatibility | null {
    if (!input || typeof input !== 'object') return null
    const minApiVersion = this.optionalText(input.minApiVersion)
    const maxApiVersion = this.optionalText(input.maxApiVersion)
    const requiredTools = Array.isArray(input.requiredTools)
      ? [...new Set(input.requiredTools
        .map((tool) => this.optionalText(tool))
        .filter((tool): tool is string => Boolean(tool))
        .map((tool) => tool.slice(0, 120)))]
      : []

    if (!minApiVersion && !maxApiVersion && requiredTools.length === 0) return null

    return {
      ...(minApiVersion ? { minApiVersion } : {}),
      ...(maxApiVersion ? { maxApiVersion } : {}),
      ...(requiredTools.length > 0 ? { requiredTools } : {}),
    }
  }

  private normalizeChangelog(raw: string) {
    const value = this.optionalText(raw)
    if (!value) throw new BadRequestException('changelog is required.')
    return value.slice(0, 2_000)
  }

  private normalizeVersion(raw: string) {
    const value = this.optionalText(raw)
    if (!value) throw new BadRequestException('version is required.')
    if (!SEMVER_PATTERN.test(value)) {
      throw new BadRequestException(`Invalid semantic version: "${raw}".`)
    }
    return value
  }

  private normalizeCatalogLimit(raw: number | undefined) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 24
    return Math.max(1, Math.min(Math.trunc(raw), 100))
  }

  private normalizeSkillId(raw: string) {
    const value = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64)
    if (!value) throw new BadRequestException(`Invalid skill id: "${raw}".`)
    return value
  }

  private normalizeAgentId(raw: string | undefined) {
    const value = this.optionalText(raw)
    if (!value) return null
    return value.toLowerCase().replace(/[^a-z0-9:_-]+/g, '-').slice(0, 80)
  }

  private normalizeRequiredAgentId(raw: string | undefined) {
    const value = this.normalizeAgentId(raw)
    if (!value) throw new BadRequestException('agentId is required.')
    return value
  }

  private sanitizeTools(raw: string[]) {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('skill.tools must include at least one tool.')
    }
    const deduped: string[] = []
    const seen = new Set<string>()
    for (const tool of raw) {
      const value = this.optionalText(tool)
      if (!value) continue
      const normalized = value.slice(0, 120)
      if (seen.has(normalized)) continue
      seen.add(normalized)
      deduped.push(normalized)
      if (deduped.length >= 20) break
    }
    if (deduped.length === 0) {
      throw new BadRequestException('skill.tools must include at least one valid tool.')
    }
    return deduped
  }

  private toEntry(row: {
    skillId: string
    title: string
    description: string
    installedVersion: string | null
    pinnedAgents: string
    createdAt: Date
    updatedAt: Date
    versions: Array<{
      version: string
      changelog: string
      manifestJson: string
      compatibilityJson: string | null
      signature: string
      publishedAt: Date
    }>
  }): SkillRegistryEntryDto {
    return {
      skillId: row.skillId,
      title: row.title,
      description: row.description,
      installedVersion: row.installedVersion,
      versions: row.versions
        .map((version) => this.toVersion(version))
        .filter((version): version is SkillRegistryVersionDto => Boolean(version)),
      pinnedAgents: this.parsePinnedAgents(row.pinnedAgents),
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }
  }

  private toVersion(row: {
    version: string
    changelog: string
    manifestJson: string
    compatibilityJson: string | null
    signature: string
    publishedAt: Date
  }): StoredSkillVersion | null {
    const manifest = this.parseJsonObject(row.manifestJson)
    if (!manifest) return null

    const skillManifest = this.validateParsedManifest(manifest)
    if (!skillManifest) return null

    const compatibilityRaw = this.parseJsonObject(row.compatibilityJson)
    const compatibility = compatibilityRaw ? this.sanitizeCompatibility(compatibilityRaw as SkillCompatibility) : null

    return {
      version: row.version,
      changelog: row.changelog,
      manifest: skillManifest,
      compatibility,
      signature: row.signature,
      publishedAt: row.publishedAt.toISOString(),
    }
  }

  private validateParsedManifest(value: Record<string, unknown>): SkillManifest | null {
    try {
      return this.sanitizeManifest(value as unknown as SkillManifest)
    } catch {
      return null
    }
  }

  private parsePinnedAgents(raw: string): Record<string, string> {
    const parsed = this.parseJsonObject(raw) ?? {}
    const out: Record<string, string> = {}
    for (const [agentId, version] of Object.entries(parsed)) {
      const normalizedAgent = this.normalizeAgentId(agentId)
      if (!normalizedAgent || typeof version !== 'string' || !SEMVER_PATTERN.test(version)) continue
      out[normalizedAgent] = version
    }
    return out
  }

  private parseJsonObject(raw: string | null): Record<string, unknown> | null {
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      return parsed as Record<string, unknown>
    } catch {
      return null
    }
  }

  private normalizeApiSemver() {
    const trimmed = (process.env.OPENAGENTS_API_SEMVER ?? '').trim()
    if (trimmed && SEMVER_PATTERN.test(trimmed)) return trimmed
    const numeric = Number.parseInt(API_VERSION.replace(/[^0-9]/g, ''), 10)
    if (Number.isFinite(numeric) && numeric > 0) return `${numeric}.0.0`
    return '1.0.0'
  }

  private compareSemver(left: string, right: string) {
    const l = this.parseSemver(left)
    const r = this.parseSemver(right)
    if (!l || !r) return 0
    if (l.major !== r.major) return l.major - r.major
    if (l.minor !== r.minor) return l.minor - r.minor
    if (l.patch !== r.patch) return l.patch - r.patch
    return 0
  }

  private parseSemver(raw: string) {
    const match = raw.match(/^(\d+)\.(\d+)\.(\d+)/)
    if (!match) return null
    return {
      major: Number.parseInt(match[1], 10),
      minor: Number.parseInt(match[2], 10),
      patch: Number.parseInt(match[3], 10),
    }
  }

  private signVersion(input: {
    skillId: string
    version: string
    changelog: string
    manifest: SkillManifest
    compatibility: SkillCompatibility | null
    publishedAt: string
  }) {
    const secret = (process.env.SKILL_SIGNING_SECRET ?? 'openagents-dev-skill-signing-secret').trim()
    const payload = this.stableStringify({
      skillId: input.skillId,
      version: input.version,
      changelog: input.changelog,
      manifest: input.manifest,
      compatibility: input.compatibility,
      publishedAt: input.publishedAt,
    })
    return createHmac('sha256', secret).update(payload).digest('hex')
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
      return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${this.stableStringify(val)}`).join(',')}}`
    }
    return JSON.stringify(value)
  }

  private safeSerialize(value: unknown) {
    try {
      return JSON.stringify(value)
    } catch {
      return '{}'
    }
  }

  private optionalText(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed || null
  }
}
