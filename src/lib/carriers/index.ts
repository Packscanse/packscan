import type { CarrierCode, CarrierProvider, PickupPolicy } from "./types";
import { postnordProvider } from "./rules/postnord";
import { postnlProvider } from "./rules/postnl";
import { dhlProvider } from "./rules/dhl";
import { fedexProvider } from "./rules/fedex";

// Registry order breaks confidence ties (stable sort in detect.ts).
export const CARRIER_PROVIDERS: CarrierProvider[] = [
  postnordProvider,
  postnlProvider,
  dhlProvider,
  fedexProvider,
];

// Unrecognized carrier: no code scheme to trust, so fall back to the
// strictest universally available proof — a photo ID check.
const UNKNOWN_PICKUP_POLICY: PickupPolicy = {
  code: "accepted",
  idCheck: "required",
  proxyAllowed: true,
};

export function getPickupPolicy(carrier: CarrierCode): PickupPolicy {
  return (
    CARRIER_PROVIDERS.find((p) => p.code === carrier)?.pickupPolicy ??
    UNKNOWN_PICKUP_POLICY
  );
}

export * from "./types";
export { CARRIER_LABELS } from "./labels";
export { detectCarrier, detectCarrierCandidates, normalizeTrackingNumber } from "./detect";
