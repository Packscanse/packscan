import { Prisma } from "@prisma/client";
import type {
  Carrier,
  Package,
  PackageStatus,
  Role,
  ScanInputMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notificationProvider } from "@/lib/notifications";
import {
  dispatchEventsForPackage,
  enqueueCarrierEvent,
  type EnqueueArgs,
} from "@/lib/carrier-events";
import {
  FLOW_DIRECTION,
  INITIAL_STATUS,
  NEXT_STATUS,
  STATUS_LABELS,
  canCancel,
  type ScanFlow,
} from "@/lib/status";
import { getPickupPolicy, normalizeTrackingNumber } from "@/lib/carriers";
import { checkHandover, type HandoverInput, type HandoverRecord } from "@/lib/verification";

/** What the UI needs to render the handover-verification step. */
export interface HandoverContext {
  packageId: string;
  trackingNumber: string;
  carrier: Carrier;
  customerName: string | null;
  shelfLocation: string | null;
}

export type ScanOutcome =
  | { ok: true; kind: "created"; package: Package }
  | { ok: true; kind: "transitioned"; package: Package; fromStatus: PackageStatus }
  | { ok: false; code: "VERIFICATION_REQUIRED"; error: string; handover: HandoverContext }
  | {
      ok: false;
      code: "TERMINAL_STATUS" | "INVALID_ACTION" | "NOT_FOUND" | "VERIFICATION_FAILED";
      error: string;
    };

export interface RegisterScanArgs {
  storeId: string;
  userId: string;
  trackingNumber: string;
  carrier: Carrier;
  carrierManual: boolean;
  flow: ScanFlow;
  inputMethod: ScanInputMethod;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  shelfLocation?: string;
  /** Handover proof; consulted only when the scan completes a pickup. */
  verification?: HandoverInput;
  /** Role of the acting user — a manager override demands ADMIN. */
  actorRole?: Role;
}

/** SENT means the carrier itself will notify; anything else needs our fallback. */
async function dispatchAndCheck(packageId: string, eventType: EnqueueArgs["eventType"]) {
  const results = await dispatchEventsForPackage(packageId);
  return results.some((r) => r.eventType === eventType && r.status === "SENT");
}

export function findPackageForScan(args: {
  storeId: string;
  trackingNumber: string;
  direction: "INBOUND" | "OUTBOUND";
}) {
  return prisma.package.findUnique({
    where: {
      storeId_trackingNumber_direction: {
        storeId: args.storeId,
        trackingNumber: args.trackingNumber,
        direction: args.direction,
      },
    },
  });
}

/**
 * The single entry point for a scan (camera, hardware, or manual entry).
 * First scan of a tracking number creates the Package in the flow's initial
 * status; a rescan advances the existing package instead of duplicating it.
 */
