import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Reporting aggregates computed IN the database. The dashboards previously
 * pulled raw 30-day event rows into JS — fine per store, quadratic pain at
 * chain scale (1000 stores). Every query here returns at most a handful of
 * rows per store regardless of parcel volume.
 */

const scopeSql = (storeId: string | undefined, column: Prisma.Sql) =>
  storeId ? Prisma.sql`AND ${column} = ${storeId}` : Prisma.empty;

export interface PickupStats {
  storeId: string;
  pickedUp: number;
  avgDwellMs: number;
}

/** Per-store pickup count and average arrival→handover dwell since `from`. */
export async function pickupStats(from: Date, storeId?: string): Promise<PickupStats[]> {
  const rows = await prisma.$queryRaw<
    { storeId: string; picked: number; avg_dwell_ms: number | null }[]
  >(Prisma.sql`
    SELECT e."storeId",
           COUNT(*)::int AS picked,
           AVG(EXTRACT(EPOCH FROM (e."scannedAt" - p."createdAt")) * 1000)::float8 AS avg_dwell_ms
    FROM "ScanEvent" e
    JOIN "Package" p ON p.id = e."packageId"
    WHERE e."toStatus" = 'PICKED_UP'
      AND e."scannedAt" >= ${from}
      ${scopeSql(storeId, Prisma.sql`e."storeId"`)}
    GROUP BY e."storeId"
  `);
  return rows.map((r) => ({ storeId: r.storeId, pickedUp: r.picked, avgDwellMs: r.avg_dwell_ms ?? 0 }));
}

export interface HourBucket {
  hour: number;
  received: number;
  pickedUp: number;
}

/**
 * Hour-of-day staffing profile since `from`. Timestamps are stored in UTC;
 * the caller shifts buckets into the display timezone.
 */
export async function hourProfileUtc(from: Date, storeId?: string): Promise<HourBucket[]> {
  const rows = await prisma.$queryRaw<
    { hour: number; received: number; picked: number }[]
  >(Prisma.sql`
    SELECT EXTRACT(HOUR FROM e."scannedAt")::int AS hour,
           COUNT(*) FILTER (WHERE e."fromStatus" IS NULL)::int AS received,
           COUNT(*) FILTER (WHERE e."toStatus" = 'PICKED_UP')::int AS picked
    FROM "ScanEvent" e
    WHERE e."scannedAt" >= ${from}
      AND (e."fromStatus" IS NULL OR e."toStatus" = 'PICKED_UP')
      ${scopeSql(storeId, Prisma.sql`e."storeId"`)}
    GROUP BY 1
  `);
  return rows.map((r) => ({ hour: r.hour, received: r.received, pickedUp: r.picked }));
}

export interface ShelfAging {
  storeId: string;
  waiting: number;
  avgWaitMs: number;
  oldestWaitMs: number;
  overdue: number;
}

/**
 * Live shelf state per store: waiting count, average/oldest wait, and
 * overdue count against each store's OWN pickupDeadlineDays — one query
 * for the whole chain.
 */
export async function shelfAging(storeId?: string): Promise<ShelfAging[]> {
  const rows = await prisma.$queryRaw<
    {
      storeId: string;
      waiting: number;
      avg_wait_s: number | null;
      oldest_wait_s: number | null;
      overdue: number;
    }[]
  >(Prisma.sql`
    SELECT p."storeId",
           COUNT(*)::int AS waiting,
           AVG(EXTRACT(EPOCH FROM (NOW() - p."createdAt")))::float8 AS avg_wait_s,
           MAX(EXTRACT(EPOCH FROM (NOW() - p."createdAt")))::float8 AS oldest_wait_s,
           COUNT(*) FILTER (
             WHERE p."createdAt" < NOW() - (s."pickupDeadlineDays" * INTERVAL '1 day')
           )::int AS overdue
    FROM "Package" p
    JOIN "Store" s ON s.id = p."storeId"
    WHERE p.status = 'AWAITING_PICKUP'
      ${scopeSql(storeId, Prisma.sql`p."storeId"`)}
    GROUP BY p."storeId"
  `);
  return rows.map((r) => ({
    storeId: r.storeId,
    waiting: r.waiting,
    avgWaitMs: (r.avg_wait_s ?? 0) * 1000,
    oldestWaitMs: (r.oldest_wait_s ?? 0) * 1000,
    overdue: r.overdue,
  }));
}

/** RETURN_PENDING parcels older than `cutoff`, per store. */
export async function returnAgingCounts(
  cutoff: Date,
  storeId?: string
): Promise<Map<string, number>> {
  const rows = await prisma.package.groupBy({
    by: ["storeId"],
    where: { status: "RETURN_PENDING", updatedAt: { lt: cutoff }, ...(storeId && { storeId }) },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.storeId, r._count._all]));
}

export interface SettlementRow {
  storeCode: string;
  storeName: string;
  carrier: string;
  received: number;
  pickedUp: number;
  outboundAccepted: number;
  handedOff: number;
  returned: number;
  cancelled: number;
}

/** One row per store × carrier for the month — the remittance reconciliation. */
export async function settlementRows(
  start: Date,
  end: Date,
  storeId?: string
): Promise<SettlementRow[]> {
  const rows = await prisma.$queryRaw<
    {
      store_code: string;
      store_name: string;
      carrier: string;
      received: number;
      picked_up: number;
      outbound_accepted: number;
      handed_off: number;
      returned: number;
      cancelled: number;
    }[]
  >(Prisma.sql`
    SELECT s.code AS store_code,
           s.name AS store_name,
           p.carrier::text AS carrier,
           COUNT(*) FILTER (WHERE e."fromStatus" IS NULL AND p.direction = 'INBOUND')::int  AS received,
           COUNT(*) FILTER (WHERE e."toStatus" = 'PICKED_UP')::int                          AS picked_up,
           COUNT(*) FILTER (WHERE e."fromStatus" IS NULL AND p.direction = 'OUTBOUND')::int AS outbound_accepted,
           COUNT(*) FILTER (WHERE e."toStatus" = 'HANDED_OFF')::int                         AS handed_off,
           COUNT(*) FILTER (WHERE e."toStatus" = 'RETURNED_TO_CARRIER')::int                AS returned,
           COUNT(*) FILTER (WHERE e."fromStatus" IS NOT NULL AND e."toStatus" = 'CANCELLED')::int AS cancelled
    FROM "ScanEvent" e
    JOIN "Package" p ON p.id = e."packageId"
    JOIN "Store" s ON s.id = e."storeId"
    WHERE e."scannedAt" >= ${start} AND e."scannedAt" < ${end}
      ${scopeSql(storeId, Prisma.sql`e."storeId"`)}
    GROUP BY 1, 2, 3
    ORDER BY 1, 3
  `);
  return rows.map((r) => ({
    storeCode: r.store_code,
    storeName: r.store_name,
    carrier: r.carrier,
    received: r.received,
    pickedUp: r.picked_up,
    outboundAccepted: r.outbound_accepted,
    handedOff: r.handed_off,
    returned: r.returned,
    cancelled: r.cancelled,
  }));
}
