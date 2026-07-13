/**
 * Shared stub for every carrier API seam (events and code verification):
 * no credentials yet, so the caller falls back (or skips). Replace per
 * carrier with a real client. The literal return type is assignable to
 * every seam's result union.
 */
export const notConfigured = async (): Promise<{ status: "NOT_CONFIGURED" }> => ({
  status: "NOT_CONFIGURED",
});
