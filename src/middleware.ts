import { NextRequest, NextResponse } from "next/server";

// Edge-safe cookie-presence gate only; real auth in route handlers.
const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/join",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/api/health",
  "/fonts",
  "/icons",
  "/favicon.ico",
  "/_next",
  "/manifest.json",
  "/sw.js",
  "/offline.html",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.get("lh_session")?.value;
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { message: "ابتدا وارد شوید", code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts/|icons/|favicon.ico).*)"],
};
