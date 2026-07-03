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

export interface CarrierProvider {
  readonly code: CarrierCode;
  /** Handover verification this carrier mandates at pickup. */
  readonly pickupPolicy: PickupPolicy;
  /** Pure pattern matching, no network calls. Null if this carrier's rules don't match. */
  detect(trackingNumber: string): DetectionResult | null;
  /**
   * Seam for real carrier tracking APIs. Not implemented in v1 — each provider
   * throws until API credentials exist and a real implementation is dropped in.
   */
  lookupTrackingDetails(trackingNumber: string): Promise<TrackingDetails>;
}
