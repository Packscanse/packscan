import type { CarrierCode } from "./api/types";

/** Brand names, not translations — mirror of the backend's CARRIER_LABELS. */
export const CARRIER_LABELS: Record<CarrierCode, string> = {
  DHL: "DHL",
  POSTNORD: "PostNord",
  POSTNL: "PostNL",
  FEDEX: "FedEx",
  SCHENKER: "DB Schenker",
  UNKNOWN: "?",
};

export const ALL_CARRIERS: CarrierCode[] = [
  "DHL",
  "POSTNORD",
  "POSTNL",
  "FEDEX",
  "SCHENKER",
  "UNKNOWN",
];