export async function registerScan(args: RegisterScanArgs): Promise<ScanOutcome> {
  const trackingNumber = normalizeTrackingNumber(args.trackingNumber);
  const direction = FLOW_DIRECTION[args.flow];
  const existing = await findPackageForScan({
    storeId: args.storeId,
    trackingNumber,
    direction,
  });

  if (!existing) {
    const status = INITIAL_STATUS[args.flow];
    let pkg: Package;
    try {
      pkg = await prisma.$transaction(async (tx) => {
        const created = await tx.package.create({
          data: {
            trackingNumber,
            carrier: args.carrier,
            carrierManual: args.carrierManual,
            direction,
            status,
            storeId: args.storeId,
            customerName: args.customerName,
            customerPhone: args.customerPhone,
            customerEmail: args.customerEmail,
            notes: args.notes,
            shelfLocation: args.shelfLocation,
          },
        });
        await tx.scanEvent.create({
          data: {
            packageId: created.id,
            storeId: args.storeId,
            userId: args.userId,
            fromStatus: null,
            toStatus: status,
            inputMethod: args.inputMethod,
          },
        });
        // Announced parcel arrived: close the pre-advice and link it.
        if (direction === "INBOUND") {
          await tx.preAdvice.updateMany({
            where: { storeId: args.storeId, trackingNumber, status: "ANNOUNCED" },
            data: { status: "RECEIVED", receivedAt: new Date(), packageId: created.id },
          });
        }
        // Same transaction as the scan event: the carrier event can never
        // be lost between "scan recorded" and "carrier told".
        if (status === "AWAITING_PICKUP") {
          await enqueueCarrierEvent(tx, {
            packageId: created.id,
            carrier: created.carrier,
            eventType: "ARRIVAL",
          });
        }
        if (direction === "OUTBOUND") {
          await enqueueCarrierEvent(tx, {
            packageId: created.id,
            carrier: created.carrier,
            eventType: "ACCEPTED_OUTBOUND",
          });
        }
        return created;
      });
    } catch (e) {
      // Two devices scanning the same new label at once: the loser of the
      // create race retries as a rescan of the winner's package.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const raced = await findPackageForScan({ storeId: args.storeId, trackingNumber, direction });
        if (raced) {
          return advanceStatus({
            pkg: raced,
            storeId: args.storeId,
            userId: args.userId,
            inputMethod: args.inputMethod,
            verification: args.verification,
            actorRole: args.actorRole,
          });
        }
      }
      throw e;
    }
    if (status === "AWAITING_PICKUP") {
      // Carrier-first: the carrier notifies the recipient in its own app.
      // Only fall back to messaging the customer directly while the
      // carrier API is unconfigured (retries continue in the background).
      const carrierNotifies = await dispatchAndCheck(pkg.id, "ARRIVAL");
      if (!carrierNotifies) await notifyCustomer(pkg, "AWAITING_PICKUP");
    }
    if (direction === "OUTBOUND") {
      await dispatchEventsForPackage(pkg.id);
    }
    return { ok: true, kind: "created", package: pkg };
  }

  return advanceStatus({
    pkg: existing,
    storeId: args.storeId,
    userId: args.userId,
    inputMethod: args.inputMethod,
    verification: args.verification,
    actorRole: args.actorRole,
  });
}

/**
 * Advance an existing package along its flow (rescan or button action).
 * The pickup handover is gated: AWAITING_PICKUP → PICKED_UP requires
 * verification satisfying the carrier's pickup policy, and the proof is
 * persisted with the scan event.
 */
export async function advanceStatus(args: {
  pkg: Package;
  storeId: string;
  userId: string;
  inputMethod: ScanInputMethod;
  verification?: HandoverInput;
  /** Driver/route/manifest reference for carrier collections. */
  courierRef?: string;
  /** Role of the acting user — a manager override demands ADMIN. */
  actorRole?: Role;
}): Promise<ScanOutcome> {
  const { pkg } = args;
  const next = NEXT_STATUS[pkg.status];
  if (!next) {
    return {
      ok: false,
      code: "TERMINAL_STATUS",
      error: `Package is already "${STATUS_LABELS[pkg.status]}" — nothing further to record.`,
    };
  }

  let handoverRecord: HandoverRecord | undefined;
  if (next === "PICKED_UP") {
    if (!args.verification) {
      return {
        ok: false,
        code: "VERIFICATION_REQUIRED",
        error: "Pickup requires handover verification.",
        handover: {
          packageId: pkg.id,
          trackingNumber: pkg.trackingNumber,
          carrier: pkg.carrier,
          customerName: pkg.customerName,
          shelfLocation: pkg.shelfLocation,
        },
      };
    }
    if (args.verification.override && args.actorRole !== "ADMIN") {
      return {
        ok: false,
        code: "VERIFICATION_FAILED",
        error: "Manager override requires an admin account.",
      };
    }
    const checked = checkHandover(getPickupPolicy(pkg.carrier), args.verification, pkg);
    if (!checked.ok) {
      return { ok: false, code: "VERIFICATION_FAILED", error: checked.error };
    }
    handoverRecord = checked.record;
  }

  const enqueue: EnqueueArgs | undefined =
    next === "PICKED_UP"
      ? {
          packageId: pkg.id,
          carrier: pkg.carrier,
          eventType: "PICKED_UP",
          proof: {
            codePresented: handoverRecord!.presentedCode !== null,
            idChecked: handoverRecord!.idChecked,
            collectorName: handoverRecord!.collectorName,
            override: handoverRecord!.override,
          },
        }
      : next === "RETURNED_TO_CARRIER"
        ? { packageId: pkg.id, carrier: pkg.carrier, eventType: "RETURNED" }
        : undefined;

  const updated = await transition(
    {
      ...args,
      verification: handoverRecord,
      courierRef: args.courierRef?.trim() || undefined,
      enqueue,
    },
    next
  );
  if (next === "PICKED_UP") {
    const carrierNotifies = await dispatchAndCheck(updated.id, "PICKED_UP");
    if (!carrierNotifies) await notifyCustomer(updated, "PICKED_UP");
  }
  if (next === "RETURNED_TO_CARRIER") {
    await dispatchEventsForPackage(updated.id);
  }
  return { ok: true, kind: "transitioned", package: updated, fromStatus: pkg.status };
}

