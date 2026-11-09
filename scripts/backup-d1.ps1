# Exports the remote D1 database to backups/ and keeps the latest 8 dumps.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$out = "backups/openagents-db-$stamp.sql"
Push-Location $root
try {
  npx wrangler d1 export openagents-db --remote --output $out
  if ($LASTEXITCODE -ne 0) { throw "wrangler export failed ($LASTEXITCODE)" }
} finally { Pop-Location }
Get-ChildItem $dir -Filter 'openagents-db-*.sql' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 8 | Remove-Item -Force
Write-Host "Backup written: $out"
