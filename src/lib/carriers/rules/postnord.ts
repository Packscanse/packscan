import type { CarrierProvider } from "../types";
import { isValidS10, s10CountryCode } from "./s10-checksum";

const NORDIC_COUNTRIES = new Set(["SE", "NO", "DK", "FI"]);

export const postnordProvider: CarrierProvider = {
  code: "POSTNORD",

  // PostNord: pickup code (app/notification QR) plus photo ID; proxy pickup
  // allowed with the code and both IDs.
  pickupPolicy: { code: "required", idCheck: "required", proxyAllowed: true },

  detect(trackingNumber) {
    const country = s10CountryCode(trackingNumber);
    if (!country || !NORDIC_COUNTRIES.has(country)) return null;
    if (isValidS10(trackingNumber)) {
      return { carrier: "POSTNORD", confidence: "high", matchedRule: "s10-postnord" };
    }
    // S10-shaped with a Nordic suffix but failing checksum: likely scan/typo
    // noise on a real PostNord number — surface it, let the clerk verify.
    return { carrier: "POSTNORD", confidence: "low", matchedRule: "s10-postnord-bad-checksum" };
  },

  async reportArrival() {
    // Real implementation: PostNord parcel-event API, once credentials exist.
    return { status: "NOT_CONFIGURED" as const };
  },

  async lookupTrackingDetails() {
    throw new Error("POSTNORD tracking API lookup not implemented (no credentials configured)");
  },
};
