import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const publicPaths = [
  '/',
  '/login',
];

function isPublic(pathname: string) {
  if (publicPaths.includes(pathname)) return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.match(/\.(ico|svg|png|jpg|jpeg|webp|css|js|woff2?)$/)) return true;
  return false;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
