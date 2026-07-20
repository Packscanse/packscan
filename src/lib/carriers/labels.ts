import type { Messages } from "@/lib/i18n";
import type { CarrierCode } from "./types";

/**
 * Plain-English carrier names. The real carriers are brand names — identical
 * in every locale — so this map is safe on English-only surfaces (admin).
 * UNKNOWN is the one prose entry; locale-aware surfaces render it through
 * carrierLabel() instead of reading this map directly.
 */
export const CARRIER_LABELS: Record<CarrierCode, string> = {
  DHL: "DHL",
  POSTNORD: "PostNord",
  POSTNL: "PostNL",
  FEDEX: "FedEx",
  SCHENKER: "DB Schenker",
  UNKNOWN: "Unknown / other",
};

/** Localized carrier label: brand names pass through, UNKNOWN translates. */
export function carrierLabel(carrier: CarrierCode, t: Messages): string {
  return carrier === "UNKNOWN" ? t.carrier.UNKNOWN : CARRIER_LABELS[carrier];
}
