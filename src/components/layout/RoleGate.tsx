import type { Role } from "@prisma/client";
import { auth } from "@/auth";

/** Renders children only for the given role. auth() is request-memoized. */
export async function RoleGate({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user.role !== role) return null;
  return <>{children}</>;
}
