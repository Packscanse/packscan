import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";

export const DEFAULT_IDLE_MINUTES = 10;

/**
 * Rolling inactivity timeout, enforced on every request that touches the
 * session. Pure timestamp math (no DB) so it runs in edge middleware too;
 * the per-store minutes value travels inside the token. Returning null
 * invalidates the session → redirect to login.
 */
export function applyIdleTimeout(token: JWT): JWT | null {
  const idleMinutes =
    typeof token.idleMinutes === "number" ? token.idleMinutes : DEFAULT_IDLE_MINUTES;
  const lastActivity =
    typeof token.lastActivity === "number" ? token.lastActivity : 0;
  const now = Date.now();
  if (lastActivity && now - lastActivity > idleMinutes * 60_000) return null;
  // Tokens minted before this feature (lastActivity 0) start their clock now.
  token.lastActivity = now;
  return token;
}

// Edge-safe base config: imported by middleware, so it must not pull in
// Prisma or bcryptjs. The Credentials provider (which needs both) is added
// in src/auth.ts, which only runs in the Node.js runtime.
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = request.nextUrl.pathname.startsWith("/login");
      if (isLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL("/scan", request.nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.storeId = user.storeId;
        token.idleMinutes = user.idleMinutes;
        token.lastActivity = Date.now();
        return token;
      }
      return applyIdleTimeout(token);
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = token.role;
      session.user.storeId = token.storeId;
      return session;
    },
  },
} satisfies NextAuthConfig;
