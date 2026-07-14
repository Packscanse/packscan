import type { NextRequest } from "next/server";
import { ingestCarrierEvents } from "@/lib/carrier-ingest";

/**
 * Inbound carrier webhook: POST announced-parcel batches here.
 *   Authorization: Bearer <CARRIER_WEBHOOK_SECRET>
 *   Body: { carrier, storeCode, parcels: [{ trackingNumber, customerName?, … }] }
 * Per-carrier signature schemes (HMAC etc.) slot in here when each
 * carrier's real webhook format is known — the ingest layer is shared.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CARRIER_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const provided = req.headers.get("authorization");
  if (provided !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await ingestCarrierEvents(payload);
  if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
  return Response.json(result);
}
