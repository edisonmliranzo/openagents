import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

console.log('[build-cloudflare] Starting Cloudflare Web Frontend build...')

// 1. Build @openagents/shared
console.log('[build-cloudflare] Step 1: Building @openagents/shared...')
execSync('pnpm --filter @openagents/shared build', {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' }
})

// 2. Build @openagents/web with static export
console.log('[build-cloudflare] Step 2: Building @openagents/web static export...')
execSync('pnpm --filter @openagents/web build', {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    CF_PAGES: '1',
    STATIC_EXPORT: '1',
    NEXT_PUBLIC_IS_CLOUD_PORTAL: 'true',
    CI: 'true'
  }
})

console.log('[build-cloudflare] Build completed successfully. Static assets generated in apps/web/out')
