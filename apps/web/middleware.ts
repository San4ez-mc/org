import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Захист усіх сторінок сесійним cookie. /login — відкритий.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/me')) return NextResponse.next();
  const token = req.cookies.get('org_session')?.value;
  if (token && token === process.env.AUTH_TOKEN) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.).*)'],
};
