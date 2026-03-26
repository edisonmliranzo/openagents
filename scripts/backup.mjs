#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const backupsDir = path.join(rootDir, 'backups')

const args = process.argv.slice(2)
const command = args[0]

function usage() {
  console.log(`OpenAgents backup

Usage:
  node scripts/backup.mjs create [--output backups/custom-name.tar.gz]
  node scripts/backup.mjs restore --file backups/openagents-backup-YYYYMMDD-HHmmss.tar.gz
  node scripts/backup.mjs list --file backups/openagents-backup-YYYYMMDD-HHmmss.tar.gz
`)
}

function commandCandidates(commandName) {
  if (process.platform !== 'win32') return [commandName]
  return [commandName, `${commandName}.cmd`, `${commandName}.exe`]
}

function run(commandName, commandArgs, options = {}) {
  for (const candidate of commandCandidates(commandName)) {
    const result = spawnSync(candidate, commandArgs, {
      cwd: options.cwd ?? rootDir,
      encoding: 'utf8',
      stdio: options.stdio ?? 'pipe',
    })
    if (result.error?.code === 'ENOENT') continue
    if (result.error) {
      throw new Error(result.error.message)
    }
    if (result.status !== 0) {
      throw new Error(result.stderr?.trim() || `Command failed: ${commandName} ${commandArgs.join(' ')}`)
    }
    return result.stdout?.trim() ?? ''
  }

  throw new Error(`Command not found: ${commandName}`)
}

function parseOption(name) {
  const index = args.findIndex((value) => value === name)
  if (index === -1) return null
  return args[index + 1] ?? null
}

function timestamp() {
  const now = new Date()
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ]
  return parts.join('')
}

function ensureTar() {
  run('tar', ['--version'])
}

function resolveArchivePath(inputPath) {
  const archive = inputPath ? path.resolve(rootDir, inputPath) : path.join(backupsDir, `openagents-backup-${timestamp()}.tar.gz`)
  const parent = path.dirname(archive)
  fs.mkdirSync(parent, { recursive: true })
  return archive
}

function existingBackupEntries() {
  const candidates = [
    'apps/api/.env',
    'apps/web/.env.local',
    'infra/docker/.env.prod',
    'apps/api/data',
    'data',
    'apps/api/prisma/dev.db',
    'apps/api/uploads',
  ]

  return candidates.filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath)))
}

function gitInfo() {
  try {
    const head = run('git', ['rev-parse', 'HEAD'])
    const branch = run('git', ['branch', '--show-current'])
    return { head, branch }
  } catch {
    return { head: 'unknown', branch: 'unknown' }
  }
}

function createBackup() {
  ensureTar()
  fs.mkdirSync(backupsDir, { recursive: true })

  const archivePath = resolveArchivePath(parseOption('--output'))
  const manifestName = `.openagents-backup-manifest-${Date.now()}.json`
  const manifestPath = path.join(rootDir, manifestName)
  const entries = existingBackupEntries()
  const manifest = {
    createdAt: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}`,
    nodeVersion: process.version,
    repo: gitInfo(),
    entries,
    hostname: os.hostname(),
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  try {
    run('tar', ['-czf', archivePath, '-C', rootDir, manifestName, ...entries])
  } finally {
    fs.rmSync(manifestPath, { force: true })
  }

  console.log(`Backup created: ${archivePath}`)
  console.log(`Entries: ${entries.length > 0 ? entries.join(', ') : 'manifest only'}`)
}

function restoreBackup() {
  ensureTar()
  const input = parseOption('--file')
  if (!input) {
    throw new Error('Restore requires --file <archive>.')
  }

  const archivePath = path.resolve(rootDir, input)
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Backup archive not found: ${archivePath}`)
  }

  run('tar', ['-xzf', archivePath, '-C', rootDir])
  console.log(`Backup restored from: ${archivePath}`)
  console.log('Rerun pnpm doctor or pnpm setup if the restored environment still needs bootstrapping.')
}

function listBackup() {
  ensureTar()
  const input = parseOption('--file')
  if (!input) {
    throw new Error('List requires --file <archive>.')
  }

  const archivePath = path.resolve(rootDir, input)
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Backup archive not found: ${archivePath}`)
  }

  const contents = run('tar', ['-tzf', archivePath])
  console.log(contents)
}

try {
  if (!command || command === '--help' || command === '-h') {
    usage()
    process.exit(0)
  }

  if (command === 'create') {
    createBackup()
    process.exit(0)
  }

  if (command === 'restore') {
    restoreBackup()
    process.exit(0)
  }

  if (command === 'list') {
    listBackup()
    process.exit(0)
  }

  throw new Error(`Unknown backup command "${command}".`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
