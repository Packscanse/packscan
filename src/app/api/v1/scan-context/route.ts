import { apiError, apiJson, requireApiUser } from "@/lib/api-auth";
import { detectCarrierCandidates, normalizeTrackingNumber } from "@/lib/carriers";
import { lookupScanContext } from "@/lib/scan-flow";

/**
 * GET /api/v1/scan-context?tracking=… — everything the app needs the moment
 * a label is scanned, in one round-trip: the server's carrier detection
 * (the rules live here, never duplicated into clients), any pre-advice
 * match for pre-filling the intake form, and the same visit context the web
 * scan screen gets — a waiting parcel ready for handover, the customer's
 * other shelf parcels, and the shelf suggestion for intake. Pre-advice wins
 * over detection for carrier attribution, same as the web Scan screen.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireApiUser(request);
  if (auth.error) return auth.error;

  const tracking = new URL(request.url).searchParams.get("tracking")?.trim() ?? "";
  if (!tracking) return apiError(422, "INVALID_INPUT", "Query parameter `tracking` is required.");

  const lookup = await lookupScanContext(auth.user.storeId, tracking);
  return apiJson({
    trackingNumber: normalizeTrackingNumber(tracking),
    candidates: detectCarrierCandidates(tracking),
    preAdvice: lookup.match,
    handover: lookup.handover,
    companions: lookup.companions,
    shelf: lookup.shelf,
  });
}