/**
 * Pull an overdue (or refused) pickup out of the rescan flow: the parcel
 * waits for the carrier driver, and the next scan records the return.
 */
export async function markForReturn(args: {
  pkg: Package;
  storeId: string;
  userId: string;
  reason?: string;
}): Promise<ScanOutcome> {
  const { pkg } = args;
  if (pkg.status !== "AWAITING_PICKUP") {
    return {
      ok: false,
      code: "INVALID_ACTION",
      error: `Only parcels awaiting pickup can be marked for return (this one is "${STATUS_LABELS[pkg.status]}").`,
    };
  }
  const updated = await transition(
    { ...args, inputMethod: "STATUS_ACTION", note: args.reason?.trim() || undefined },
    "RETURN_PENDING"
  );
  return { ok: true, kind: "transitioned", package: updated, fromStatus: pkg.status };
}

/**
 * Void a mistaken scan; allowed from any non-terminal status. The reason is
 * mandatory and lands on the audit event — a void with no "why" is exactly
 * what shrinkage reviews can't work with.
 */
export async function cancelPackage(args: {
  pkg: Package;
  storeId: string;
  userId: string;
  reason: string;
}): Promise<ScanOutcome> {
  const { pkg } = args;
  if (!canCancel(pkg.status)) {
    return {
      ok: false,
      code: "INVALID_ACTION",
      error: `Cannot cancel a package that is "${STATUS_LABELS[pkg.status]}".`,
    };
  }
  const reason = args.reason.trim();
  if (!reason) {
    return { ok: false, code: "INVALID_ACTION", error: "A cancellation reason is required." };
  }
  const updated = await transition(
    { ...args, inputMethod: "STATUS_ACTION", note: reason },
    "CANCELLED"
  );
  return { ok: true, kind: "transitioned", package: updated, fromStatus: pkg.status };
}

async function transition(
  args: {
    pkg: Package;
    storeId: string;
    userId: string;
    inputMethod: ScanInputMethod;
    note?: string;
    courierRef?: string;
    verification?: HandoverRecord;
    /** Carrier event queued atomically with the scan event. */
    enqueue?: EnqueueArgs;
  },
  toStatus: PackageStatus
): Promise<Package> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.package.update({
      where: { id: args.pkg.id },
      data: { status: toStatus },
    });
    await tx.scanEvent.create({
      data: {
        packageId: args.pkg.id,
        storeId: args.storeId,
        userId: args.userId,
        fromStatus: args.pkg.status,
        toStatus,
        inputMethod: args.inputMethod,
        note: args.note,
        courierRef: args.courierRef,
        ...(args.verification && { verification: { create: args.verification } }),
      },
    });
    if (args.enqueue) await enqueueCarrierEvent(tx, args.enqueue);
    return updated;
  });
}

/**
 * Notify after the transaction commits. No contact info is a valid state
 * (log/handoff flows, or pickup without captured contact) — silently skip.
 */
async function notifyCustomer(pkg: Package, trigger: "AWAITING_PICKUP" | "PICKED_UP") {
  const channel = pkg.customerPhone ? "SMS" : pkg.customerEmail ? "EMAIL" : null;
  if (!channel) return;
  const store = await prisma.store.findUnique({
    where: { id: pkg.storeId },
    select: { name: true },
  });
  const message =
    trigger === "AWAITING_PICKUP"
      ? `Your ${pkg.carrier} package (${pkg.trackingNumber}) is ready for pickup at ${store?.name ?? "your pickup point"}. Please bring your ${pkg.carrier} app pickup code and a photo ID.`
      : `Your ${pkg.carrier} package (${pkg.trackingNumber}) has been picked up. Thank you!`;
  await notificationProvider.send({
    packageId: pkg.id,
    trigger,
    channel,
    recipient: (channel === "SMS" ? pkg.customerPhone : pkg.customerEmail)!,
    message,
  });
}
