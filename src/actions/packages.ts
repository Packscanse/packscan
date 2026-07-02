"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";
import { advanceStatus, cancelPackage } from "@/lib/packages";

// Loads the package and enforces store scoping: clerks only touch their own
// store's packages; admins may act on any (e.g. from the admin overview).
async function loadScopedPackage(packageId: string) {
  const session = await getRequiredSession();
  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg || (session.user.role !== "ADMIN" && pkg.storeId !== session.user.storeId)) {
    return { session, pkg: null };
  }
  return { session, pkg };
}

export async function advancePackageAction(packageId: string): Promise<void> {
  const { session, pkg } = await loadScopedPackage(packageId);
  if (!pkg) return;
  await advanceStatus({
    pkg,
    storeId: pkg.storeId, // events stay attached to the package's store
    userId: session.user.id,
    inputMethod: "STATUS_ACTION",
  });
  revalidatePath("/packages");
  revalidatePath(`/packages/${packageId}`);
}

export async function cancelPackageAction(packageId: string): Promise<void> {
  const { session, pkg } = await loadScopedPackage(packageId);
  if (!pkg) return;
  await cancelPackage({ pkg, storeId: pkg.storeId, userId: session.user.id });
  revalidatePath("/packages");
  revalidatePath(`/packages/${packageId}`);
}
