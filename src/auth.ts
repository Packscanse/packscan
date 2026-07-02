import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth-config";
import { LoginSchema } from "@/lib/validation/auth";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/rate-limit";

// How stale a JWT's user snapshot may get before we re-check the DB.
// Bounds how long a deactivated account (or outdated role) stays usable.
const SESSION_RECHECK_MS = 5 * 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = LoginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();

        if (isRateLimited(email)) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          recordFailure(email);
          return null;
        }
        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          recordFailure(email);
          return null;
        }
        clearFailures(email);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Node-runtime override of the edge-safe jwt callback: periodically
    // re-checks the account so deactivation revokes access within
    // SESSION_RECHECK_MS and role/store changes propagate without re-login.
    // Middleware keeps using the DB-free base callback — it only gates
    // "has a session", never role — so the edge split stays intact.
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.storeId = user.storeId;
        token.checkedAt = Date.now();
        return token;
      }
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      if (token.sub && Date.now() - checkedAt > SESSION_RECHECK_MS) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { active: true, role: true, storeId: true },
        });
        if (!dbUser?.active) return null; // invalidates the session
        token.role = dbUser.role;
        token.storeId = dbUser.storeId;
        token.checkedAt = Date.now();
      }
      return token;
    },
  },
});
