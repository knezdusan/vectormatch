// src/proxy.ts

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Read the Better Auth session token cookie (Optimistic Check)
  // Better Auth's standard session token cookie name is 'better-auth.session_token'
  const sessionToken = request.cookies.get("better-auth.session_token")?.value;

  const isAuthPage = pathname.startsWith("/auth");
  const isDashboardPage = pathname.startsWith("/dashboard");

  // 2. If the user is authenticated and tries to visit /auth, redirect to /dashboard
  if (sessionToken && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 3. If the user is NOT authenticated and tries to visit /dashboard, redirect to /auth
  if (!sessionToken && isDashboardPage) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

// 4. Configure matcher to run proxy on all pages except static assets, media, and API endpoints
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png$).*)",
  ],
};
