export type OpenAgentsInstallIntent = 'none' | 'local' | 'server'
export type OpenAgentsLocalQuickStartPlatform = 'windows' | 'macos' | 'ubuntu'

export interface OpenAgentsQuickStartConfig {
  label: string
  shellPrefix: string
  installCommand: string
  startCommand: string
  launcherHint: string
  installerNote: string
  localCommands: string[]
  runtimeNote: string
  accessExample: string
}

export const OPENAGENTS_REPO_URL = 'https://github.com/edisonmliranzo/openagents.git'
export const OPENAGENTS_REPO_WEB_URL = 'https://github.com/edisonmliranzo/openagents'
export const OPENAGENTS_RAW_BASE_URL =
  'https://raw.githubusercontent.com/edisonmliranzo/openagents/main'
export const OPENAGENTS_INSTALL_GIT_REF = 'main'
export const OPENAGENTS_INSTALL_GIT_REF_ENV = 'OPENAGENTS_INSTALL_GIT_REF'
export const OPENAGENTS_INSTALLER_WEB_PATHS = {
  windows: '/install.ps1',
  unix: '/install.sh',
} as const
export const OPENAGENTS_INSTALLER_URLS = {
  windows: `${OPENAGENTS_RAW_BASE_URL}/scripts/install.ps1`,
  unix: `${OPENAGENTS_RAW_BASE_URL}/scripts/install.sh`,
} as const

function normalizeOpenAgentsOrigin(origin?: string) {
  const normalized = origin?.trim()
  return normalized ? normalized.replace(/\/+$/, '') : ''
}

function resolveOpenAgentsInstallGitRef(gitRef?: string) {
  const normalized = gitRef?.trim()
  return normalized || OPENAGENTS_INSTALL_GIT_REF
}

function shouldInjectOpenAgentsGitRef(gitRef: string) {
  return gitRef !== OPENAGENTS_INSTALL_GIT_REF
}

export function getOpenAgentsInstallerUrl(
  platform: OpenAgentsLocalQuickStartPlatform,
  origin?: string,
) {
  const normalizedOrigin = normalizeOpenAgentsOrigin(origin)
  if (normalizedOrigin) {
    return `${normalizedOrigin}${
      platform === 'windows'
        ? OPENAGENTS_INSTALLER_WEB_PATHS.windows
        : OPENAGENTS_INSTALLER_WEB_PATHS.unix
    }`
  }

  return platform === 'windows' ? OPENAGENTS_INSTALLER_URLS.windows : OPENAGENTS_INSTALLER_URLS.unix
}

export function getOpenAgentsInstallCommand(
  platform: OpenAgentsLocalQuickStartPlatform,
  origin?: string,
  gitRef?: string,
) {
  const installerUrl = getOpenAgentsInstallerUrl(platform, origin)
  const resolvedGitRef = resolveOpenAgentsInstallGitRef(gitRef)

  if (platform === 'windows') {
    if (shouldInjectOpenAgentsGitRef(resolvedGitRef)) {
      return `powershell -NoProfile -ExecutionPolicy Bypass -c "$env:${OPENAGENTS_INSTALL_GIT_REF_ENV}='${resolvedGitRef}'; irm ${installerUrl} | iex"`
    }

    return `powershell -NoProfile -ExecutionPolicy Bypass -c "irm ${installerUrl} | iex"`
  }

  if (shouldInjectOpenAgentsGitRef(resolvedGitRef)) {
    return `curl -fsSL ${installerUrl} | ${OPENAGENTS_INSTALL_GIT_REF_ENV}='${resolvedGitRef}' bash`
  }

  return `curl -fsSL ${installerUrl} | bash`
}

export const OPENAGENTS_SUPPORT_IDENTITY_PROMPT = [
  'You are OpenAgents, the assistant for the OpenAgents project.',
  'When the user asks about the product, repository, install, deployment, setup, or runtime, answer specifically about OpenAgents.',
  'Do not describe OpenAgents as another product or hosted model.',
  'If the user asks about MANUS_MODE or MANUS_LITE, explain they are OpenAgents compatibility preset names.',
].join('\n')

