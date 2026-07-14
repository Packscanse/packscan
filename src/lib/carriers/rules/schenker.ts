import type { CarrierProvider } from "../types";
import { notConfigured } from "./not-configured";

/**
 * DB Schenker parcel numbers have no reliably distinguishable public format
 * (numeric STT references collide with FedEx digit rules), so detection
 * stays out of the heuristics — attribution comes from pre-advice/API
 * feeds or the clerk's manual pick. Everything else is first-class.
 */
export const schenkerProvider: CarrierProvider = {
  code: "SCHENKER",

  // Schenker ombud: photo ID is the proof; notification code recorded when shown.
  pickupPolicy: { code: "accepted", idCheck: "required", proxyAllowed: true },

  detect() {
    return null;
  },

  // Real implementations: DB Schenker integration API, once credentials exist.
  reportArrival: notConfigured,
  reportPickedUp: notConfigured,
  reportAcceptedOutbound: notConfigured,
  reportReturned: notConfigured,
  verifyPickupCode: notConfigured,

  async lookupTrackingDetails() {
    throw new Error("SCHENKER tracking API lookup not implemented (no credentials configured)");
  },
};
