import type { IdType } from "@prisma/client";
import type { PickupPolicy } from "@/lib/carriers";

/** What the clerk verified at the counter, as submitted by the UI. */
export interface HandoverInput {
  /** QR/pickup code scanned from the customer's carrier app (or typed). */
  presentedCode?: string;
  idChecked: boolean;
  idType?: IdType;
  collectorName?: string;
  /** Proxy pickup: the collector's own ID, alongside the addressee's above. */
  collectorIdChecked?: boolean;
  collectorIdType?: IdType;
  /** Manager override: complete despite unmet policy. Reason is mandatory. */
  override?: boolean;
  overrideReason?: string;
}

/** Fields persisted on the PICKED_UP scan event's HandoverVerification. */
export interface HandoverRecord {
  presentedCode: string | null;
  /** Set by the carrier-API check in advanceStatus, never by checkHandover. */
  codeValidated: boolean;
  idChecked: boolean;
  idType: IdType | null;
  collectorName: string | null;
  collectorIdChecked: boolean;
  collectorIdType: IdType | null;
  override: boolean;
  overrideReason: string | null;
}

/** Tuple (not IdType[]) so zod enums can derive from the same source. */
export const ID_TYPES = ["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID", "OTHER"] as const satisfies readonly IdType[];

/** Outcome of classifying a scan made during the handover step. */
export type HandoverScan =
  | { kind: "ID_DOCUMENT"; idType: IdType }
  | { kind: "PICKUP_CODE"; code: string };

/**
 * One scanner pipeline at handover: the clerk scans either the carrier-app
 * QR or the customer's ID document, and we tell them apart by payload shape.
 * ID documents are recognized (AAMVA PDF417 on driver's licenses, ICAO MRZ
 * on passports/ID cards) but their contents are NEVER stored — recognizing
 * one only flips the "ID checked" flag and its type. Anything else is
 * treated as the presented pickup code.
 */
export function classifyHandoverScan(raw: string): HandoverScan {
  const payload = raw.trim();

  // AAMVA PDF417 (North American driver's licenses): "@" header / ANSI marker.
  if (payload.startsWith("@") || /\bANSI\s?\d{6}/.test(payload)) {
    return { kind: "ID_DOCUMENT", idType: "DRIVERS_LICENSE" };
  }
  // ICAO 9303 MRZ always contains "<<" filler runs; the leading document
  // code distinguishes passports (P...) from ID cards (I/A/C...).
  if (payload.includes("<<")) {
    if (/^P[A-Z<]/.test(payload)) return { kind: "ID_DOCUMENT", idType: "PASSPORT" };
    if (/^[IAC][A-Z<]/.test(payload)) return { kind: "ID_DOCUMENT", idType: "NATIONAL_ID" };
  }

  return { kind: "PICKUP_CODE", code: payload };
}

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
  input: HandoverInput,
  pkg: { trackingNumber: string }
): { ok: true; record: HandoverRecord } | { ok: false; error: string } {
  const presentedCode = input.presentedCode?.trim() || null;
  const collectorName = input.collectorName?.trim() || null;
  const overrideReason = input.overrideReason?.trim() || null;

  // A clerk habit-scanning the parcel label must never pass as evidence.
  if (presentedCode && presentedCode === pkg.trackingNumber) {
    return {
      ok: false,
      error:
        "That is the parcel's own label — scan the code in the customer's carrier app instead.",
    };
  }

  // Collector-ID fields only mean something when a collector is named.
  const collectorIdChecked = !!collectorName && !!input.collectorIdChecked;
  const base = {
    presentedCode,
    codeValidated: false,
    idChecked: input.idChecked,
    idType: input.idChecked ? (input.idType ?? null) : null,
    collectorName,
    collectorIdChecked,
    collectorIdType: collectorIdChecked ? (input.collectorIdType ?? null) : null,
  };

  // Manager override: skips the policy gate but never the audit trail — the
  // record keeps whatever WAS verified, flagged loudly with the reason.
  if (input.override) {
    if (!overrideReason || overrideReason.length < 3) {
      return { ok: false, error: "A manager override requires a reason." };
    }
    return { ok: true, record: { ...base, override: true, overrideReason } };
  }

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

  if (collectorName && !policy.proxyAllowed) {
    return {
      ok: false,
      error: "This carrier does not allow pickup by someone else — the addressee must collect.",
    };
  }

  // Proxy pickups follow counter practice: both documents on the table.
  // The collector's ID proves who they are; the addressee's proves the errand.
  if (collectorName) {
    if (!input.idChecked) {
      return {
        ok: false,
        error: "Proxy pickup requires the addressee's photo ID as well as the collector's.",
      };
    }
    if (!collectorIdChecked) {
      return { ok: false, error: "Proxy pickup requires the collector's own photo ID." };
    }
    if (!input.collectorIdType) {
      return { ok: false, error: "Select which type of ID the collector showed." };
    }
  }

  return { ok: true, record: { ...base, override: false, overrideReason: null } };
}
