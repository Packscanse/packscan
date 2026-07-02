import type { CarrierCode } from "./types";

export const CARRIER_LABELS: Record<CarrierCode, string> = {
  DHL: "DHL",
  POSTNORD: "PostNord",
  POSTNL: "PostNL",
  FEDEX: "FedEx",
  UNKNOWN: "Unknown / other",
};
