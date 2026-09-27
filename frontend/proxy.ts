import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side route gate. Runs before a protected page renders, so a signed-out visitor never
 * receives the dashboard at all. It checks only that the session cookie is present; the
 * signature is verified by the API, which is the real boundary.
 *
 * "/" is the public landing page and stays open to everyone.
 */
const isProtected = (p: string) => p === "/dashboard" || p.startsWith("/interview");

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("ip_token")?.value;

  if (isProtected(pathname) && !token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/register") && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
