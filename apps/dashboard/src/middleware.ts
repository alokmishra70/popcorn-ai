import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optional HTTP basic auth for self-hosted dashboards. Set POPCORN_DASHBOARD_USER
 * and POPCORN_DASHBOARD_PASSWORD to enable; leave unset for local use.
 */
export function middleware(request: NextRequest) {
  const user = process.env.POPCORN_DASHBOARD_USER;
  const password = process.env.POPCORN_DASHBOARD_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const [givenUser, ...rest] = atob(header.slice(6)).split(':');
    if (givenUser === user && rest.join(':') === password) return NextResponse.next();
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="popcorn", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg).*)'],
};
