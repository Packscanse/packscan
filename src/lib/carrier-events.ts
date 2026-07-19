import type { CarrierEventOutbox, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CARRIER_PROVIDERS, type PickupProof } from "@/lib/carriers";

/**
 * At-least-once delivery for carrier lifecycle events. Enqueue happens in
 * the same transaction as the scan event (so an event can never be lost
 * between "scan recorded" and "carrier told"); dispatch runs immediately
 * after the scan and again from cron (`npm run dispatch:events`) with
 * exponential backoff until SENT, NOT_CONFIGURED, or dead-lettered FAILED.
 */

const MAX_ATTEMPTS = 20;
const BASE_BACKOFF_MS = 60_000; // 1 min, doubling, capped at 6 h
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

export type EnqueueArgs = {
  packageId: string;
  carrier: string;
  eventType: "ARRIVAL" | "PICKED_UP" | "ACCEPTED_OUTBOUND" | "RETURNED";
  proof?: PickupProof;
};

/**
 * Queue an event inside the caller's transaction. UNKNOWN carrier has no
 * provider to deliver to — nothing is enqueued and the caller falls back
 * (e.g. direct customer notification for arrivals).
 */
export async function enqueueCarrierEvent(
  tx: Prisma.TransactionClient,
  args: EnqueueArgs
): Promise<boolean> {
  if (!CARRIER_PROVIDERS.some((p) => p.code === args.carrier)) return false;
  await tx.carrierEventOutbox.create({
    data: {
      packageId: args.packageId,
      carrier: args.carrier as never,
      eventType: args.eventType,
      payload: args.proof ? (args.proof as unknown as Prisma.InputJsonValue) : undefined,
    },
  });
  return true;
}

async function deliver(event: CarrierEventOutbox): Promise<"SENT" | "NOT_CONFIGURED"> {
  const provider = CARRIER_PROVIDERS.find((p) => p.code === event.carrier);
  if (!provider) return "NOT_CONFIGURED";
  const pkg = await prisma.package.findUniqueOrThrow({
    where: { id: event.packageId },
    select: { trackingNumber: true },
  });
  const report =
    event.eventType === "ARRIVAL"
      ? await provider.reportArrival(pkg.trackingNumber)
      : event.eventType === "PICKED_UP"
        ? await provider.reportPickedUp(
            pkg.trackingNumber,
            event.payload as unknown as PickupProof
          )
        : event.eventType === "ACCEPTED_OUTBOUND"
          ? await provider.reportAcceptedOutbound(pkg.trackingNumber)
          : await provider.reportReturned(pkg.trackingNumber);
  return report.status === "REPORTED" ? "SENT" : "NOT_CONFIGURED";
}

/** One delivery attempt for a single event; updates the row accordingly. */
async function attempt(event: CarrierEventOutbox): Promise<CarrierEventOutbox> {
  try {
    const outcome = await deliver(event);
    return prisma.carrierEventOutbox.update({
      where: { id: event.id },
      data: {
        status: outcome,
        attempts: event.attempts + 1,
        lastError: null,
        ...(outcome === "SENT" && { sentAt: new Date() }),
      },
    });
  } catch (e) {
    const attempts = event.attempts + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** event.attempts, MAX_BACKOFF_MS);
    const lastError = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
    const updated = await prisma.carrierEventOutbox.update({
      where: { id: event.id },
      data: {
        status: dead ? "FAILED" : "PENDING",
        attempts,
        lastError,
        nextAttemptAt: new Date(Date.now() + backoff),
      },
    });
    if (dead) await raiseDeadLetterAlert(updated, lastError);
    return updated;
  }
}

/**
 * There is no attempt 21: once MAX_ATTEMPTS is exhausted the event
 * dead-letters to FAILED, and this alert makes that silence visible on the
 * admin overview. Recovery is requeueOutboxAction once the cause is fixed;
 * a re-exhausted event correctly raises a fresh alert.
 */
async function raiseDeadLetterAlert(event: CarrierEventOutbox, lastError: string): Promise<void> {
  try {
    const pkg = await prisma.package.findUnique({
      where: { id: event.packageId },
      select: { storeId: true, trackingNumber: true },
    });
    if (!pkg) return;
    await prisma.adminAlert.create({
      data: {
        type: "CARRIER_EVENT_FAILED",
        storeId: pkg.storeId,
        packageId: event.packageId,
        message: `${event.eventType} for ${pkg.trackingNumber} (${event.carrier}) was not delivered after ${event.attempts} attempts. Last error: ${lastError}`,
      },
    });
  } catch (alertError) {
    // The outbox row is already FAILED; a lost alert must not crash dispatch.
    console.error("[carrier-events] could not raise dead-letter alert", alertError);
  }
}

/** Immediate post-scan attempt for one package's freshest pending event. */
export async function dispatchEventsForPackage(packageId: string): Promise<CarrierEventOutbox[]> {
  const events = await prisma.carrierEventOutbox.findMany({
    where: { packageId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  const results = [];
  for (const event of events) results.push(await attempt(event));
  return results;
}

/**
 * Put dead-lettered (FAILED) or awaiting-credentials (NOT_CONFIGURED)
 * events back in the queue — e.g. after a carrier's API credentials land.
 */
export async function requeueEvents(args: {
  status: "FAILED" | "NOT_CONFIGURED";
  carrier?: string;
}): Promise<number> {
  const result = await prisma.carrierEventOutbox.updateMany({
    where: {
      status: args.status,
      ...(args.carrier && { carrier: args.carrier as never }),
    },
    data: { status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: new Date() },
  });
  return result.count;
}

/** Cron entry point: retry everything due. Returns per-status counts. */
export async function dispatchPendingCarrierEvents(limit = 200): Promise<Record<string, number>> {
  const due = await prisma.carrierEventOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
  const counts: Record<string, number> = {};
  for (const event of due) {
    const updated = await attempt(event);
    counts[updated.status] = (counts[updated.status] ?? 0) + 1;
  }
  return counts;
}
