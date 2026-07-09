// src/proxy.ts

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(_request: NextRequest) {
  // Auth redirects are intentionally handled by the individual pages (via
  // getAuthSession) and the public Auth component. The previous optimistic
  // cookie check here caused an infinite redirect loop: a stale session-token
  // cookie (expired session, rotated secret, etc.) was enough to send /auth to
  // /dashboard, while the dashboard's getAuthSession() check failed and sent
  // the user back to /auth.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png$).*)",
  ],
};
