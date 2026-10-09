param(
  [string]$InstallDir = (Join-Path $HOME 'openagents'),
  [switch]$RunDev,
  [switch]$SkipDocker,
  [switch]$SkipMigrate,
  [switch]$InstallOllama,
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
      # Keep waiting for Docker Desktop.
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

function Register-WatchdogTask {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    return
  }

  try {
    $scriptPath = Join-Path $InstallDir 'scripts\dev-watchdog.mjs'
    $action = New-ScheduledTaskAction -Execute $nodeCmd.Source `
      -Argument "`"$scriptPath`" --ensure" -WorkingDirectory $InstallDir
    $triggers = @(
      (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME),
      (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5))
    )
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable
    Register-ScheduledTask -TaskName 'OpenAgentsDevWatchdog' -Action $action -Trigger $triggers -Settings $settings -Force | Out-Null
    Write-Host 'Self-heal task registered: OpenAgentsDevWatchdog (revives api+web+Ollama every 5 min and at sign-in)'
  } catch {
    Write-Host "Could not register the self-heal task ($($_.Exception.Message)). OpenAgents still works - start it with OpenAgents.cmd." -ForegroundColor Yellow
  }
}

function New-LauncherFiles {
  $cmdLauncherPath = Join-Path $InstallDir 'OpenAgents.cmd'
  $cmdLauncher = @'
@echo off
cd /d "%~dp0"
schtasks /Change /TN "OpenAgentsDevWatchdog" /Enable >nul 2>&1
echo OpenAgents self-healing server. Keep this window open while you use the app.
echo App: http://localhost:3000  -  browser menu > Install/OpenAgents as app
pnpm dev:watch
pause
'@

  $stopLauncherPath = Join-Path $InstallDir 'StopOpenAgents.cmd'
  $stopLauncher = @'
@echo off
schtasks /Change /TN "OpenAgentsDevWatchdog" /Disable >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'dev-watchdog' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F }" >nul 2>&1
echo OpenAgents stopped and auto-revive disabled. Run OpenAgents.cmd to start again.
pause
'@

  $psLauncherPath = Join-Path $InstallDir 'OpenAgents.ps1'
  $psLauncher = @'
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
pnpm dev:watch
'@

  $desktopDir = [Environment]::GetFolderPath('Desktop')
  $urlShortcut = Join-Path $desktopDir 'OpenAgents.url'
  $urlContent = "[InternetShortcut]`r`nURL=http://localhost:3000/`r`n"

  $readmePath = Join-Path $InstallDir 'OPENAGENTS-START-HERE.txt'
  $readmeText = @"
OpenAgents is installed.

Folder:
$InstallDir

Branch or tag:
$RepoRef

Start OpenAgents:
- Double-click OpenAgents.cmd (self-healing server; keep the window open)
- It also auto-starts at sign-in via the OpenAgentsDevWatchdog task

Install as a desktop app (recommended):
1. Start OpenAgents and open http://localhost:3000 in Chrome or Edge
2. Sign in once
3. Browser menu > Apps > "Install this site as an app" (Edge: ... > Apps > Install OpenAgents as an app)
4. Pin the OpenAgents icon to the taskbar - it launches as its own window

Stop OpenAgents:
- Double-click StopOpenAgents.cmd (also disables auto-revive)

Update OpenAgents:
- Rerun the same install command you used the first time.

Health check:
- Run: Set-Location '$InstallDir'; pnpm doctor

Backup:
- Run: Set-Location '$InstallDir'; pnpm backup:create

Local AI (optional):
- Ollama models power the free local brain. Install from https://ollama.com
  or rerun the installer with -InstallOllama.

Login:
- http://localhost:3000/login
"@

  Write-AsciiFile -Path $cmdLauncherPath -Content $cmdLauncher
  Write-AsciiFile -Path $stopLauncherPath -Content $stopLauncher
  Write-AsciiFile -Path $psLauncherPath -Content $psLauncher
  Write-AsciiFile -Path $urlShortcut -Content $urlContent
  Write-AsciiFile -Path $readmePath -Content $readmeText
}

if ($Help) {
  Write-Host @'
OpenAgents Windows installer

Usage:
  powershell -ExecutionPolicy Bypass -File scripts/install.ps1 [options]

Options:
  -InstallDir <path>  Target clone directory. Default: $HOME\openagents
  -RunDev             Start the self-healing server (pnpm dev:watch) after setup
  -SkipDocker         Skip Docker startup and run the lighter setup path
  -SkipMigrate        Skip Prisma migrate during setup
  -InstallOllama      Install Ollama (free local AI models) via winget
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

  if ($InstallOllama) {
    Write-Step 'Ollama (local AI models)'
    Ensure-Package 'Ollama' 'ollama' 'Ollama.Ollama'
    $ollamaExe = Join-Path $Env:LocalAppData 'Programs\Ollama\Ollama.exe'
    if (Test-Path $ollamaExe) {
      Start-Process -FilePath $ollamaExe | Out-Null
      Write-Host 'Ollama started - OpenAgents will use it as the free local brain.'
    }
  }

  if (-not $SkipDocker) {
    Write-Step 'Docker Desktop'
    Start-DockerDesktop
    Wait-ForDocker
  }

  Write-Step 'OpenAgents setup'
  Run-Setup
  New-LauncherFiles
  Register-WatchdogTask

  Write-Host ''
  Write-Host 'OpenAgents is installed.' -ForegroundColor Green
  Write-Host "Repo: $InstallDir"
  Write-Host "Git ref: $RepoRef"
  Write-Host "Launcher: $(Join-Path $InstallDir 'OpenAgents.cmd')"
  Write-Host "Desktop shortcut: OpenAgents.url (double-click to open the app)"
  Write-Host "Instructions: $(Join-Path $InstallDir 'OPENAGENTS-START-HERE.txt')"
  Write-Host 'Start it with:'
  Write-Host "  Set-Location '$InstallDir'; pnpm dev:watch"
  Write-Host "Or double-click $(Join-Path $InstallDir 'OpenAgents.cmd')"
  Write-Host 'Doctor command:'
  Write-Host "  Set-Location '$InstallDir'; pnpm doctor"
  Write-Host 'Backup command:'
  Write-Host "  Set-Location '$InstallDir'; pnpm backup:create"
  Write-Host 'Then open http://localhost:3000/login and install it as an app:'
  Write-Host '  Browser menu > Apps > Install OpenAgents as an app'

  if ($RunDev) {
    Write-Step 'Start self-healing development server'
    Invoke-External 'pnpm' @('dev:watch') $InstallDir
  }
} catch {
  Write-Host ''
  Write-Host 'OpenAgents install failed.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
