"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { registerScan, type HandoverContext } from "@/lib/packages";
import { normalizeTrackingNumber } from "@/lib/carriers";
import { ScanInputSchema } from "@/lib/validation/scan";
import type { Carrier, PackageStatus } from "@prisma/client";

// Serializable result for the client component (no Date objects / full models).
export type ProcessScanResult =
  | {
      ok: true;
      kind: "created" | "transitioned";
      packageId: string;
      trackingNumber: string;
      carrier: string;
      status: PackageStatus;
      fromStatus?: PackageStatus;
      direction: "INBOUND" | "OUTBOUND";
    }
  // Pickup completion needs the handover step: resubmit with `verification`.
  | { ok: false; code: "VERIFICATION_REQUIRED"; error: string; handover: HandoverContext }
  | { ok: false; code?: undefined; error: string };

export async function processScan(input: unknown): Promise<ProcessScanResult> {
  const session = await getRequiredSession();
  const parsed = ScanInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid scan input. Check the tracking number and try again." };
  }

  // Admins are store-attached like everyone else; scanning only operates on
  // their own store. Catch the cross-store case (parcel known at another
  // store, not at this one) instead of silently creating a duplicate here.
  if (session.user.role === "ADMIN" && !parsed.data.verification) {
    const trackingNumber = normalizeTrackingNumber(parsed.data.trackingNumber);
    const [foreign, local] = await Promise.all([
      prisma.package.findFirst({
        where: { trackingNumber, storeId: { not: session.user.storeId } },
        select: { store: { select: { name: true, code: true } } },
      }),
      prisma.package.findFirst({
        where: { trackingNumber, storeId: session.user.storeId },
        select: { id: true },
      }),
    ]);
    if (foreign && !local) {
      return {
        ok: false,
        error: `This parcel is registered at ${foreign.store.name} (${foreign.store.code}) — manage it from its package page, not by scanning here.`,
      };
    }
  }

  // Replayed from the offline queue: annotate the audit event with when it
  // was captured, and flag it when a different account ends up syncing it.
  const offlineNote = parsed.data.offline
    ? `Offline scan captured ${new Date(parsed.data.offline.queuedAt).toISOString()}` +
      (parsed.data.offline.queuedByUserId !== session.user.id
        ? " while a different user was signed in; attributed to the syncing account"
        : "")
    : undefined;

  // storeId/userId/role always come from the session — never from the client.
  const outcome = await registerScan({
    ...parsed.data,
    storeId: session.user.storeId,
    userId: session.user.id,
    actorRole: session.user.role,
    note: offlineNote,
  });

  if (!outcome.ok) {
    if (outcome.code === "VERIFICATION_REQUIRED") {
      return {
        ok: false,
        code: "VERIFICATION_REQUIRED",
        error: outcome.error,
        handover: outcome.handover,
      };
    }
    return { ok: false, error: outcome.error };
  }

  revalidatePath("/packages");
  return {
    ok: true,
    kind: outcome.kind,
    packageId: outcome.package.id,
    trackingNumber: outcome.package.trackingNumber,
    carrier: outcome.package.carrier,
    status: outcome.package.status,
    fromStatus: outcome.kind === "transitioned" ? outcome.fromStatus : undefined,
    direction: outcome.package.direction,
  };
}

export interface PreAdviceMatch {
  carrier: Carrier;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}

/**
 * Pre-advice match for a just-scanned tracking number: exact carrier
 * attribution and pre-filled recipient details, no typing at intake.
 */
export async function lookupPreAdvice(rawTrackingNumber: string): Promise<PreAdviceMatch | null> {
  const session = await getRequiredSession();
  const trackingNumber = normalizeTrackingNumber(rawTrackingNumber);
  if (trackingNumber.length < 6) return null;

  const advice = await prisma.preAdvice.findUnique({
    where: { storeId_trackingNumber: { storeId: session.user.storeId, trackingNumber } },
    select: {
      status: true,
      carrier: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
    },
  });
  if (!advice || advice.status !== "ANNOUNCED") return null;
  return {
    carrier: advice.carrier,
    customerName: advice.customerName,
    customerPhone: advice.customerPhone,
    customerEmail: advice.customerEmail,
  };
}
