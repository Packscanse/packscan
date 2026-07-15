import { createHmac, timingSafeEqual } from "crypto";

/**
 * Webhook signature scheme: `sha256=hex(hmac(secret, "<timestamp>.<body>"))`
 * with the unix-seconds timestamp in x-packscan-timestamp. The timestamp
 * binding gives replay protection within the tolerance window. Secrets are
 * per carrier (CARRIER_WEBHOOK_SECRET_<CODE>) with the shared
 * CARRIER_WEBHOOK_SECRET as fallback.
 */
export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

export function webhookSecretFor(carrier: string): string | undefined {
  return (
    process.env[`CARRIER_WEBHOOK_SECRET_${carrier.toUpperCase()}`] ||
    process.env.CARRIER_WEBHOOK_SECRET ||
    undefined
  );
}

export function verifyWebhookSignature(args: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  nowMs?: number;
}): boolean {
  const ts = Number(args.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs((args.nowMs ?? Date.now()) - ts * 1000) > WEBHOOK_TOLERANCE_MS) return false;

  const expected = createHmac("sha256", args.secret)
    .update(`${args.timestamp}.${args.body}`)
    .digest("hex");
  const provided = args.signature.replace(/^sha256=/, "");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false; // length mismatch / non-hex
  }
}

/**
 * Inbound half of "Carrier API → platform → counter workflow": carriers
 * push announced-parcel events here (webhook or polled feed adapter) and
 * they land as PreAdvice — which pre-fills intake, fixes carrier
 * attribution, and powers the Expected page. Upsert semantics: a
 * re-announcement UPDATES contact details while the parcel is still
 * ANNOUNCED; once RECEIVED it is never touched.
 */
