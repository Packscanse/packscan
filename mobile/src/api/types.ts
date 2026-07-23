/**
 * Hand-mirrored shapes from the server's /api/v1 (see ../../docs/api-v1.md
 * and src/lib/scan-flow.ts in the backend). Keep in sync when the API
 * grows — the test suite scripts/test-api.ts is the contract check.
 */

export type Role = "ADMIN" | "MANAGER" | "CLERK";
export type AuthMethod = "PASSWORD" | "PIN";
export type Locale = "SV" | "EN" | "DE" | "NL" | "NO" | "DA" | "FI";

export type CarrierCode = "DHL" | "POSTNORD" | "POSTNL" | "FEDEX" | "SCHENKER" | "UNKNOWN";

export type PackageStatus =
  | "LOGGED"
  | "AWAITING_PICKUP"
  | "PICKED_UP"
  | "PENDING_HANDOFF"
  | "HANDED_OFF"
  | "RETURN_PENDING"
  | "RETURNED_TO_CARRIER"
  | "CANCELLED";

export type ScanFlow = "INBOUND_LOG" | "INBOUND_PICKUP" | "OUTBOUND_HANDOFF";
export type IdType = "PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID" | "OTHER";

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  storeId: string;
  locale: Locale;
  authMethod: AuthMethod;
};

export type ApiStore = {
  id: string;
  name: string;
  code: string;
  brandColor: string | null;
  logoData?: string | null;
  pickupDeadlineDays?: number;
  sessionIdleMinutes?: number;
};

export type LoginResponse = {
  ok: true;
  token: string;
  expiresAt: string;
  user: ApiUser;
  store: ApiStore | null;
};

export type ApiErrorBody = { ok: false; error: { code: string; message: string } };

export type HandoverInput = {
  presentedCode?: string;
  idChecked: boolean;
  idType?: IdType;
  collectorName?: string;
  collectorIdChecked?: boolean;
  collectorIdType?: IdType;
  override?: boolean;
  overrideReason?: string;
};

export type ScanInput = {
  trackingNumber: string;
  flow: ScanFlow;
  carrier: CarrierCode;
  carrierManual: boolean;
  inputMethod: "CAMERA" | "HARDWARE_SCANNER" | "MANUAL_ENTRY";
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  shelfLocation?: string;
  verification?: HandoverInput;
  offline?: { queuedAt: number; queuedByUserId: string };
};

export type PickupPolicy = {
  code: "required" | "accepted" | "none";
  idCheck: "required" | "accepted";
  proxyAllowed: boolean;
};

export type HandoverContext = {
  packageId: string;
  trackingNumber: string;
  carrier: CarrierCode;
  customerName: string | null;
  shelfLocation: string | null;
  /** ISO timestamp of the intake scan — "on the shelf N days". */
  arrivedAt: string;
  policy: PickupPolicy;
};

export type ScanResult =
  | {
      ok: true;
      kind: "created" | "transitioned";
      packageId: string;
      trackingNumber: string;
      carrier: string;
      status: PackageStatus;
      fromStatus?: PackageStatus;
      direction: "INBOUND" | "OUTBOUND";
    }
  | { ok: false; code: "VERIFICATION_REQUIRED"; error: string; handover: HandoverContext }
  | { ok: false; code?: string; error: string };

export type DetectionCandidate = {
  carrier: CarrierCode;
  confidence: "high" | "medium" | "low";
  matchedRule: string;
};

export type PreAdviceMatch = {
  carrier: CarrierCode;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
};

export type ShelfSuggestion = {
  suggested: string | null;
  reason: "customer" | "space" | null;
  alternatives: string[];
};

export type ScanContext = {
  ok: true;
  trackingNumber: string;
  candidates: DetectionCandidate[];
  preAdvice: PreAdviceMatch | null;
  /** A parcel already waiting on the shelf — pickup goes straight to verification. */
  handover: HandoverContext | null;
  /** The customer's other shelf parcels, for the one-walk visit. */
  companions: HandoverContext[];
  /** Where to put a new parcel (intake flows). */
  shelf: ShelfSuggestion;
};

export type PackageSummary = {
  id: string;
  trackingNumber: string;
  carrier: CarrierCode;
  direction: "INBOUND" | "OUTBOUND";
  status: PackageStatus;
  customerName: string | null;
  shelfLocation: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PackageListResponse = {
  ok: true;
  packages: PackageSummary[];
  page: number;
  pageCount: number;
  total: number;
  deadlineDays: number;
};

export type ScanEventEntry = {
  id: string;
  fromStatus: PackageStatus | null;
  toStatus: PackageStatus;
  scannedAt: string;
  inputMethod: string;
  courierRef: string | null;
  note: string | null;
  user: { name: string };
  verification: {
    presentedCode: string | null;
    codeValidated: boolean;
    idChecked: boolean;
    idType: IdType | null;
    collectorName: string | null;
    override: boolean;
    overrideReason: string | null;
  } | null;
};

export type PackageDetail = PackageSummary & {
  customerPhone: string | null;
  customerEmail: string | null;
  notes: string | null;
  carrierManual: boolean;
  store: { name: string; code: string };
  scanEvents: ScanEventEntry[];
  notifications: {
    id: string;
    channel: string;
    recipient: string;
    status: string;
    message: string;
    createdAt: string;
  }[];
};

export type CarrierStatusResult =
  | {
      ok: true;
      status: string;
      estimatedDelivery: string | null;
      events: { timestamp: string; description: string; location: string | null }[];
    }
  | { ok: false; code: "UNKNOWN_CARRIER" | "NOT_CONFIGURED" | "LOOKUP_FAILED" };
