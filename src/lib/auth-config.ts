import type { NextAuthConfig } from "next-auth";

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
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = token.role;
      session.user.storeId = token.storeId;
      return session;
    },
  },
} satisfies NextAuthConfig;
