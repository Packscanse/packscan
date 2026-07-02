import { CARRIER_PROVIDERS } from "./index";
import type { DetectionResult } from "./types";

const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 } as const;

export function normalizeTrackingNumber(rawInput: string): string {
  return rawInput.replace(/\s+/g, "").toUpperCase();
}

/**
 * All candidate matches across carriers, best first. The scan UI shows the
 * top pick pre-selected and surfaces the rest so the clerk can verify —
 * manual override is always available regardless of confidence.
 */
export function detectCarrierCandidates(rawInput: string): DetectionResult[] {
  const trackingNumber = normalizeTrackingNumber(rawInput);
  return CARRIER_PROVIDERS.map((provider) => provider.detect(trackingNumber))
    .filter((r): r is DetectionResult => r !== null)
    .sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]);
}

export function detectCarrier(rawInput: string): DetectionResult {
  const candidates = detectCarrierCandidates(rawInput);
  return candidates[0] ?? { carrier: "UNKNOWN", confidence: "low", matchedRule: "no-match" };
}
