import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";
// Required so the declare block below augments the subpath module instead of
// being an unresolved ambient declaration.
import "next-auth/jwt";

/** How the session was established. PIN sessions never reach administration. */
export type AuthMethod = "PASSWORD" | "PIN";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      storeId: string;
      authMethod: AuthMethod;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    storeId: string;
    /** Store's inactivity timeout, carried into the JWT at sign-in. */
    idleMinutes: number;
    authMethod: AuthMethod;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    storeId: string;
    authMethod?: AuthMethod;
    /** Last time the account was re-verified against the DB (ms epoch). */
    checkedAt?: number;
    /** Store-configured inactivity timeout in minutes (1-10). */
    idleMinutes?: number;
    /** Last request timestamp; rolls forward on activity (ms epoch). */
    lastActivity?: number;
  }
}
