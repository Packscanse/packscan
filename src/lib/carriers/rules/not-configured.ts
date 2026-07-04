import type { CarrierEventReport } from "../types";

/**
 * Shared stub for every carrier event seam: no API credentials yet, so the
 * caller falls back (or skips). Replace per carrier with a real client.
 */
export const notConfigured = async (): Promise<CarrierEventReport> => ({
  status: "NOT_CONFIGURED",
});
