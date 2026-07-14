import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth-config";

// Edge runtime: uses only the edge-safe config (no Prisma/bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // api/carriers authenticates with its own webhook secret, not a session.
    "/((?!api/auth|api/carriers|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
