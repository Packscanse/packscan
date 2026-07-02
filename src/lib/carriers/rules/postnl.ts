import type { CarrierProvider } from "../types";
import { isValidS10, s10CountryCode } from "./s10-checksum";

// Domestic PostNL barcodes: "3S"/"2S" prefix + alphanumeric body (customer
// code + serial). Less rigorously standardized than S10, hence medium at best.
const DOMESTIC_PATTERN = /^[23]S[A-Z0-9]{7,13}$/;

export const postnlProvider: CarrierProvider = {
  code: "POSTNL",

  detect(trackingNumber) {
    if (s10CountryCode(trackingNumber) === "NL") {
      if (isValidS10(trackingNumber)) {
        return { carrier: "POSTNL", confidence: "high", matchedRule: "s10-postnl" };
      }
      return { carrier: "POSTNL", confidence: "low", matchedRule: "s10-postnl-bad-checksum" };
    }
    if (DOMESTIC_PATTERN.test(trackingNumber)) {
      return { carrier: "POSTNL", confidence: "medium", matchedRule: "postnl-domestic-3s" };
    }
    return null;
  },

  async lookupTrackingDetails() {
    throw new Error("POSTNL tracking API lookup not implemented (no credentials configured)");
  },
};
