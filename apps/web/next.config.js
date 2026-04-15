/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@openagents/shared', '@openagents/sdk'],
  async rewrites() {
    const apiBase = process.env.OPENAGENTS_INTERNAL_API_URL || 'http://localhost:3001'
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
