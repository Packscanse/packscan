import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";

export async function getRequiredSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

/**
 * Auth check close to the data: admin pages call this themselves rather
 * than relying only on the layout guard. Administration demands a
 * password-established session — a counter PIN never unlocks it, even for
 * an admin account.
 */
export async function getRequiredAdminSession(): Promise<Session> {
  const session = await getRequiredSession();
  if (session.user.role !== "ADMIN" || session.user.authMethod !== "PASSWORD") notFound();
  return session;
}

/**
 * ADMIN (all stores) or MANAGER (their own store only), password session
 * required. Pages using this must scope their queries with managedStoreId.
 */
export async function getRequiredManagerSession(): Promise<Session> {
  const session = await getRequiredSession();
  if (
    (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") ||
    session.user.authMethod !== "PASSWORD"
  ) {
    notFound();
  }
  return session;
}

/** Store filter for management queries: undefined = all stores (ADMIN). */
export function managedStoreId(session: Session): string | undefined {
  return session.user.role === "ADMIN" ? undefined : session.user.storeId;
}

export function assertRole(session: Session, ...roles: Role[]): void {
  if (!roles.includes(session.user.role)) {
    throw new Error("Forbidden: insufficient role");
  }
}
