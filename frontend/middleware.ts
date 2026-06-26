import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware for route-level auth guards.
 * Checks cookie presence (not validity — that's done server-side).
 * We check BOTH access_token and refresh_token because the access token
 * expires every 15 min. A valid refresh_token means the user is still logged in
 * and the frontend will silently refresh the access token.
 */

const PUBLIC_ROUTES = ["/", "/auth/login", "/auth/register", "/auth/verify-email", "/auth/forgot-password", "/auth/reset-password", "/contact", "/policy"];
const AUTH_ROUTES = ["/auth/login", "/auth/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAccessToken = request.cookies.has("access_token");
  const hasRefreshToken = request.cookies.has("refresh_token");
  const isLoggedIn = hasAccessToken || hasRefreshToken;

  // Skip API routes and static assets (images, icons, manifests, sitemaps, etc.)
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|webm|mp4|woff2?|ttf|eot|json|xml|txt|css|js|map)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Logged-in user trying to access login/register → redirect to dashboard
  if (isLoggedIn && AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Not logged in trying to access protected route → redirect to login
  if (!isLoggedIn && !PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Run middleware on all routes.
   * Static file filtering is handled inside the middleware function itself
   * using regex, which is more reliable than matcher patterns for extensions.
   */
  matcher: ["/((?!_next/static|_next/image).*)"],
};
