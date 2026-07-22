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
      // Intake done-screen extras (Shelf First): where it went, who gets the
      // SMS, and how far through today's announced delivery the store is.
      shelfLocation?: string | null;
      customerName?: string | null;
      notified?: boolean;
      delivery?: { received: number; announced: number };
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

  // The intake done screen brags about delivery progress: pre-advised
  // parcels received today vs. everything announced for today.
  let delivery: { received: number; announced: number } | undefined;
  if (outcome.kind === "created" && outcome.package.direction === "INBOUND") {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [received, stillAnnounced] = await Promise.all([
      prisma.preAdvice.count({
        where: { storeId: actor.storeId, receivedAt: { gte: dayStart } },
      }),
      prisma.preAdvice.count({
        where: { storeId: actor.storeId, status: "ANNOUNCED" },
      }),
    ]);
    if (received + stillAnnounced > 0) {
      delivery = { received, announced: received + stillAnnounced };
    }
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
    shelfLocation: outcome.package.shelfLocation,
    customerName: outcome.package.customerName,
    notified:
      outcome.package.status === "AWAITING_PICKUP" &&
      Boolean(outcome.package.customerPhone || outcome.package.customerEmail),
    delivery,
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

type AwaitingParcel = {
  id: string;
  trackingNumber: string;
  carrier: import("@prisma/client").Carrier;
  customerName: string | null;
  customerPhone: string | null;
  shelfLocation: string | null;
  createdAt: Date;
};

const AWAITING_SELECT = {
  id: true,
  status: true,
  trackingNumber: true,
  carrier: true,
  customerName: true,
  customerPhone: true,
  shelfLocation: true,
  createdAt: true,
} as const;

function toHandoverContext(pkg: AwaitingParcel): HandoverContext {
  return {
    packageId: pkg.id,
    trackingNumber: pkg.trackingNumber,
    carrier: pkg.carrier,
    customerName: pkg.customerName,
    shelfLocation: pkg.shelfLocation,
    arrivedAt: pkg.createdAt,
    policy: getPickupPolicy(pkg.carrier),
  };
}

async function awaitingByTracking(
  storeId: string,
  rawTrackingNumber: string
): Promise<AwaitingParcel | null> {
  const trackingNumber = normalizeTrackingNumber(rawTrackingNumber);
  if (trackingNumber.length < 6) return null;

  const pkg = await prisma.package.findUnique({
    where: {
      storeId_trackingNumber_direction: { storeId, trackingNumber, direction: "INBOUND" },
    },
    select: AWAITING_SELECT,
  });
  return pkg && pkg.status === "AWAITING_PICKUP" ? pkg : null;
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
  const pkg = await awaitingByTracking(storeId, rawTrackingNumber);
  return pkg ? toHandoverContext(pkg) : null;
}

/**
 * Other parcels waiting for the same customer — the visit checklist that
 * saves the clerk a second (and third) walk to the shelves. The phone
 * number is the strong key; an exact name is the fallback. Parcels with
 * neither are never grouped, so anonymous walk-ins cannot cross-match.
 */
export async function findVisitCompanions(
  storeId: string,
  primary: Pick<AwaitingParcel, "id" | "customerName" | "customerPhone">
): Promise<HandoverContext[]> {
  const matchers: object[] = [];
  if (primary.customerPhone) matchers.push({ customerPhone: primary.customerPhone });
  if (primary.customerName) {
    matchers.push({ customerName: { equals: primary.customerName, mode: "insensitive" } });
  }
  if (matchers.length === 0) return [];

  const rows = await prisma.package.findMany({
    where: {
      storeId,
      direction: "INBOUND",
      status: "AWAITING_PICKUP",
      id: { not: primary.id },
      OR: matchers,
    },
    select: AWAITING_SELECT,
    orderBy: { createdAt: "asc" },
    take: 8,
  });
  return rows.map(toHandoverContext);
}

/**
 * Where to put a just-scanned parcel. The store's shelf vocabulary is what
 * clerks actually typed in the last weeks (there is no shelf entity —
 * `shelfLocation` is free text), ranked by current load; the customer's own
 * shelf wins outright so one walk covers the whole visit.
 */
export type ShelfSuggestion = {
  suggested: string | null;
  /** Why the top pick: the customer already has a parcel there, or space. */
  reason: "customer" | "space" | null;
  /** Tap-tiles for the intake screen; the suggestion comes first. */
  alternatives: string[];
};

const SHELF_VOCAB_DAYS = 30;
const SHELF_ALTERNATIVES = 4;

export async function suggestShelf(
  storeId: string,
  customer: { name?: string | null; phone?: string | null }
): Promise<ShelfSuggestion> {
  const since = new Date(Date.now() - SHELF_VOCAB_DAYS * 24 * 3_600_000);
  const matchers: object[] = [];
  if (customer.phone) matchers.push({ customerPhone: customer.phone });
  if (customer.name) {
    matchers.push({ customerName: { equals: customer.name, mode: "insensitive" } });
  }

  const [vocab, occupied, existing] = await Promise.all([
    prisma.package.groupBy({
      by: ["shelfLocation"],
      where: { storeId, shelfLocation: { not: null }, createdAt: { gte: since } },
    }),
    prisma.package.groupBy({
      by: ["shelfLocation"],
      where: { storeId, status: "AWAITING_PICKUP", shelfLocation: { not: null } },
      _count: { _all: true },
    }),
    matchers.length > 0
      ? prisma.package.findFirst({
          where: {
            storeId,
            direction: "INBOUND",
            status: "AWAITING_PICKUP",
            shelfLocation: { not: null },
            OR: matchers,
          },
          select: { shelfLocation: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  const load = new Map<string, number>();
  for (const row of occupied) {
    if (row.shelfLocation) load.set(row.shelfLocation, row._count._all);
  }
  const known = new Set<string>(load.keys());
  for (const row of vocab) {
    if (row.shelfLocation) known.add(row.shelfLocation);
  }
  const ranked = [...known].sort(
    (a, b) =>
      (load.get(a) ?? 0) - (load.get(b) ?? 0) ||
      a.localeCompare(b, undefined, { numeric: true })
  );

  const customerShelf = existing?.shelfLocation ?? null;
  const suggested = customerShelf ?? ranked[0] ?? null;
  const alternatives = suggested
    ? [suggested, ...ranked.filter((shelf) => shelf !== suggested)].slice(0, SHELF_ALTERNATIVES)
    : ranked.slice(0, SHELF_ALTERNATIVES);
  return {
    suggested,
    reason: customerShelf ? "customer" : suggested ? "space" : null,
    alternatives,
  };
}

/** Both lookups a just-captured code needs, in one round-trip. */
export type ScanLookup = {
  match: PreAdviceMatch | null;
  handover: HandoverContext | null;
  /** The same customer's other shelf parcels, offered as a visit checklist. */
  companions: HandoverContext[];
  /** Where to put it, for the intake flows. */
  shelf: ShelfSuggestion;
};

export async function lookupScanContext(
  storeId: string,
  rawTrackingNumber: string
): Promise<ScanLookup> {
  const [match, primary] = await Promise.all([
    findPreAdviceMatch(storeId, rawTrackingNumber),
    awaitingByTracking(storeId, rawTrackingNumber),
  ]);
  const [companions, shelf] = await Promise.all([
    primary ? findVisitCompanions(storeId, primary) : Promise.resolve([]),
    suggestShelf(storeId, {
      name: match?.customerName,
      phone: match?.customerPhone,
    }),
  ]);
  return {
    match,
    handover: primary ? toHandoverContext(primary) : null,
    companions,
    shelf,
  };
}
