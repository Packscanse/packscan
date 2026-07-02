import type { CarrierProvider } from "./types";
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

export * from "./types";
export { CARRIER_LABELS } from "./labels";
export { detectCarrier, detectCarrierCandidates, normalizeTrackingNumber } from "./detect";
