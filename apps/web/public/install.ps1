param(
  [string]$InstallDir = (Join-Path $HOME 'openagents'),
  [switch]$RunDev,
  [switch]$SkipDocker,
  [switch]$SkipMigrate,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoUrl = 'https://github.com/edisonmliranzo/openagents.git'
$RepoRef = if ([string]::IsNullOrWhiteSpace($Env:OPENAGENTS_INSTALL_GIT_REF)) {
  'main'
} else {
  $Env:OPENAGENTS_INSTALL_GIT_REF.Trim()
}

function Write-Step([string]$Title) {
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machinePath;$userPath"
}

function Test-Command([string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = (Get-Location).Path
  )

  $display = ($Arguments | ForEach-Object {
    if ($_ -match '\s') { '"{0}"' -f $_ } else { $_ }
  }) -join ' '
  Write-Host "> $FilePath $display"

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $display"
  }
}

function Write-AsciiFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  Set-Content -LiteralPath $Path -Value $Content -Encoding Ascii
}

function Ensure-Winget {
  if (Test-Command 'winget') {
    return
  }
  throw 'winget is required on Windows to install missing prerequisites. Install App Installer from the Microsoft Store or rerun after enabling winget.'
}

function Ensure-AdminIfNeeded([string]$Label) {
  if (Test-Administrator) {
    return
  }
  throw "Missing prerequisite '$Label'. Rerun this installer from an elevated PowerShell window so it can install required packages."
}

function Ensure-Package {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$CommandName,
    [Parameter(Mandatory = $true)][string]$PackageId
  )

  if (Test-Command $CommandName) {
    return
  }

  Ensure-AdminIfNeeded $Label
  Ensure-Winget
  Invoke-External 'winget' @(
    'install',
    '--id', $PackageId,
    '--accept-package-agreements',
    '--accept-source-agreements',
    '--silent'
  )
  Refresh-Path

  if (-not (Test-Command $CommandName)) {
    throw "$Label was installed but is not available on PATH yet. Open a new PowerShell window and rerun the installer."
  }
}

function Ensure-Node20 {
  if (-not (Test-Command 'node')) {
    Ensure-Package 'Node.js 20+' 'node' 'OpenJS.NodeJS.LTS'
    return
  }

  $major = [int](& node -p "Number(process.versions.node.split('.')[0])")
  if ($major -ge 20) {
    return
  }

  Ensure-AdminIfNeeded 'Node.js 20+'
  Ensure-Winget
  Invoke-External 'winget' @(
    'install',
    '--id', 'OpenJS.NodeJS.LTS',
    '--accept-package-agreements',
    '--accept-source-agreements',
    '--silent'
  )
  Refresh-Path

  if (-not (Test-Command 'node')) {
    throw 'Node.js 20+ is still unavailable after installation.'
  }
}

function Ensure-Pnpm {
  if (-not (Test-Command 'corepack')) {
    throw 'corepack is unavailable even though Node.js is installed. Reinstall Node.js LTS and rerun the installer.'
  }

  Invoke-External 'corepack' @('enable')
  Invoke-External 'corepack' @('prepare', 'pnpm@9.0.0', '--activate')
  Refresh-Path

  if (-not (Test-Command 'pnpm')) {
    throw 'pnpm 9 could not be activated. Open a new PowerShell window and rerun the installer.'
  }
}

function Start-DockerDesktop {
  $candidates = @(
    (Join-Path $Env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $Env:LocalAppData 'Programs\Docker\Docker\Docker Desktop.exe')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      Start-Process -FilePath $candidate | Out-Null
      return
    }
  }
}

function Wait-ForDocker([int]$TimeoutSeconds = 240) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      & docker info *> $null
      if ($LASTEXITCODE -eq 0) {
        return
      }
    } catch {
    }
    Start-Sleep -Seconds 2
  }

  throw 'Docker Desktop did not become ready in time. Start Docker Desktop manually or rerun with -SkipDocker.'
}

function Sync-RepoRef {
  Invoke-External 'git' @('-C', $InstallDir, 'fetch', 'origin', '--prune', '--tags')
  Invoke-External 'git' @('-C', $InstallDir, 'checkout', $RepoRef)
  Invoke-External 'git' @('-C', $InstallDir, 'pull', '--ff-only', 'origin', $RepoRef)
}

