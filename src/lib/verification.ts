import type { IdType } from "@prisma/client";
import type { PickupPolicy } from "@/lib/carriers";

/** What the clerk verified at the counter, as submitted by the UI. */
export interface HandoverInput {
  /** QR/pickup code scanned from the customer's carrier app (or typed). */
  presentedCode?: string;
  idChecked: boolean;
  idType?: IdType;
  collectorName?: string;
}

/** Fields persisted on the PICKED_UP scan event's HandoverVerification. */
export interface HandoverRecord {
  presentedCode: string | null;
  idChecked: boolean;
  idType: IdType | null;
  collectorName: string | null;
}

export const ID_TYPES: IdType[] = ["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID", "OTHER"];

export const ID_TYPE_LABELS: Record<IdType, string> = {
  PASSPORT: "Passport",
  DRIVERS_LICENSE: "Driver's license",
  NATIONAL_ID: "National ID card",
  OTHER: "Other photo ID",
};

/**
 * Pure gate for the AWAITING_PICKUP → PICKED_UP transition: checks the
 * clerk's verification input against the carrier's pickup policy.
 *
 * Customers authenticate with the carrier's own app — Packscan captures the
 * QR/pickup code they present as audit evidence. It cannot vouch for the
 * code's authenticity until carrier APIs are integrated, so "required" means
 * "must be captured", not "cryptographically valid".
 */
export function checkHandover(
  policy: PickupPolicy,
  input: HandoverInput
): { ok: true; record: HandoverRecord } | { ok: false; error: string } {
  const presentedCode = input.presentedCode?.trim() || null;

  if (policy.code === "required" && !presentedCode) {
    return {
      ok: false,
      error: "This carrier requires the pickup code — scan the QR in the customer's carrier app.",
    };
  }

  if (policy.idCheck === "required" && !input.idChecked) {
    return { ok: false, error: "This pickup requires a photo ID check." };
  }
  if (input.idChecked && !input.idType) {
    return { ok: false, error: "Select which type of ID was checked." };
  }

  const collectorName = input.collectorName?.trim() || null;
  if (collectorName && !policy.proxyAllowed) {
    return {
      ok: false,
      error: "This carrier does not allow pickup by someone else — the addressee must collect.",
    };
  }

  return {
    ok: true,
    record: {
      presentedCode,
      idChecked: input.idChecked,
      idType: input.idChecked ? (input.idType ?? null) : null,
      collectorName,
    },
  };
}
