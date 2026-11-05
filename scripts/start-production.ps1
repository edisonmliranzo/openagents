# OpenAgents One-Command Production Launcher
# Starts the API on port 3001, launches Cloudflare Tunnel, updates scripts/cf-worker.mjs if needed, and deploys Worker.
param(
  [switch]$UseNamedTunnel = $false
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "[OpenAgents Launch] Starting API server on port 3001..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RepoRoot'; pnpm --filter @openagents/api dev" -WindowStyle Minimized

$Cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if ($UseNamedTunnel) {
  $NamedConfig = Join-Path $PSScriptRoot "cloudflared-openagents-api.yml"
  Write-Host "[OpenAgents Launch] Starting Named Cloudflare Tunnel (api.openagents.us)..."
  Start-Process $Cloudflared -ArgumentList "tunnel", "--config", "$NamedConfig", "--protocol", "http2", "--edge-ip-version", "4", "run", "3fe926b0-199f-4b11-a1b5-4e443b77da1c"
} else {
  $LogFile = Join-Path $RepoRoot "cloudflared-live.log"
  if (Test-Path $LogFile) { Remove-Item $LogFile -Force }
  Write-Host "[OpenAgents Launch] Starting Quick Tunnel and auto-syncing Cloudflare Worker..."
  Start-Process $Cloudflared -ArgumentList "tunnel", "--url", "http://localhost:3001", "--protocol", "http2", "--edge-ip-version", "4", "--no-autoupdate", "--logfile", "$LogFile" -WindowStyle Minimized
  Start-Sleep -Seconds 6
  if (Test-Path $LogFile) {
    $Match = Select-String -Path $LogFile -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($Match) {
      $TunnelUrl = $Match.Matches[0].Value
      Write-Host "[OpenAgents Launch] Detected Tunnel URL: $TunnelUrl"
      $WorkerPath = Join-Path $PSScriptRoot "cf-worker.mjs"
      (Get-Content $WorkerPath) -replace "const DEFAULT_TUNNEL_ORIGIN = '[^']+'", "const DEFAULT_TUNNEL_ORIGIN = '$TunnelUrl'" | Set-Content $WorkerPath
      $env:NODE_OPTIONS = "--dns-result-order=ipv4first"
      npx wrangler deploy
    }
  }
}
