import type { PackageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerScan, type HandoverContext } from "@/lib/packages";
import { getPickupPolicy, normalizeTrackingNumber } from "@/lib/carriers";
import type { ScanInput } from "@/lib/validation/scan";

/** The signed-in actor as both the web session and an API token resolve it. */
export type ScanActor = {
  id: string;
  storeId: string;
  role: "ADMIN" | "MANAGER" | "CLERK";
  authMethod: "PASSWORD" | "PIN";
};

// Serializable result for clients (no Date objects / full models).
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

/**
 * One scan pipeline for every client — the web Scan screen (server action)
 * and POST /api/v1/scans. The actor always comes from the verified
 * session/token, never from input.
 */
export async function executeScan(actor: ScanActor, input: ScanInput): Promise<ProcessScanResult> {
  // Admins are store-attached like everyone else; scanning only operates on
  // their own store. Catch the cross-store case (parcel known at another
  // store, not at this one) instead of silently creating a duplicate here.
  if (actor.role === "ADMIN" && !input.verification) {
    const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
    const [foreign, local] = await Promise.all([
      prisma.package.findFirst({
        where: { trackingNumber, storeId: { not: actor.storeId } },
        select: { store: { select: { name: true, code: true } } },
      }),
      prisma.package.findFirst({
        where: { trackingNumber, storeId: actor.storeId },
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

  // Replayed from an offline queue: annotate the audit event with when it
  // was captured, and flag it when a different account ends up syncing it.
  const offlineNote = input.offline
    ? `Offline scan captured ${new Date(input.offline.queuedAt).toISOString()}` +
      (input.offline.queuedByUserId !== actor.id
        ? " while a different user was signed in; attributed to the syncing account"
        : "")
    : undefined;

  // A PIN session acts as CLERK regardless of account role, so a manager
  // override always requires a password sign-in.
  const outcome = await registerScan({
    ...input,
    storeId: actor.storeId,
    userId: actor.id,
    actorRole: actor.authMethod === "PASSWORD" ? actor.role : "CLERK",
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

export type PreAdviceMatch = {
  carrier: import("@prisma/client").Carrier;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
};

/**
 * Pre-advice match for a just-scanned tracking number: exact carrier
 * attribution and pre-filled recipient details, no typing at intake.
 */
export async function findPreAdviceMatch(
  storeId: string,
  rawTrackingNumber: string
): Promise<PreAdviceMatch | null> {
  const trackingNumber = normalizeTrackingNumber(rawTrackingNumber);
  if (trackingNumber.length < 6) return null;

  const advice = await prisma.preAdvice.findUnique({
    where: { storeId_trackingNumber: { storeId, trackingNumber } },
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

/**
 * A parcel already on the shelf for this tracking number. The pickup flow
 * uses this to jump straight to handover verification — the clerk should
 * never see a registration form for a parcel the system already knows.
 */
export async function findAwaitingHandover(
  storeId: string,
  rawTrackingNumber: string
): Promise<HandoverContext | null> {
  const trackingNumber = normalizeTrackingNumber(rawTrackingNumber);
  if (trackingNumber.length < 6) return null;

  const pkg = await prisma.package.findUnique({
    where: {
      storeId_trackingNumber_direction: { storeId, trackingNumber, direction: "INBOUND" },
    },
    select: {
      id: true,
      status: true,
      trackingNumber: true,
      carrier: true,
      customerName: true,
      shelfLocation: true,
    },
  });
  if (!pkg || pkg.status !== "AWAITING_PICKUP") return null;
  return {
    packageId: pkg.id,
    trackingNumber: pkg.trackingNumber,
    carrier: pkg.carrier,
    customerName: pkg.customerName,
    shelfLocation: pkg.shelfLocation,
    policy: getPickupPolicy(pkg.carrier),
  };
}

/** Both lookups a just-captured code needs, in one round-trip. */
export type ScanLookup = {
  match: PreAdviceMatch | null;
  handover: HandoverContext | null;
};

export async function lookupScanContext(
  storeId: string,
  rawTrackingNumber: string
): Promise<ScanLookup> {
  const [match, handover] = await Promise.all([
    findPreAdviceMatch(storeId, rawTrackingNumber),
    findAwaitingHandover(storeId, rawTrackingNumber),
  ]);
  return { match, handover };
}
