"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";
import { advanceStatus, cancelPackage } from "@/lib/packages";
import { CancelReasonSchema, HandoverInputSchema } from "@/lib/validation/scan";

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

export type PackageActionResult = { ok: true } | { ok: false; error: string };

/** Non-pickup advance (e.g. handoff completion) — no verification involved. */
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

/** Pickup completion from the detail page: verification is mandatory. */
export async function completePickupAction(
  packageId: string,
  verification: unknown
): Promise<PackageActionResult> {
  const { session, pkg } = await loadScopedPackage(packageId);
  if (!pkg) return { ok: false, error: "Package not found." };
  const parsed = HandoverInputSchema.safeParse(verification);
  if (!parsed.success) return { ok: false, error: "Invalid verification input." };

  const outcome = await advanceStatus({
    pkg,
    storeId: pkg.storeId,
    userId: session.user.id,
    inputMethod: "STATUS_ACTION",
    verification: parsed.data,
  });
  if (!outcome.ok) return { ok: false, error: outcome.error };

  revalidatePath("/packages");
  revalidatePath(`/packages/${packageId}`);
  return { ok: true };
}

export async function cancelPackageAction(
  packageId: string,
  formData: FormData
): Promise<void> {
  const { session, pkg } = await loadScopedPackage(packageId);
  if (!pkg) return;
  const reason = CancelReasonSchema.safeParse(formData.get("reason"));
  if (!reason.success) return; // reason input is required client-side too
  await cancelPackage({
    pkg,
    storeId: pkg.storeId,
    userId: session.user.id,
    reason: reason.data,
  });
  revalidatePath("/packages");
  revalidatePath(`/packages/${packageId}`);
}
