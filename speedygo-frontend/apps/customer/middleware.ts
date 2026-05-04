import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // Check for auth token in localStorage-backed cookie or Zustand persisted key.
  // Since tokens are in localStorage (not cookies), we check for a lightweight
  // auth indicator cookie that the client sets on login. This prevents flash of
  // protected content before JS hydrates. The actual token validation happens
  // client-side and via the backend.
  const authCookie = req.cookies.get('speedygo-authenticated');
  if (!authCookie || authCookie.value !== '1') {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};

