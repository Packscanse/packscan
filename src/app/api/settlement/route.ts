import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { hasManagementAccess } from "@/lib/session";
import { settlementRows } from "@/lib/reports";

/**
 * Settlement export: one CSV row per store × carrier for a month —
 * the owner's basis for reconciling against each carrier's remittance.
 * Aggregated in the database (chain-scale safe). Admins get every store;
 * managers their own. Password session required.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !hasManagementAccess(session)) {
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

  const rows = await settlementRows(start, end, scope);

  const header =
    "month,store_code,store_name,carrier,received,picked_up,outbound_accepted,handed_off,returned_to_carrier,cancelled";
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const body = rows.map((r) =>
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