export const OPENAGENTS_IDENTITY_APPENDIX = [
  'Identity rules:',
  '- Your identity is OpenAgents.',
  '- If asked who you are, answer as OpenAgents or the OpenAgents assistant.',
  '- Do not answer that you are Claude, Anthropic, Manus, or another product.',
  '- If the user asks about the underlying provider or model, describe that separately from your identity.',
].join('\n')

export const OPENAGENTS_UBUNTU_SERVER_INSTALL_LINES = [
  'apt-get update',
  'apt-get install -y git curl ca-certificates',
  'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
  'apt-get install -y nodejs docker.io docker-compose-plugin',
  'corepack enable',
  'corepack prepare pnpm@9.0.0 --activate',
  'systemctl enable --now docker',
  '',
  'mkdir -p /opt',
  'cd /opt',
  'if [ ! -d openagents/.git ]; then',
  `  git clone ${OPENAGENTS_REPO_URL}`,
  'fi',
  'cd /opt/openagents',
  'git pull --ff-only origin main',
  '',
  'cp -n infra/docker/.env.prod.example infra/docker/.env.prod',
  '# edit infra/docker/.env.prod and set real secrets',
  '',
  'pnpm install --frozen-lockfile',
  'pnpm prod:deploy',
  '# only if you use Ollama on the host: pnpm prod:check:ollama',
  '',
  'Access: http://YOUR_UBUNTU_IP/login if nginx proxies to OpenAgents, or http://YOUR_UBUNTU_IP:3000/login if you expose the web container directly.',
]

export const OPENAGENTS_UBUNTU_SERVER_INSTALL_GUIDE =
  OPENAGENTS_UBUNTU_SERVER_INSTALL_LINES.join('\n')

export const OPENAGENTS_LOCAL_QUICK_START: Record<
  OpenAgentsLocalQuickStartPlatform,
  OpenAgentsQuickStartConfig
> = {
  windows: {
    label: 'Windows',
    shellPrefix: 'PS>',
    installCommand: getOpenAgentsInstallCommand('windows'),
    startCommand: "cd $HOME\\openagents; pnpm dev",
    launcherHint: 'Or double-click OpenAgents.cmd inside the openagents folder.',
    installerNote: 'Installs Git, Node.js LTS, pnpm, Docker Desktop, clones the repo, and runs setup.',
    localCommands: [
      'winget install Git.Git',
      'winget install OpenJS.NodeJS.LTS',
      'winget install Docker.DockerDesktop',
      'corepack enable',
      'corepack prepare pnpm@9.0.0 --activate',
      `git clone ${OPENAGENTS_REPO_URL}`,
      'cd openagents',
      'pnpm setup',
      'pnpm dev',
    ],
    runtimeNote: 'PowerShell with Node.js 20+, pnpm 9+, Git, and Docker Desktop running.',
    accessExample: 'Open http://localhost:3000/login after startup.',
  },
  macos: {
    label: 'macOS',
    shellPrefix: '$',
    installCommand: getOpenAgentsInstallCommand('macos'),
    startCommand: 'cd ~/openagents && pnpm dev',
    launcherHint: 'Or double-click OpenAgents.command inside the openagents folder.',
    installerNote: 'Installs Homebrew tools if needed, installs Git, Node, Docker Desktop, clones the repo, and runs setup.',
    localCommands: [
      'brew install git node@20',
      'brew install --cask docker',
      'corepack enable',
      'corepack prepare pnpm@9.0.0 --activate',
      `git clone ${OPENAGENTS_REPO_URL}`,
      'cd openagents',
      'pnpm setup',
      'pnpm dev',
    ],
    runtimeNote: 'Homebrew with Node.js 20+, pnpm 9+, Git, and Docker Desktop running.',
    accessExample: 'Open http://localhost:3000/login after startup.',
  },
  ubuntu: {
    label: 'Ubuntu',
    shellPrefix: '$',
    installCommand: getOpenAgentsInstallCommand('ubuntu'),
    startCommand: 'cd ~/openagents && pnpm dev',
    launcherHint: 'Or run ~/openagents/openagents-start.sh to relaunch it later.',
    installerNote: 'Installs Git, Node.js 20, pnpm, Docker, clones the repo, and runs setup.',
    localCommands: [
      'sudo apt-get update',
      'sudo apt-get install -y git curl ca-certificates gnupg',
      'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -',
      'sudo apt-get install -y nodejs docker.io docker-compose-plugin',
      'sudo systemctl enable --now docker',
      'sudo usermod -aG docker "$USER"',
      'newgrp docker',
      'corepack enable',
      'corepack prepare pnpm@9.0.0 --activate',
      `git clone ${OPENAGENTS_REPO_URL}`,
      'cd openagents',
      'pnpm setup',
      'pnpm dev',
    ],
    runtimeNote: 'Ubuntu 22.04+ with Node.js 20+, pnpm 9+, Git, and Docker Engine running.',
    accessExample: 'Open http://YOUR_UBUNTU_IP:3000/login or your configured domain after startup.',
  },
}

