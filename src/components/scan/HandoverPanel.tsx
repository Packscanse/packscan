"use client";

import { useState } from "react";
import type { IdType } from "@prisma/client";
import {
  CARRIER_LABELS,
  getPickupPolicy,
  normalizeTrackingNumber,
  type CarrierCode,
} from "@/lib/carriers";
import { ID_TYPES, classifyHandoverScan, type HandoverInput } from "@/lib/verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/components/i18n/I18nProvider";
import { CameraScanner } from "./CameraScanner";
import { HardwareScannerInput } from "./HardwareScannerInput";

/**
 * The carrier-policy-driven verification checklist shown before a pickup can
 * be completed. The pickup code is whatever the customer presents in the
 * carrier's own app — scanned off their phone screen (hardware scanner or
 * camera) or typed. Client-side gating is a convenience; the server
 * re-validates via checkHandover.
 */
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
  visitTrackings,
  onVisitScan,
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
  /** Tracking numbers of the visit's other parcels: scanning one of their
      labels checks it off instead of being mistaken for a pickup code. */
  visitTrackings?: string[];
  onVisitScan?: (trackingNumber: string) => void;
}) {
  const t = useT();
  const policy = getPickupPolicy(carrier);
  const [presentedCode, setPresentedCode] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanWarning, setScanWarning] = useState<string | null>(null);
  const [idChecked, setIdChecked] = useState(initialIdChecked);
  const [idType, setIdType] = useState<IdType | "">(initialIdType);
  const [idScanned, setIdScanned] = useState(false);
  const [collectorName, setCollectorName] = useState(initialCollectorName);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const codeRequired = policy.code === "required";
  const showCode = policy.code !== "none";

  const policySatisfied =
    (!codeRequired || presentedCode.trim().length > 0) &&
    (policy.idCheck !== "required" || idChecked) &&
    (!idChecked || idType !== "");
  const satisfied = override
    ? overrideReason.trim().length >= 3 && (!idChecked || idType !== "")
    : policySatisfied;

  // A disabled button must say why: list exactly what is still missing.
  const missingItems = (
    override
      ? [
          overrideReason.trim().length < 3 ? t.handover.needReason : null,
          idChecked && idType === "" ? t.handover.needIdType : null,
        ]
      : [
          codeRequired && presentedCode.trim().length === 0 ? t.handover.needCode : null,
          policy.idCheck === "required" && !idChecked ? t.handover.needId : null,
          idChecked && idType === "" ? t.handover.needIdType : null,
        ]
  ).filter((item): item is string => item !== null);

  // One pipeline for every scan during handover: an ID document only flips
  // the ID-checked flag (its contents are discarded, never stored); anything
  // else is the presented pickup code.
  function captureScan(raw: string) {
    if (!raw.trim()) return;
    const scan = classifyHandoverScan(raw);
    if (scan.kind === "ID_DOCUMENT") {
      setIdChecked(true);
      setIdType(scan.idType);
      setIdScanned(true);
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
    setCameraOn(false);
    setScanWarning(null);
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-sm">
        <p>
          <span className="text-muted-foreground">{t.handover.carrier}: </span>
          {CARRIER_LABELS[carrier]}
        </p>
        {customerName && (
          <p>
            <span className="text-muted-foreground">{t.handover.addressedTo}: </span>
            {customerName}
          </p>
        )}
        {shelfLocation && (
          <p className="text-base font-semibold">
            <span className="font-normal text-muted-foreground">{t.handover.shelf}: </span>
            {shelfLocation}
          </p>
        )}
      </div>

      {/* Always armed: IDs are scannable even for carriers with no code scheme. */}
      <HardwareScannerInput onDetect={captureScan} />

      {showCode && (
        <div className="grid gap-2">
          <Label htmlFor="presented-code">
            {t.handover.scanCodeLabel
              .replace("{carrier}", CARRIER_LABELS[carrier])
              .replace("{optional}", codeRequired ? "" : t.handover.optionalSuffix)}
          </Label>
          {presentedCode ? (
            <div className="flex items-center gap-2">
              <p className="break-all font-mono text-sm">{presentedCode}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPresentedCode("")}>
                {t.handover.clear}
              </Button>
            </div>
          ) : (
            <>
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
                    className="w-full sm:w-48"
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
            </>
          )}
          {scanWarning && <p className="text-sm text-destructive">{scanWarning}</p>}
        </div>
      )}

      <div className="grid gap-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={idChecked}
            onChange={(e) => {
              setIdChecked(e.target.checked);
              if (!e.target.checked) setIdScanned(false);
            }}
            className="size-4 accent-primary"
          />
          {t.handover.idChecked}
          {policy.idCheck === "required" ? ` ${t.handover.required}` : ""}
        </label>
        {idScanned && <p className="text-xs text-muted-foreground">{t.handover.idScanned}</p>}
        {idChecked && (
          <Select value={idType} onValueChange={(v) => setIdType(v as IdType)}>
            <SelectTrigger aria-label={t.handover.idTypePlaceholder} className="w-full">
              <SelectValue placeholder={t.handover.idTypePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {ID_TYPES.map((idTypeOption) => (
                <SelectItem key={idTypeOption} value={idTypeOption}>
                  {t.idType[idTypeOption]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {policy.proxyAllowed ? (
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
        <p className="text-xs text-muted-foreground">
          {t.handover.noProxy.replace("{carrier}", CARRIER_LABELS[carrier])}
        </p>
      )}

      {/* Escape hatch for the customer the policy would strand (dead phone,
          lost code). Admin-only, loud in the audit trail, reason mandatory. */}
      <div className="grid gap-2 rounded-md border border-dashed p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={override}
            disabled={!canOverride}
            onChange={(e) => setOverride(e.target.checked)}
            className="size-4 accent-primary disabled:opacity-50"
          />
          {t.handover.overrideLabel}
        </label>
        {!canOverride && (
          <p className="text-xs text-muted-foreground">{t.handover.overrideNeedsAdmin}</p>
        )}
        {override && (
          <div className="grid gap-1">
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!satisfied && missingItems.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t.handover.toComplete.replace("{items}", missingItems.join(" · "))}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="lg"
          className="sm:h-8 sm:text-sm"
          disabled={!satisfied || isPending}
          onClick={() =>
            onConfirm({
              presentedCode: presentedCode.trim() || undefined,
              idChecked,
              idType: idChecked && idType !== "" ? idType : undefined,
              collectorName: collectorName.trim() || undefined,
              override: override || undefined,
              overrideReason: override ? overrideReason.trim() : undefined,
            })
          }
        >
          {isPending ? t.handover.saving : t.handover.confirm}
        </Button>
        {onDiscard && (
          <Button type="button" variant="outline" onClick={onDiscard} disabled={isPending}>
            {t.handover.discard}
          </Button>
        )}
      </div>
    </div>
  );
}
