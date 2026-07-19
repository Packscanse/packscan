import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth-config";

// Edge runtime: uses only the edge-safe config (no Prisma/bcrypt).
const { auth } = NextAuth(authConfig);

const isDev = process.env.NODE_ENV === "development";

/**
 * Session gate (via the authorized callback) + nonce-based CSP. The nonce
 * travels on the request headers so Next applies it to its own inline
 * scripts; 'strict-dynamic' lets those scripts load the rest. Dev needs
 * eval (React Refresh) and websockets (HMR).
 */
export default auth(function middleware(req) {
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", // store logos are data URLs; camera previews use blobs
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
});

export const config = {
  matcher: [
    // api/carriers authenticates with its webhook secret and api/v1 with
    // bearer tokens — neither uses the session cookie, and an API caller
    // must get a 401 JSON from the route, not a redirect to /login.
    "/((?!api/auth|api/carriers|api/v1|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