function Clone-Or-UpdateRepo {
  $parentDir = Split-Path -Parent $InstallDir
  if (-not [string]::IsNullOrWhiteSpace($parentDir) -and -not (Test-Path $parentDir)) {
    New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
  }

  $gitDir = Join-Path $InstallDir '.git'
  if (Test-Path $gitDir) {
    Sync-RepoRef
    return
  }

  if (Test-Path $InstallDir) {
    throw "Install directory '$InstallDir' already exists but is not a git checkout. Remove it or pass a different -InstallDir."
  }

  Invoke-External 'git' @('clone', $RepoUrl, $InstallDir)
  Sync-RepoRef
}

function Run-Setup {
  $scriptName = 'setup'
  if ($SkipDocker) {
    $scriptName = 'setup:skip-docker'
  } elseif ($SkipMigrate) {
    $scriptName = 'setup:skip-migrate'
  }

  Invoke-External 'pnpm' @($scriptName) $InstallDir
}

function New-LauncherFiles {
  $cmdLauncherPath = Join-Path $InstallDir 'OpenAgents.cmd'
  $cmdLauncher = @'
@echo off
cd /d "%~dp0"
pnpm dev
pause
'@

  $psLauncherPath = Join-Path $InstallDir 'OpenAgents.ps1'
  $psLauncher = @'
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
pnpm dev
'@

  $readmePath = Join-Path $InstallDir 'OPENAGENTS-START-HERE.txt'
  $readmeText = @"
OpenAgents is installed.

Folder:
$InstallDir

Branch or tag:
$RepoRef

Start OpenAgents:
- Double-click OpenAgents.cmd
- or run: Set-Location '$InstallDir'; pnpm dev

Update OpenAgents:
- Rerun the same install command you used the first time.

Health check:
- Run: Set-Location '$InstallDir'; pnpm doctor

Backup:
- Run: Set-Location '$InstallDir'; pnpm backup:create

Login:
- http://localhost:3000/login
"@

  Write-AsciiFile -Path $cmdLauncherPath -Content $cmdLauncher
  Write-AsciiFile -Path $psLauncherPath -Content $psLauncher
  Write-AsciiFile -Path $readmePath -Content $readmeText
}

if ($Help) {
  Write-Host @'
OpenAgents Windows installer

Usage:
  powershell -ExecutionPolicy Bypass -File install.ps1 [options]

Options:
  -InstallDir <path>  Target clone directory. Default: $HOME\openagents
  -RunDev             Start `pnpm dev` after setup completes
  -SkipDocker         Skip Docker startup and run the lighter setup path
  -SkipMigrate        Skip Prisma migrate during setup
  -Help               Show this help

Environment:
  OPENAGENTS_INSTALL_GIT_REF  Git branch or tag to install. Default: main
'@
  exit 0
}

try {
  Write-Step 'Windows prerequisites'
  Ensure-Package 'Git' 'git' 'Git.Git'
  Ensure-Node20
  Ensure-Package 'Docker Desktop' 'docker' 'Docker.DockerDesktop'
  Ensure-Pnpm

  Write-Step 'Repository'
  Clone-Or-UpdateRepo

  if (-not $SkipDocker) {
    Write-Step 'Docker Desktop'
    Start-DockerDesktop
    Wait-ForDocker
  }

  Write-Step 'OpenAgents setup'
  Run-Setup
  New-LauncherFiles

  Write-Host ''
  Write-Host 'OpenAgents is installed.' -ForegroundColor Green
  Write-Host "Repo: $InstallDir"
  Write-Host "Git ref: $RepoRef"
  Write-Host "Launcher: $(Join-Path $InstallDir 'OpenAgents.cmd')"
  Write-Host "Instructions: $(Join-Path $InstallDir 'OPENAGENTS-START-HERE.txt')"
  Write-Host 'Start it with:'
  Write-Host "  Set-Location '$InstallDir'; pnpm dev"
  Write-Host "Or double-click $(Join-Path $InstallDir 'OpenAgents.cmd')"
  Write-Host 'Doctor command:'
  Write-Host "  Set-Location '$InstallDir'; pnpm doctor"
  Write-Host 'Backup command:'
  Write-Host "  Set-Location '$InstallDir'; pnpm backup:create"
  Write-Host 'Then open http://localhost:3000/login'

  if ($RunDev) {
    Write-Step 'Start development server'
    Invoke-External 'pnpm' @('dev') $InstallDir
  }
} catch {
  Write-Host ''
  Write-Host 'OpenAgents install failed.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
