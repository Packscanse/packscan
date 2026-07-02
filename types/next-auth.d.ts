import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";
// Required so the declare block below augments the subpath module instead of
// being an unresolved ambient declaration.
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      storeId: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    storeId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    storeId: string;
    /** Last time the account was re-verified against the DB (ms epoch). */
    checkedAt?: number;
  }
}
