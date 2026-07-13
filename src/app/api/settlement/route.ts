import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Settlement export: one CSV row per store × carrier for a month —
 * the owner's basis for reconciling against each carrier's remittance.
 * Admins get every store; managers their own. Password session required.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (
    !session?.user ||
    session.user.authMethod !== "PASSWORD" ||
    (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")
  ) {
    return new Response("Forbidden", { status: 403 });
  }
  const scope = session.user.role === "ADMIN" ? undefined : session.user.storeId;

  const month = new URL(req.url).searchParams.get("month") ?? "";
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return new Response("Use ?month=YYYY-MM", { status: 400 });
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return new Response("Invalid month", { status: 400 });
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);

  const events = await prisma.scanEvent.findMany({
    where: { scannedAt: { gte: start, lt: end }, ...(scope && { storeId: scope }) },
    select: {
      fromStatus: true,
      toStatus: true,
      package: { select: { carrier: true, direction: true } },
      store: { select: { code: true, name: true } },
    },
  });

  type Row = {
    received: number;
    pickedUp: number;
    outboundAccepted: number;
    handedOff: number;
    returned: number;
    cancelled: number;
  };
  const rows = new Map<string, Row & { storeCode: string; storeName: string; carrier: string }>();
  for (const event of events) {
    const key = `${event.store.code}|${event.package.carrier}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        storeCode: event.store.code,
        storeName: event.store.name,
        carrier: event.package.carrier,
        received: 0,
        pickedUp: 0,
        outboundAccepted: 0,
        handedOff: 0,
        returned: 0,
        cancelled: 0,
      };
      rows.set(key, row);
    }
    if (event.fromStatus === null) {
      if (event.package.direction === "INBOUND") row.received++;
      else row.outboundAccepted++;
    } else if (event.toStatus === "PICKED_UP") row.pickedUp++;
    else if (event.toStatus === "HANDED_OFF") row.handedOff++;
    else if (event.toStatus === "RETURNED_TO_CARRIER") row.returned++;
    else if (event.toStatus === "CANCELLED") row.cancelled++;
  }

  const header =
    "month,store_code,store_name,carrier,received,picked_up,outbound_accepted,handed_off,returned_to_carrier,cancelled";
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const body = [...rows.values()]
    .sort((a, b) => a.storeCode.localeCompare(b.storeCode) || a.carrier.localeCompare(b.carrier))
    .map((r) =>
      [
        month,
        escape(r.storeCode),
        escape(r.storeName),
        r.carrier,
        r.received,
        r.pickedUp,
        r.outboundAccepted,
        r.handedOff,
        r.returned,
        r.cancelled,
      ].join(",")
    );

  return new Response([header, ...body].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="packscan-settlement-${month}.csv"`,
    },
  });
}
