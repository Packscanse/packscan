"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";
import { advanceStatus, cancelPackage, markForReturn } from "@/lib/packages";
import { lookupCarrierStatus, type CarrierStatusResult } from "@/lib/carrier-lookup";
import { CancelReasonSchema, CourierRefSchema, HandoverInputSchema } from "@/lib/validation/scan";

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

/**
 * Non-pickup advance (handoff or return completion) — no verification
 * involved, but the driver/route reference is recorded when given.
 */
export async function advancePackageAction(
  packageId: string,
  formData: FormData
): Promise<void> {
  const { session, pkg } = await loadScopedPackage(packageId);
  if (!pkg) return;
  const courierRef = CourierRefSchema.safeParse(formData.get("courierRef") ?? undefined);
  await advanceStatus({
    pkg,
    storeId: pkg.storeId, // events stay attached to the package's store
    userId: session.user.id,
    inputMethod: "STATUS_ACTION",
    courierRef: courierRef.success ? courierRef.data : undefined,
  });
  revalidatePath("/packages");
  revalidatePath(`/packages/${packageId}`);
}

/** Overdue/refused pickup → RETURN_PENDING, with an optional reason. */
export async function markForReturnAction(
  packageId: string,
  formData: FormData
): Promise<void> {
  const { session, pkg } = await loadScopedPackage(packageId);
  if (!pkg) return;
  const reason = formData.get("reason");
  await markForReturn({
    pkg,
    storeId: pkg.storeId,
    userId: session.user.id,
    reason: typeof reason === "string" ? reason : undefined,
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
    // A PIN session acts as CLERK: overrides need a password sign-in.
    actorRole: session.user.authMethod === "PASSWORD" ? session.user.role : "CLERK",
  });
  if (!outcome.ok) return { ok: false, error: outcome.error };

  revalidatePath("/packages");
  revalidatePath(`/packages/${packageId}`);
  return { ok: true };
}

/**
 * "Where is this parcel?" — for the clerk investigating a parcel a customer
 * says has gone missing. Scoping here, lookup in the shared lib (also used
 * by GET /api/v1/packages/:id/carrier-status). CarrierStatusResult lives in
 * "@/lib/carrier-lookup" ("use server" files may only export async functions).
 */
export async function lookupCarrierStatusAction(
  packageId: string
): Promise<CarrierStatusResult> {
  const { pkg } = await loadScopedPackage(packageId);
  if (!pkg) return { ok: false, code: "LOOKUP_FAILED" };
  return lookupCarrierStatus(pkg);
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
