import { CARRIER_PROVIDERS } from "@/lib/carriers";

// Error codes, not sentences: clients render them in the user's language.
export type CarrierStatusResult =
  | {
      ok: true;
      status: string;
      estimatedDelivery: string | null;
      events: { timestamp: string; description: string; location: string | null }[];
    }
  | { ok: false; code: "UNKNOWN_CARRIER" | "NOT_CONFIGURED" | "LOOKUP_FAILED" };

/**
 * "Where is this parcel?" — live tracking lookup at the carrier, shared by
 * the detail-page action and GET /api/v1/packages/:id/carrier-status.
 * Read-only. Until carrier API credentials exist every provider throws its
 * not-implemented error → NOT_CONFIGURED.
 */
export async function lookupCarrierStatus(pkg: {
  carrier: string;
  trackingNumber: string;
}): Promise<CarrierStatusResult> {
  const provider = CARRIER_PROVIDERS.find((p) => p.code === pkg.carrier);
  if (!provider) return { ok: false, code: "UNKNOWN_CARRIER" };
  try {
    const details = await provider.lookupTrackingDetails(pkg.trackingNumber);
    return {
      ok: true,
      status: details.status,
      estimatedDelivery: details.estimatedDelivery?.toISOString() ?? null,
      events: details.events.map((e) => ({
        timestamp: e.timestamp.toISOString(),
        description: e.description,
        location: e.location ?? null,
      })),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    return {
      ok: false,
      code: message.includes("not implemented") ? "NOT_CONFIGURED" : "LOOKUP_FAILED",
    };
  }
}
