import type { CarrierProvider } from "../types";

// FedEx tracking numbers are purely numeric: 12 (Express), 15 (Ground),
// or 20 (Ground SSCC-shortened) digits. Letter-prefixed formats (S10, DHL
// prefixes) can't collide; 10-digit DHL Express differs by length.
const FEDEX_LENGTHS = new Set([12, 15, 20]);

export const fedexProvider: CarrierProvider = {
  code: "FEDEX",

  detect(trackingNumber) {
    if (/^\d+$/.test(trackingNumber) && FEDEX_LENGTHS.has(trackingNumber.length)) {
      return { carrier: "FEDEX", confidence: "high", matchedRule: `fedex-${trackingNumber.length}digit` };
    }
    return null;
  },

  async lookupTrackingDetails() {
    throw new Error("FEDEX tracking API lookup not implemented (no credentials configured)");
  },
};
