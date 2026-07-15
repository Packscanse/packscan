import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { ingestCarrierEvents } from "@/lib/carrier-ingest";
import { verifyWebhookSignature, webhookSecretFor } from "@/lib/webhook-security";

const MAX_BODY_BYTES = 1_000_000;

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Inbound carrier webhook: POST announced-parcel batches here.
 *   Body: { carrier, storeCode, parcels: [{ trackingNumber, customerName?, … }] }
 *
 * Preferred auth (production): HMAC —
 *   x-packscan-timestamp: <unix seconds>
 *   x-packscan-signature: sha256=<hex hmac(secret, "<timestamp>.<raw body>")>
 * with per-carrier secrets (CARRIER_WEBHOOK_SECRET_<CODE>, shared fallback)
 * and a 5-minute replay window. `Authorization: Bearer <shared secret>` is
 * accepted as the simple integration path.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const carrier =
    typeof payload === "object" && payload !== null && "carrier" in payload
      ? String((payload as { carrier: unknown }).carrier)
      : "";

  const secret = webhookSecretFor(carrier);
  if (!secret) {
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = req.headers.get("x-packscan-signature");
  const timestamp = req.headers.get("x-packscan-timestamp");
  const bearer = req.headers.get("authorization");

  const authorized =
    signature && timestamp
      ? verifyWebhookSignature({ secret, timestamp, body, signature })
      : bearer !== null && safeEquals(bearer, `Bearer ${secret}`);
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await ingestCarrierEvents(payload);
  if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
  return Response.json(result);
}
