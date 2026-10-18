import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PREFIXES = [
  '/admin',
  '/chat',
  '/settings',
  '/memory',
  '/audit',
  '/approvals',
  '/control',
  '/agent',
  '/sessions',
  '/tasks',
  '/team',
  '/CommandCenter',
]

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  return res
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Block probing for sensitive dotfiles (.env, .git, wp-admin, phpmyadmin, etc.)
  if (
    /(^|\/)\.(env|git|svn|htaccess|htpasswd|aws|ssh)(\/|$|\.)/i.test(pathname) ||
    /(^|\/)(wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|vendor\/phpunit)/i.test(pathname)
  ) {
    return new NextResponse('Not Found', { status: 404 })
  }

  // Redirect /register to the combined login/register page
  if (pathname === '/register') {
    return withSecurityHeaders(NextResponse.redirect(new URL('/login', request.url)))
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!isProtected) return withSecurityHeaders(NextResponse.next())

  const authed = request.cookies.get('openagents-authed')?.value
  if (!authed) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return withSecurityHeaders(NextResponse.redirect(loginUrl))
  }

  return withSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}

