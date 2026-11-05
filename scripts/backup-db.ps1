# OpenAgents ProductionPostgreSQL Backup Script
# Usage: powershell -ExecutionPolicy Bypass -File scripts/backup-db.ps1
param(
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $RepoRoot "apps\api\.env"
$BackupDir = Join-Path $RepoRoot "backups"

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$DbUrl = $env:DATABASE_URL
if (-not $DbUrl -and (Test-Path $EnvFile)) {
  $line = Get-Content $EnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if ($line) {
    $DbUrl = ($line -replace '^DATABASE_URL=', '').Trim('"', "'")
  }
}

if (-not $DbUrl) {
  Write-Error "DATABASE_URL not found in environment or apps/api/.env"
  exit 1
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupFile = Join-Path $BackupDir "openagents-db-$Timestamp.sql"

Write-Host "[OpenAgents Backup] Creating PostgreSQL dump -> $BackupFile"
pg_dump "$DbUrl" --no-owner --no-acl -f "$BackupFile"

if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

# Prune backups older than $RetentionDays
$Cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "openagents-db-*.sql" | Where-Object { $_.LastWriteTime -lt $Cutoff } | ForEach-Object {
  Write-Host "[OpenAgents Backup] Pruning old backup $($_.Name)"
  Remove-Item $_.FullName -Force
}

Write-Host "[OpenAgents Backup] Completed successfully."
