/** @type {import('next').NextConfig} */
const apiPort = `${process.env.API_PORT ?? '3001'}`.trim() || '3001'
const internalApiTarget = `${process.env.OPENAGENTS_INTERNAL_API_URL ?? `http://127.0.0.1:${apiPort}`}`
  .trim()
  .replace(/\/+$/, '')

const nextConfig = {
  transpilePackages: ['@openagents/shared', '@openagents/sdk'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiTarget}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
