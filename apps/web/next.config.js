/** @type {import('next').NextConfig} */
const isStaticExport =
  process.env.CF_PAGES === '1' ||
  process.env.STATIC_EXPORT === '1' ||
  process.env.NEXT_PUBLIC_IS_CLOUD_PORTAL === 'true' ||
  process.env.CF_WORKERS === '1' ||
  Boolean(process.env.CF_PAGES_COMMIT_SHA)

const nextConfig = {
  transpilePackages: ['@openagents/shared', '@openagents/sdk'],
  ...(isStaticExport
    ? {
        output: 'export',
        images: { unoptimized: true },
      }
    : {
        async rewrites() {
          const apiBase = process.env.OPENAGENTS_INTERNAL_API_URL || 'http://localhost:3001'
          return [
            {
              source: '/api/:path*',
              destination: `${apiBase}/api/:path*`,
            },
          ]
        },
      }),
}

module.exports = nextConfig
