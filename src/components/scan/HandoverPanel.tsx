"use client";

import { useState } from "react";
import type { IdType } from "@prisma/client";
import { IdCard, QrCode } from "lucide-react";
import {
  carrierLabel,
  getPickupPolicy,
  normalizeTrackingNumber,
  type CarrierCode,
} from "@/lib/carriers";
import { ID_TYPES, classifyHandoverScan, type HandoverInput } from "@/lib/verification";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n/I18nProvider";
import { CameraScanner } from "./CameraScanner";
import { HardwareScannerInput } from "./HardwareScannerInput";

/**
 * The carrier-policy-driven verification step before a pickup can complete,
 * as Shelf First tap-tiles: one tile per thing the policy asks for (pickup
 * code, addressee ID, collector ID at proxy pickups). The ID tiles toggle on
 * tap; the code tile opens a scan/type capture — scanning the customer's
 * carrier-app QR auto-verifies it from anywhere on the screen. Client-side
 * gating is a convenience; the server re-validates via checkHandover.
 */

type TileState = "idle" | "pending" | "verified";

function VerifyTile({
  icon: Icon,
  label,
  hint,
  state,
  onClick,
}: {
  icon: typeof QrCode;
  label: string;
  hint: string;
  state: TileState;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state === "verified"}
      className={cn(
        "grid min-h-28 content-start justify-items-start gap-2 rounded-[16px] border p-4 text-left transition-colors",
        state === "verified"
          ? "border-primary bg-primary/25"
          : state === "pending"
            ? "border-primary bg-secondary/60"
            : "border-dash bg-secondary/60"
      )}
    >
      <Icon
        className={cn("size-6", state === "idle" ? "text-muted-foreground" : "text-primary")}
      />
      <span className="text-sm font-semibold">
        {label}
        {state === "verified" && " ✓"}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

/** The four ID kinds as tap-pills — replaces the dropdown at the counter. */
function TypePills({
  value,
  onChange,
  label,
}: {
  value: IdType | "";
  onChange: (value: IdType) => void;
  label: string;
}) {
  const t = useT();
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {ID_TYPES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={cn(
              "h-11 rounded-full border px-3 text-[13px] font-medium transition-colors",
              value === option
                ? "border-primary bg-primary/25 text-foreground"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            {t.idType[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HandoverPanel({
  carrier,
  customerName,
  trackingNumber,
  shelfLocation,
  canOverride,
  isPending,
  error,
  onConfirm,
  onDiscard,
  initialIdChecked = false,
  initialIdType = "",
  initialCollectorName = "",
  initialCollectorIdChecked = false,
  initialCollectorIdType = "",
  visitTrackings,
  onVisitScan,
  showContext = true,
}: {
  carrier: CarrierCode;
  customerName: string | null;
  trackingNumber: string;
  shelfLocation: string | null;
  /** Overrides are admin-only; the server enforces this regardless. */
  canOverride: boolean;
  isPending: boolean;
  error: string | null;
  onConfirm: (verification: HandoverInput) => void;
  onDiscard?: () => void;
  /** Carried over from the previous parcel in the same visit — one physical
      ID check covers every parcel the customer collects. */
  initialIdChecked?: boolean;
  initialIdType?: IdType | "";
  initialCollectorName?: string;
  initialCollectorIdChecked?: boolean;
  initialCollectorIdType?: IdType | "";
  /** Tracking numbers of the visit's other parcels: scanning one of their
      labels checks it off instead of being mistaken for a pickup code. */
  visitTrackings?: string[];
  onVisitScan?: (trackingNumber: string) => void;
  /** The scan screen renders the shelf poster above; it turns this off. */
  showContext?: boolean;
}) {
  const t = useT();
  const policy = getPickupPolicy(carrier);
  const [presentedCode, setPresentedCode] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanWarning, setScanWarning] = useState<string | null>(null);
  const [idChecked, setIdChecked] = useState(initialIdChecked);
  const [idType, setIdType] = useState<IdType | "">(initialIdType);
  const [idScanned, setIdScanned] = useState(false);
  const [collectorOpen, setCollectorOpen] = useState(initialCollectorName.trim().length > 0);
  const [collectorName, setCollectorName] = useState(initialCollectorName);
  const [collectorIdChecked, setCollectorIdChecked] = useState(initialCollectorIdChecked);
  const [collectorIdType, setCollectorIdType] = useState<IdType | "">(initialCollectorIdType);
  const [collectorIdScanned, setCollectorIdScanned] = useState(false);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const codeRequired = policy.code === "required";
  const showCode = policy.code !== "none";
  // Proxy pickup: counter practice puts both documents on the table — the
  // collector's own ID and the addressee's.
  const collectorNamed = collectorName.trim().length > 0;

  const idsComplete =
    (!idChecked || idType !== "") &&
    (!collectorNamed ||
      (idChecked && collectorIdChecked && collectorIdType !== ""));
  const policySatisfied =
    (!codeRequired || presentedCode.trim().length > 0) &&
    (policy.idCheck !== "required" || idChecked) &&
    idsComplete;
  const satisfied = override
    ? overrideReason.trim().length >= 3 &&
      (!idChecked || idType !== "") &&
      (!collectorIdChecked || collectorIdType !== "")
    : policySatisfied;

  // A disabled button must say why: list exactly what is still missing.
  const missingItems = (
    override
      ? [
          overrideReason.trim().length < 3 ? t.handover.needReason : null,
          idChecked && idType === "" ? t.handover.needIdType : null,
          collectorIdChecked && collectorIdType === "" ? t.handover.needCollectorIdType : null,
        ]
      : [
          codeRequired && presentedCode.trim().length === 0 ? t.handover.needCode : null,
          (policy.idCheck === "required" || collectorNamed) && !idChecked
            ? t.handover.needId
            : null,
          idChecked && idType === "" ? t.handover.needIdType : null,
          collectorNamed && !collectorIdChecked ? t.handover.needCollectorId : null,
          collectorNamed && collectorIdChecked && collectorIdType === ""
            ? t.handover.needCollectorIdType
            : null,
        ]
  ).filter((item): item is string => item !== null);

  // One pipeline for every scan during handover: an ID document only flips
  // the ID-checked flag (its contents are discarded, never stored); anything
  // else is the presented pickup code.
  function captureScan(raw: string) {
    if (!raw.trim()) return;
    const scan = classifyHandoverScan(raw);
    if (scan.kind === "ID_DOCUMENT") {
      // Two documents at a proxy pickup: the first scan fills the addressee's
      // slot, the next fills the collector's. Without a named collector every
      // scan (re)fills the addressee's.
      if (idChecked && collectorNamed) {
        setCollectorIdChecked(true);
        setCollectorIdType(scan.idType);
        setCollectorIdScanned(true);
      } else {
        setIdChecked(true);
        setIdType(scan.idType);
        setIdScanned(true);
      }
      setScanWarning(null);
      return;
    }
    if (scan.code === trackingNumber) {
      // Habit-scanning the parcel label must never become "evidence".
      setScanWarning(t.handover.ownLabelWarning);
      return;
    }
    // Another parcel in the same visit: check it off the visit list.
    const normalized = normalizeTrackingNumber(scan.code);
    if (visitTrackings?.includes(normalized)) {
      onVisitScan?.(normalized);
      setScanWarning(null);
      return;
    }
    setPresentedCode(scan.code);
    setCodeOpen(false);
    setCameraOn(false);
    setScanWarning(null);
  }

  function toggleAddresseeId() {
    if (idChecked) {
      setIdChecked(false);
      setIdType("");
      setIdScanned(false);
    } else {
      setIdChecked(true);
    }
  }

  function toggleCollectorId() {
    if (collectorIdChecked) {
      setCollectorIdChecked(false);
      setCollectorIdType("");
      setCollectorIdScanned(false);
    } else {
      setCollectorIdChecked(true);
    }
  }

  const codeState: TileState = presentedCode ? "verified" : codeOpen ? "pending" : "idle";
  const idState: TileState = idChecked ? (idType !== "" ? "verified" : "pending") : "idle";
  const collectorIdState: TileState = collectorIdChecked
    ? (collectorIdType !== "" ? "verified" : "pending")
    : "idle";

  return (
    <div className="grid gap-4">
      {showContext && (
        <p className="text-sm text-muted-foreground">
          {carrierLabel(carrier, t)}
          {customerName ? ` · ${customerName}` : ""}
          {shelfLocation ? ` · ${shelfLocation}` : ""}
        </p>
      )}

      {/* Always armed: IDs are scannable even for carriers with no code scheme. */}
      <HardwareScannerInput onDetect={captureScan} />

      <div className="grid grid-cols-2 gap-2.5">
        {showCode && (
          <VerifyTile
            icon={QrCode}
            label={t.handover.codeTile}
            hint={
              presentedCode ||
              `${t.handover.codeTileHint}${codeRequired ? "" : t.handover.optionalSuffix}`
            }
            state={codeState}
            onClick={() => {
              if (presentedCode) setPresentedCode("");
              else setCodeOpen((open) => !open);
            }}
          />
        )}
        <VerifyTile
          icon={IdCard}
          label={collectorNamed ? t.handover.addresseeIdChecked : t.handover.idTile}
          hint={idChecked && idType !== "" ? t.idType[idType] : t.handover.idTileHint}
          state={idState}
          onClick={toggleAddresseeId}
        />
        {collectorNamed && (
          <VerifyTile
            icon={IdCard}
            label={t.handover.collectorTile}
            hint={
              collectorIdChecked && collectorIdType !== ""
                ? t.idType[collectorIdType]
                : collectorName.trim()
            }
            state={collectorIdState}
            onClick={toggleCollectorId}
          />
        )}
      </div>

      {(idScanned || collectorIdScanned) && (
        <p className="text-xs text-muted-foreground">{t.handover.idScanned}</p>
      )}
      {scanWarning && <p className="text-sm text-destructive">{scanWarning}</p>}

      {codeOpen && !presentedCode && (
        <div className="grid gap-2 rounded-[16px] bg-card p-4">
          <Label htmlFor="presented-code" className="text-sm">
            {t.handover.scanCodeLabel
              .replace("{carrier}", carrierLabel(carrier, t))
              .replace("{optional}", codeRequired ? "" : t.handover.optionalSuffix)}
          </Label>
          <p className="text-xs text-muted-foreground">{t.handover.scannerReady}</p>
          {cameraOn ? (
            <div className="grid gap-2">
              <CameraScanner
                onDetect={captureScan}
                onError={(message) => {
                  setCameraError(message);
                  setCameraOn(false);
                }}
              />
              <Button type="button" variant="outline" onClick={() => setCameraOn(false)}>
                {t.scan.stopCamera}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCameraError(null);
                  setCameraOn(true);
                }}
              >
                {t.scan.scanWithCamera}
              </Button>
              <Input
                id="presented-code"
                className="min-w-40 flex-1"
                placeholder={t.handover.typeCode}
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const value = e.currentTarget.value;
                    // Clear first: ID and visit-label scans keep the
                    // field mounted, and stale text reads as a code.
                    e.currentTarget.value = "";
                    captureScan(value);
                  }
                }}
                onBlur={(e) => {
                  const value = e.currentTarget.value;
                  e.currentTarget.value = "";
                  captureScan(value);
                }}
              />
            </div>
          )}
          {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}
        </div>
      )}

      {idChecked && idType === "" && (
        <TypePills value={idType} onChange={setIdType} label={t.handover.idTypePlaceholder} />
      )}
      {collectorNamed && collectorIdChecked && collectorIdType === "" && (
        <TypePills
          value={collectorIdType}
          onChange={setCollectorIdType}
          label={t.handover.idTypePlaceholder}
        />
      )}

      {policy.proxyAllowed ? (
        collectorOpen ? (
          <div className="grid gap-2">
            <Label htmlFor="collector-name">{t.handover.collectorLabel}</Label>
            <Input
              id="collector-name"
              value={collectorName}
              onChange={(e) => setCollectorName(e.target.value)}
              placeholder={t.handover.collectorHint}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCollectorOpen(true)}
            className="justify-self-start text-[13px] text-muted-foreground underline underline-offset-4"
          >
            {t.handover.someoneElse}
          </button>
        )
      ) : (
        <p className="text-xs text-muted-foreground">
          {t.handover.noProxy.replace("{carrier}", carrierLabel(carrier, t))}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!satisfied && missingItems.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t.handover.toComplete.replace("{items}", missingItems.join(" · "))}
        </p>
      )}

      <Button
        type="button"
        size="xl"
        className="w-full"
        disabled={!satisfied || isPending}
        onClick={() =>
          onConfirm({
            presentedCode: presentedCode.trim() || undefined,
            idChecked,
            idType: idChecked && idType !== "" ? idType : undefined,
            collectorName: collectorName.trim() || undefined,
            collectorIdChecked: collectorNamed && collectorIdChecked ? true : undefined,
            collectorIdType:
              collectorNamed && collectorIdChecked && collectorIdType !== ""
                ? collectorIdType
                : undefined,
            override: override || undefined,
            overrideReason: override ? overrideReason.trim() : undefined,
          })
        }
      >
        {isPending
          ? t.handover.saving
          : satisfied
            ? t.handover.handOver
            : t.handover.verifyToHandOver}
      </Button>

      {/* Escape hatch for the customer the policy would strand (dead phone,
          lost code). Admin-only, a quiet link per the design — loud in the
          audit trail, reason mandatory. */}
      {canOverride && (
        <div className="grid justify-items-center gap-2">
          <button
            type="button"
            onClick={() => setOverride(!override)}
            className="text-[13px] text-muted-foreground underline underline-offset-4"
          >
            {t.handover.overrideOpen}
          </button>
          {override && (
            <div className="grid w-full gap-1">
              <Input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t.handover.overrideReason}
                aria-label={t.handover.overrideReason}
              />
              <p className="text-xs text-muted-foreground">{t.handover.overrideHint}</p>
            </div>
          )}
        </div>
      )}

      {onDiscard && (
        <Button
          type="button"
          variant="ghost"
          onClick={onDiscard}
          disabled={isPending}
          className="justify-self-center text-muted-foreground"
        >
          {t.handover.discard}
        </Button>
      )}
    </div>
  );
}
