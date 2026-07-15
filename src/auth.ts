import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyIdleTimeout, authConfig, DEFAULT_IDLE_MINUTES } from "@/lib/auth-config";
import { LoginSchema } from "@/lib/validation/auth";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/rate-limit";

// How stale a JWT's user snapshot may get before we re-check the DB.
// Bounds how long a deactivated account (or outdated role/idle-timeout
// setting) stays usable.
const SESSION_RECHECK_MS = 5 * 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, pin: {} },
      async authorize(raw, request) {
        const parsed = LoginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        // Behind a proxy the left-most XFF entry is the client; locally
        // there is none and every request shares the "local" bucket.
        const ip =
          request.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

        if ((await isRateLimited("email", email)) || (await isRateLimited("ip", ip))) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { store: { select: { sessionIdleMinutes: true } } },
        });
        if (!user || !user.active) {
          await Promise.all([recordFailure("email", email), recordFailure("ip", ip)]);
          return null;
        }
        // Counter PIN signs in for scanning; administration always needs
        // the password (enforced via authMethod on the session).
        const valid = parsed.data.pin
          ? user.pinHash !== null && (await bcrypt.compare(parsed.data.pin, user.pinHash))
          : await bcrypt.compare(parsed.data.password!, user.passwordHash);
        if (!valid) {
          await Promise.all([recordFailure("email", email), recordFailure("ip", ip)]);
          return null;
        }
        await clearFailures("email", email);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          idleMinutes: user.store?.sessionIdleMinutes ?? DEFAULT_IDLE_MINUTES,
          authMethod: parsed.data.pin ? ("PIN" as const) : ("PASSWORD" as const),
        };
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
            store: { select: { sessionIdleMinutes: true } },
          },
        });
        if (!dbUser?.active) return null; // invalidates the session
        alive.role = dbUser.role;
        alive.storeId = dbUser.storeId;
        alive.idleMinutes = dbUser.store?.sessionIdleMinutes ?? DEFAULT_IDLE_MINUTES;
        alive.checkedAt = Date.now();
      }
      return alive;
    },
  },
});
