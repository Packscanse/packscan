import type { Direction, PackageStatus } from "@prisma/client";

/**
 * The clerk picks one of these on the scan screen — direction alone can't
 * distinguish a plain inventory log from a customer-pickup registration.
 */
export type ScanFlow = "INBOUND_LOG" | "INBOUND_PICKUP" | "OUTBOUND_HANDOFF";

export const SCAN_FLOWS = ["INBOUND_LOG", "INBOUND_PICKUP", "OUTBOUND_HANDOFF"] as const;

export const FLOW_DIRECTION: Record<ScanFlow, Direction> = {
  INBOUND_LOG: "INBOUND",
  INBOUND_PICKUP: "INBOUND",
  OUTBOUND_HANDOFF: "OUTBOUND",
};

/** Status a package gets on its first scan in a given flow. */
export const INITIAL_STATUS: Record<ScanFlow, PackageStatus> = {
  INBOUND_LOG: "LOGGED",
  INBOUND_PICKUP: "AWAITING_PICKUP",
  OUTBOUND_HANDOFF: "PENDING_HANDOFF",
};

/** Forward transition when an existing package is scanned/actioned again. */
export const NEXT_STATUS: Partial<Record<PackageStatus, PackageStatus>> = {
  AWAITING_PICKUP: "PICKED_UP",
  PENDING_HANDOFF: "HANDED_OFF",
  // A parcel marked for return completes when the carrier driver collects it.
  RETURN_PENDING: "RETURNED_TO_CARRIER",
};

/** Overdue pickups are pulled out of the rescan flow via this explicit action. */
export function canMarkForReturn(status: PackageStatus): boolean {
  return status === "AWAITING_PICKUP";
}

const TERMINAL: ReadonlySet<PackageStatus> = new Set([
  "LOGGED",
  "PICKED_UP",
  "HANDED_OFF",
  "RETURNED_TO_CARRIER",
  "CANCELLED",
]);

export function isTerminal(status: PackageStatus): boolean {
  return TERMINAL.has(status);
}

/** Void/mistake-scan escape hatch: allowed from any non-terminal status. */
export function canCancel(status: PackageStatus): boolean {
  return !isTerminal(status);
}

export const STATUS_LABELS: Record<PackageStatus, string> = {
  LOGGED: "Logged",
  AWAITING_PICKUP: "Awaiting pickup",
  PICKED_UP: "Picked up",
  PENDING_HANDOFF: "Pending handoff",
  HANDED_OFF: "Handed off",
  RETURN_PENDING: "Return pending",
  RETURNED_TO_CARRIER: "Returned to carrier",
  CANCELLED: "Cancelled",
};

export const FLOW_LABELS: Record<ScanFlow, string> = {
  INBOUND_LOG: "Inbound: log only",
  INBOUND_PICKUP: "Inbound: customer pickup",
  OUTBOUND_HANDOFF: "Outbound: carrier handoff",
};
