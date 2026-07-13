export type CarrierCode = "DHL" | "POSTNORD" | "POSTNL" | "FEDEX" | "UNKNOWN";

export type Confidence = "high" | "medium" | "low";

export interface DetectionResult {
  carrier: CarrierCode;
  confidence: Confidence;
  /** Which rule matched, e.g. "s10-postnord" — for debugging and audit. */
  matchedRule: string;
}

export interface TrackingDetails {
  carrier: CarrierCode;
  status: string;
  estimatedDelivery?: Date;
  events: { timestamp: Date; description: string; location?: string }[];
}

/**
 * What the carrier requires the store to verify at customer handover.
 * "required" gates the PICKED_UP transition; "accepted" is recorded when
 * provided but not mandatory; "none" means the carrier issues no such proof.
 */
export interface PickupPolicy {
  /** The pickup code from the arrival notification / carrier app. */
  code: "required" | "accepted" | "none";
  /** Photo ID check. Never "none" — every carrier at least accepts ID. */
  idCheck: "required" | "accepted";
  /** Whether someone other than the addressee may collect. */
  proxyAllowed: boolean;
}

/**
 * Result of reporting a parcel event to the carrier. REPORTED means the
 * carrier accepted it (and, for arrivals, will notify the recipient through
 * its own app); NOT_CONFIGURED means no API credentials yet — the caller
 * falls back to direct notification where one exists.
 */
export interface CarrierEventReport {
  status: "REPORTED" | "NOT_CONFIGURED";
}

/** @deprecated Use CarrierEventReport. */
export type ArrivalReport = CarrierEventReport;

/** Proof-of-delivery summary pushed with the pickup event. */
export interface PickupProof {
  codePresented: boolean;
  idChecked: boolean;
  collectorName: string | null;
  override: boolean;
}

/**
 * Carrier's verdict on a presented pickup code. VALID/INVALID once the
 * carrier API is live; NOT_CONFIGURED means the code is recorded as
 * evidence only and the handover proceeds on the local policy.
 */
export interface CodeVerification {
  status: "VALID" | "INVALID" | "NOT_CONFIGURED";
}

export interface CarrierProvider {
  readonly code: CarrierCode;
  /** Handover verification this carrier mandates at pickup. */
  readonly pickupPolicy: PickupPolicy;
  /** Pure pattern matching, no network calls. Null if this carrier's rules don't match. */
  detect(trackingNumber: string): DetectionResult | null;
  /**
   * Parcel lifecycle events pushed to the carrier. All return NOT_CONFIGURED
   * until API credentials exist and a real implementation is dropped in.
   * - reportArrival: parcel is at the pickup point → carrier notifies the
   *   recipient in its own app.
   * - reportPickedUp: proof-of-delivery with the verification summary.
   * - reportAcceptedOutbound: parcel accepted from a private sender.
   * - reportReturned: uncollected parcel handed back to the carrier.
   */
  reportArrival(trackingNumber: string): Promise<CarrierEventReport>;
  reportPickedUp(trackingNumber: string, proof: PickupProof): Promise<CarrierEventReport>;
  reportAcceptedOutbound(trackingNumber: string): Promise<CarrierEventReport>;
  reportReturned(trackingNumber: string): Promise<CarrierEventReport>;
  /**
   * Validate the pickup code the customer presented against the carrier.
   * INVALID blocks the handover; NOT_CONFIGURED (no credentials yet) lets
   * it proceed with the code captured as evidence only.
   */
  verifyPickupCode(trackingNumber: string, code: string): Promise<CodeVerification>;
  /**
   * Seam for real carrier tracking APIs. Not implemented in v1 — each provider
   * throws until API credentials exist and a real implementation is dropped in.
   */
  lookupTrackingDetails(trackingNumber: string): Promise<TrackingDetails>;
}
