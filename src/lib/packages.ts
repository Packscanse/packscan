import type {
  Carrier,
  Package,
  PackageStatus,
  ScanInputMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notificationProvider } from "@/lib/notifications";
import {
  FLOW_DIRECTION,
  INITIAL_STATUS,
  NEXT_STATUS,
  STATUS_LABELS,
  canCancel,
  type ScanFlow,
} from "@/lib/status";
import { normalizeTrackingNumber } from "@/lib/carriers";

export type ScanOutcome =
  | { ok: true; kind: "created"; package: Package }
  | { ok: true; kind: "transitioned"; package: Package; fromStatus: PackageStatus }
  | { ok: false; code: "TERMINAL_STATUS" | "INVALID_ACTION" | "NOT_FOUND"; error: string };

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
    const pkg = await prisma.$transaction(async (tx) => {
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
      return created;
    });
    if (status === "AWAITING_PICKUP") await notifyCustomer(pkg, "AWAITING_PICKUP");
    return { ok: true, kind: "created", package: pkg };
  }

  return advanceStatus({
    pkg: existing,
    storeId: args.storeId,
    userId: args.userId,
    inputMethod: args.inputMethod,
  });
}

/** Advance an existing package along its flow (rescan or button action). */
export async function advanceStatus(args: {
  pkg: Package;
  storeId: string;
  userId: string;
  inputMethod: ScanInputMethod;
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
  const updated = await transition(args, next);
  if (next === "PICKED_UP") await notifyCustomer(updated, "PICKED_UP");
  return { ok: true, kind: "transitioned", package: updated, fromStatus: pkg.status };
}

/** Void a mistaken scan; allowed from any non-terminal status. */
export async function cancelPackage(args: {
  pkg: Package;
  storeId: string;
  userId: string;
}): Promise<ScanOutcome> {
  const { pkg } = args;
  if (!canCancel(pkg.status)) {
    return {
      ok: false,
      code: "INVALID_ACTION",
      error: `Cannot cancel a package that is "${STATUS_LABELS[pkg.status]}".`,
    };
  }
  const updated = await transition({ ...args, inputMethod: "STATUS_ACTION" }, "CANCELLED");
  return { ok: true, kind: "transitioned", package: updated, fromStatus: pkg.status };
}

async function transition(
  args: { pkg: Package; storeId: string; userId: string; inputMethod: ScanInputMethod },
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
      },
    });
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
      ? `Your ${pkg.carrier} package (${pkg.trackingNumber}) is ready for pickup at ${store?.name ?? "your pickup point"}.`
      : `Your ${pkg.carrier} package (${pkg.trackingNumber}) has been picked up. Thank you!`;
  await notificationProvider.send({
    packageId: pkg.id,
    trigger,
    channel,
    recipient: (channel === "SMS" ? pkg.customerPhone : pkg.customerEmail)!,
    message,
  });
}
