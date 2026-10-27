const DEFAULT_TUNNEL_ORIGIN = 'https://focusing-lincoln-blades-unlike.trycloudflare.com'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) {
      const upstreamBase = (env.API_TUNNEL_URL || DEFAULT_TUNNEL_ORIGIN).replace(/\/$/, '')
      const targetUrl = `${upstreamBase}${url.pathname}${url.search}`

      const headers = new Headers(request.headers)
      headers.delete('host')
      headers.set('x-forwarded-host', url.host)
      headers.set('x-forwarded-proto', url.protocol.replace(':', ''))

      const init = {
        method: request.method,
        headers,
        redirect: 'manual',
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body
      }

      try {
        const upstreamRes = await fetch(targetUrl, init)
        const resHeaders = new Headers(upstreamRes.headers)
        resHeaders.set('access-control-allow-origin', url.origin)
        resHeaders.set('access-control-allow-credentials', 'true')
        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
          headers: resHeaders,
        })
      } catch (err) {
        return new Response(
          JSON.stringify({
            statusCode: 502,
            message: 'Live backend tunnel is unreachable.',
            detail: err instanceof Error ? err.message : 'Bad Gateway',
          }),
          {
            status: 502,
            headers: { 'content-type': 'application/json' },
          },
        )
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('Not Found', { status: 404 })
  },
}
