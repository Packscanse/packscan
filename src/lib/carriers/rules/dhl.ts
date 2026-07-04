import type { CarrierProvider } from "../types";
import { notConfigured } from "./not-configured";

// DHL has no unified checksum standard across Express/Parcel/eCommerce —
// these are prefix + length heuristics, individually confidence-scored.
const EXPRESS_10_DIGIT = /^\d{10}$/;
const PARCEL_PREFIX = /^(JVGL|JJD)[A-Z0-9]{6,}$/;
const ECOMMERCE_PREFIX = /^(GM|LX|RX)[A-Z0-9]{8,37}$/;
// DHL Parcel Benelux also uses "3S"-prefixed codes — deliberate overlap with
// PostNL's domestic rule so both show up as candidates for the clerk.
const PARCEL_BENELUX_3S = /^3S[A-Z0-9]{7,13}$/;

export const dhlProvider: CarrierProvider = {
  code: "DHL",

  // DHL ServicePoint: the pickup code is the proof; ID is recorded when shown.
  pickupPolicy: { code: "required", idCheck: "accepted", proxyAllowed: true },

  detect(trackingNumber) {
    if (PARCEL_PREFIX.test(trackingNumber)) {
      return { carrier: "DHL", confidence: "high", matchedRule: "dhl-parcel-prefix" };
    }
    if (EXPRESS_10_DIGIT.test(trackingNumber)) {
      return { carrier: "DHL", confidence: "medium", matchedRule: "dhl-express-10digit" };
    }
    if (ECOMMERCE_PREFIX.test(trackingNumber)) {
      return { carrier: "DHL", confidence: "medium", matchedRule: "dhl-ecommerce-prefix" };
    }
    if (PARCEL_BENELUX_3S.test(trackingNumber)) {
      return { carrier: "DHL", confidence: "low", matchedRule: "dhl-parcel-benelux-3s" };
    }
    return null;
  },

  // Real implementations: DHL ServicePoint event API, once credentials exist.
  reportArrival: notConfigured,
  reportPickedUp: notConfigured,
  reportAcceptedOutbound: notConfigured,
  reportReturned: notConfigured,

  async lookupTrackingDetails() {
    throw new Error("DHL tracking API lookup not implemented (no credentials configured)");
  },
};
