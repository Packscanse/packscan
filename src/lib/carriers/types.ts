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

export interface CarrierProvider {
  readonly code: CarrierCode;
  /** Pure pattern matching, no network calls. Null if this carrier's rules don't match. */
  detect(trackingNumber: string): DetectionResult | null;
  /**
   * Seam for real carrier tracking APIs. Not implemented in v1 — each provider
   * throws until API credentials exist and a real implementation is dropped in.
   */
  lookupTrackingDetails(trackingNumber: string): Promise<TrackingDetails>;
}
