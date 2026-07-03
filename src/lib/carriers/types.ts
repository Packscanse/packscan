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
 * Result of reporting an arrival scan to the carrier. REPORTED means the
 * carrier accepted it and will notify the recipient through its own app;
 * NOT_CONFIGURED means no API credentials yet — the caller falls back to
 * direct notification.
 */
export interface ArrivalReport {
  status: "REPORTED" | "NOT_CONFIGURED";
}

export interface CarrierProvider {
  readonly code: CarrierCode;
  /** Handover verification this carrier mandates at pickup. */
  readonly pickupPolicy: PickupPolicy;
  /** Pure pattern matching, no network calls. Null if this carrier's rules don't match. */
  detect(trackingNumber: string): DetectionResult | null;
  /**
   * Tell the carrier the parcel arrived at this pickup point, so the carrier
   * notifies the recipient in its own app. Returns NOT_CONFIGURED until API
   * credentials exist and a real implementation is dropped in.
   */
  reportArrival(trackingNumber: string): Promise<ArrivalReport>;
  /**
   * Seam for real carrier tracking APIs. Not implemented in v1 — each provider
   * throws until API credentials exist and a real implementation is dropped in.
   */
  lookupTrackingDetails(trackingNumber: string): Promise<TrackingDetails>;
}
