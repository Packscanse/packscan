import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";

export async function getRequiredSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

/** Auth check close to the data: admin pages call this themselves rather than relying only on the layout guard. */
export async function getRequiredAdminSession(): Promise<Session> {
  const session = await getRequiredSession();
  if (session.user.role !== "ADMIN") notFound();
  return session;
}

export function assertRole(session: Session, ...roles: Role[]): void {
  if (!roles.includes(session.user.role)) {
    throw new Error("Forbidden: insufficient role");
  }
}
