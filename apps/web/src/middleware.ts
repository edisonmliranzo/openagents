import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PREFIXES = ['/chat', '/settings', '/memory', '/audit', '/approvals']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Redirect /register to the combined login/register page
  if (pathname === '/register') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!isProtected) return NextResponse.next()

  const authed = request.cookies.get('openagents-authed')?.value
  if (!authed) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
