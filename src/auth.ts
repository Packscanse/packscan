import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { applyIdleTimeout, authConfig, DEFAULT_IDLE_MINUTES } from "@/lib/auth-config";
import { clientIp, verifyCredentials } from "@/lib/credentials";

// How stale a JWT's user snapshot may get before we re-check the DB.
// Bounds how long a deactivated account (or outdated role/idle-timeout
// setting) stays usable.
const SESSION_RECHECK_MS = 5 * 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, pin: {} },
      // All real logic (rate limiting, active flag, password-vs-PIN) lives
      // in verifyCredentials, shared with POST /api/v1/auth/login.
      async authorize(raw, request) {
        return verifyCredentials(raw, clientIp(request.headers));
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Node-runtime override of the edge-safe jwt callback: same idle-timeout
    // enforcement, plus a periodic DB re-check so deactivation revokes access
    // within SESSION_RECHECK_MS and role/store/idle-setting changes propagate
    // without re-login. Middleware keeps using the DB-free base callback.
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.storeId = user.storeId;
        token.idleMinutes = user.idleMinutes;
        token.authMethod = user.authMethod;
        token.locale = user.locale;
        token.lastActivity = Date.now();
        token.checkedAt = Date.now();
        return token;
      }

      const alive = applyIdleTimeout(token);
      if (!alive) return null;

      const checkedAt = typeof alive.checkedAt === "number" ? alive.checkedAt : 0;
      if (alive.sub && Date.now() - checkedAt > SESSION_RECHECK_MS) {
        const dbUser = await prisma.user.findUnique({
          where: { id: alive.sub },
          select: {
            active: true,
            role: true,
            storeId: true,
            locale: true,
            store: { select: { sessionIdleMinutes: true } },
          },
        });
        if (!dbUser?.active) return null; // invalidates the session
        alive.role = dbUser.role;
        alive.storeId = dbUser.storeId;
        alive.locale = dbUser.locale;
        alive.idleMinutes = dbUser.store?.sessionIdleMinutes ?? DEFAULT_IDLE_MINUTES;
        alive.checkedAt = Date.now();
      }
      return alive;
    },
  },
});