const OPENAGENTS_INSTALL_QUERY_PATTERN =
  /\b(install|installation|setup|set up|deploy|deployment|self-host|self host|new server|server|vps|run locally|local install|local setup)\b/i
const OPENAGENTS_SERVER_HINT_PATTERN =
  /\b(server|new server|vps|production|prod|deploy|deployment|self-host|self host|docker|hosted)\b/i
const OPENAGENTS_LOCAL_HINT_PATTERN =
  /\b(local|locally|windows|macos|mac os|mac|ubuntu|laptop|desktop|dev|development|pnpm dev)\b/i

function renderPromptGuide(title: string, lines: string[]) {
  return [`${title}:`, ...lines].join('\n')
}

function renderQuickStartGuide(title: string, config: OpenAgentsQuickStartConfig) {
  return renderPromptGuide(title, [
    `Install: ${config.installCommand}`,
    `Start: ${config.startCommand}`,
    ...config.localCommands,
    `Access: ${config.accessExample}`,
  ])
}

const OPENAGENTS_LOCAL_INSTALL_PROMPT_GUIDE = [
  renderQuickStartGuide('Windows local quick start', OPENAGENTS_LOCAL_QUICK_START.windows),
  renderQuickStartGuide('macOS local quick start', OPENAGENTS_LOCAL_QUICK_START.macos),
  renderQuickStartGuide('Ubuntu local quick start', OPENAGENTS_LOCAL_QUICK_START.ubuntu),
].join('\n\n')

export function classifyOpenAgentsInstallIntent(message: string): OpenAgentsInstallIntent {
  const normalized = message.trim()
  if (!normalized || !OPENAGENTS_INSTALL_QUERY_PATTERN.test(normalized)) return 'none'
  if (OPENAGENTS_SERVER_HINT_PATTERN.test(normalized)) return 'server'
  if (OPENAGENTS_LOCAL_HINT_PATTERN.test(normalized)) return 'local'
  return 'server'
}

export function getOpenAgentsInstallPromptAppendix(message: string) {
  const intent = classifyOpenAgentsInstallIntent(message)
  if (intent === 'none') return ''

  const sections = [
    OPENAGENTS_SUPPORT_IDENTITY_PROMPT,
    'Keep product naming grounded in OpenAgents unless the user explicitly asks about compatibility preset names.',
  ]

  if (intent === 'local') {
    sections.push(
      'The user is asking about local development setup. Prefer the matching local quick start below.',
      OPENAGENTS_LOCAL_INSTALL_PROMPT_GUIDE,
    )
    return sections.join('\n\n')
  }

  sections.push(
    'The user is asking about installation for a server or has not specified a local-only environment. Default to the canonical Ubuntu 22.04+ Docker production flow below.',
    OPENAGENTS_UBUNTU_SERVER_INSTALL_GUIDE,
  )
  return sections.join('\n\n')
}
