"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ScanInputMethod } from "@prisma/client";
import {
  detectCarrierCandidates,
  normalizeTrackingNumber,
  type CarrierCode,
  type DetectionResult,
} from "@/lib/carriers";
import { FLOW_DIRECTION, type ScanFlow } from "@/lib/status";
import type { HandoverInput } from "@/lib/verification";
import type { HandoverContext } from "@/lib/packages";
import { lookupScan, processScan } from "@/actions/scan";
import type { PreAdviceMatch, ProcessScanResult } from "@/lib/scan-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CameraScanner } from "./CameraScanner";
import { HardwareScannerInput } from "./HardwareScannerInput";
import { FlowPicker } from "./FlowPicker";
import { CarrierBadge } from "./CarrierBadge";
import { HandoverPanel } from "./HandoverPanel";
import { ScanResultCard } from "./ScanResultCard";
import { useOfflineScanQueue } from "./useOfflineScanQueue";
import { useT } from "@/components/i18n/I18nProvider";

interface PendingScan {
  code: string;
  method: ScanInputMethod;
  candidates: DetectionResult[];
}

const SAME_CODE_DEBOUNCE_MS = 2000;
// Remembered per device: a phone at the counter is camera-first.
const CAMERA_AUTO_KEY = "packscan-camera-auto";

export function ScanScreen({
  canOverride,
  sessionUserId,
}: {
  canOverride: boolean;
  sessionUserId: string;
}) {
  const t = useT();
  const [flow, setFlow] = useState<ScanFlow>("INBOUND_PICKUP");
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [carrier, setCarrier] = useState<CarrierCode>("UNKNOWN");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", notes: "", shelf: "" });
  const [preAdviceMatched, setPreAdviceMatched] = useState(false);
  const [result, setResult] = useState<ProcessScanResult | null>(null);
  // Set when the server demands handover verification to complete a pickup.
  const [handover, setHandover] = useState<(HandoverContext & { inputMethod: ScanInputMethod }) | null>(null);
  const [handoverError, setHandoverError] = useState<string | null>(null);
  // Rapid intake: auto-confirm announced / high-confidence parcels with a
  // sticky batch shelf — for the morning delivery, not the counter chat.
  const [rapid, setRapid] = useState(false);
  const [rapidShelf, setRapidShelf] = useState("");
  const [isPending, startTransition] = useTransition();
  const lastDetection = useRef({ code: "", at: 0 });
  const { queuedCount, syncNotices, enqueue, dismissNotices } = useOfflineScanQueue(sessionUserId);

  // handleCode is mount-stable; these refs feed it the current settings.
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const rapidRef = useRef(rapid);
  rapidRef.current = rapid;
  const rapidShelfRef = useRef(rapidShelf);
  rapidShelfRef.current = rapidShelf;

  const rapidEligible = FLOW_DIRECTION[flow] === "INBOUND";

  // Camera-first on devices where it was used before: reopen it whenever
  // the screen returns to the scanning state. Stopping it turns this off.
  const scanningNow = !pendingScan && !handover && !result;
  useEffect(() => {
    if (scanningNow && !cameraOn && window.localStorage.getItem(CAMERA_AUTO_KEY) === "1") {
      setCameraError(null);
      setCameraOn(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanningNow]);

  function startCamera() {
    window.localStorage.setItem(CAMERA_AUTO_KEY, "1");
    setCameraError(null);
    setCameraOn(true);
  }

  function stopCamera() {
    window.localStorage.removeItem(CAMERA_AUTO_KEY);
    setCameraOn(false);
  }

  /** Network failure ⇒ queue for background sync instead of losing the scan. */
  async function submitScan(
    input: Record<string, unknown> & { trackingNumber: string }
  ): Promise<ProcessScanResult | { queued: true }> {
    try {
      return await processScan(input);
    } catch {
      enqueue(input, input.trackingNumber);
      return { queued: true };
    }
  }

  /** Shared handling of a scan submission's outcome (queued/handover/result). */
  function applyOutcome(res: ProcessScanResult | { queued: true }, method: ScanInputMethod) {
    if ("queued" in res) {
      setResult(null); // the offline banner carries the message
      return;
    }
    if (!res.ok && res.code === "VERIFICATION_REQUIRED") {
      setHandover({ ...res.handover, inputMethod: method });
      setHandoverError(null);
      return;
    }
    setResult(res);
  }

  function autoConfirm(args: {
    code: string;
    method: ScanInputMethod;
    carrier: CarrierCode;
    match: PreAdviceMatch | null;
  }) {
    startTransition(async () => {
      const res = await submitScan({
        trackingNumber: args.code,
        flow: flowRef.current,
        carrier: args.carrier,
        carrierManual: false,
        inputMethod: args.method,
        customerName: args.match?.customerName ?? "",
        customerPhone: args.match?.customerPhone ?? "",
        customerEmail: args.match?.customerEmail ?? "",
        shelfLocation: rapidShelfRef.current,
      });
      setPendingScan(null);
      setCustomer({ name: "", phone: "", email: "", notes: "", shelf: "" });
      setPreAdviceMatched(false);
      applyOutcome(res, args.method);
    });
  }

  // Single pipeline for all three input methods.
  const handleCode = useCallback((raw: string, method: ScanInputMethod) => {
    const code = normalizeTrackingNumber(raw);
    if (code.length < 6) return;
    const now = Date.now();
    if (lastDetection.current.code === code && now - lastDetection.current.at < SAME_CODE_DEBOUNCE_MS) {
      return;
    }
    lastDetection.current = { code, at: now };
    const candidates = detectCarrierCandidates(code);
    setPendingScan({ code, method, candidates });
    setCarrier(candidates[0]?.carrier ?? "UNKNOWN");
    setResult(null);
    setPreAdviceMatched(false);
    // Announced parcel? Exact carrier + pre-filled recipient, no typing.
    // Already on the shelf? Straight to handover — no registration detour.
    void lookupScan(code)
      .then(({ match, handover: existing }) => {
        if (lastDetection.current.code !== code) return;
        if (existing && flowRef.current === "INBOUND_PICKUP") {
          setPendingScan(null);
          setHandover({ ...existing, inputMethod: method });
          setHandoverError(null);
          return;
        }
        if (match) {
          setCarrier(match.carrier);
          setCustomer((prev) => ({
            ...prev,
            name: match.customerName ?? prev.name,
            phone: match.customerPhone ?? prev.phone,
            email: match.customerEmail ?? prev.email,
          }));
          setPreAdviceMatched(true);
        }
        // Rapid intake: no confirm tap for parcels we can trust. Pickups
        // auto-confirm only when pre-advised — otherwise they'd register
        // with no contact info and nobody could notify the customer. The
        // log-only flow (no notification concern) also accepts unambiguous
        // high-confidence detections.
        const top = candidates[0];
        const trusted =
          match !== null ||
          (flowRef.current === "INBOUND_LOG" && top?.confidence === "high");
        if (rapidRef.current && FLOW_DIRECTION[flowRef.current] === "INBOUND" && trusted) {
          autoConfirm({ code, method, carrier: match?.carrier ?? top!.carrier, match });
        }
      })
      .catch(() => {
        // Pre-advice lookup offline: leave the confirm card for manual entry.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function confirmScan() {
    if (!pendingScan) return;
    const autoTop = pendingScan.candidates[0]?.carrier ?? "UNKNOWN";
    startTransition(async () => {
      const res = await submitScan({
        trackingNumber: pendingScan.code,
        flow,
        carrier,
        carrierManual: carrier !== autoTop,
        inputMethod: pendingScan.method,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        notes: customer.notes,
        shelfLocation: customer.shelf,
      });
      applyOutcome(res, pendingScan.method);
      setPendingScan(null);
      setCustomer({ name: "", phone: "", email: "", notes: "", shelf: "" });
      setPreAdviceMatched(false);
    });
  }

  function confirmHandover(verification: HandoverInput) {
    if (!handover) return;
    startTransition(async () => {
      const res = await submitScan({
        trackingNumber: handover.trackingNumber,
        flow,
        carrier: handover.carrier,
        carrierManual: false,
        inputMethod: handover.inputMethod,
        verification,
      });
      if ("queued" in res) {
        setResult(null);
        setHandover(null);
        setHandoverError(null);
        return;
      }
      if (!res.ok && res.code === undefined) {
        // Verification rejected (wrong code, missing ID…) — stay on the step.
        setHandoverError(res.error);
        return;
      }
      setResult(res.ok ? res : null);
      setHandover(null);
      setHandoverError(null);
    });
  }

  function discardScan() {
    setPendingScan(null);
  }

  // Rapid mode keeps the scanner armed even while a result is showing.
  const scanning = !pendingScan && !handover && (!result || (rapid && rapidEligible));

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">{t.scan.title}</h1>
        <FlowPicker value={flow} onChange={setFlow} />
      </div>

      {queuedCount > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t.scan.offlineBanner.replace("{count}", String(queuedCount))}
        </p>
      )}
      {syncNotices.length > 0 && (
        <div className="grid gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">{t.scan.syncTitle}</p>
          {syncNotices.map((notice, i) => (
            <p key={i}>{notice}</p>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={dismissNotices} className="justify-self-start">
            {t.scan.dismiss}
          </Button>
        </div>
      )}

      {rapidEligible && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={rapid}
              onChange={(e) => setRapid(e.target.checked)}
              className="size-4 accent-primary"
            />
            {t.scan.rapidIntake}
          </label>
          {rapid && (
            <>
              <Input
                value={rapidShelf}
                onChange={(e) => setRapidShelf(e.target.value)}
                placeholder={t.scan.batchShelf}
                aria-label={t.scan.batchShelf}
                className="h-11 w-40 md:h-8"
              />
              <p className="text-xs text-muted-foreground">{t.scan.rapidHint}</p>
            </>
          )}
        </div>
      )}

      {scanning && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t.scan.scanTitlePrefix} {t.flow[flow]}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Hardware scanner: invisible, always armed while scanning. */}
            <HardwareScannerInput onDetect={(code) => handleCode(code, "HARDWARE_SCANNER")} />
            <p className="hidden text-sm text-muted-foreground sm:block">{t.scan.scannerReady}</p>

            {cameraOn ? (
              <div className="grid gap-2">
                <CameraScanner
                  onDetect={(code) => handleCode(code, "CAMERA")}
                  onError={(message) => {
                    setCameraError(message);
                    setCameraOn(false);
                  }}
                />
                <Button type="button" variant="outline" onClick={stopCamera}>
                  {t.scan.stopCamera}
                </Button>
              </div>
            ) : (
              <div className="grid gap-2">
                <Button type="button" size="lg" variant="default" onClick={startCamera} className="sm:h-9">
                  {t.scan.scanWithCamera}
                </Button>
                {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}
              </div>
            )}

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleCode(manualValue, "MANUAL_ENTRY");
                setManualValue("");
              }}
            >
              <Input
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder={t.scan.manualPlaceholder}
                aria-label={t.scan.manualPlaceholder}
              />
              <Button type="submit" variant="outline" disabled={manualValue.trim().length < 6}>
                {t.scan.use}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {pendingScan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.scan.confirmScan}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1">
              <p className="font-mono text-lg">{pendingScan.code}</p>
              <p className="text-xs text-muted-foreground">{t.flow[flow]}</p>
            </div>

            <CarrierBadge
              candidates={pendingScan.candidates}
              value={carrier}
              onChange={setCarrier}
            />

            {preAdviceMatched && (
              <p className="text-sm text-green-700 dark:text-green-400">{t.scan.preAdviceMatched}</p>
            )}

            {/* Inbound pickup: the recipient. Outbound: the private sender dropping off. */}
            {(flow === "INBOUND_PICKUP" || flow === "OUTBOUND_HANDOFF") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="customer-name">
                    {flow === "OUTBOUND_HANDOFF" ? t.scan.senderName : t.scan.customerName}
                  </Label>
                  <Input
                    id="customer-name"
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="customer-phone">
                    {flow === "OUTBOUND_HANDOFF" ? t.scan.senderPhone : t.scan.customerPhone}
                  </Label>
                  <Input
                    id="customer-phone"
                    type="tel"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="customer-email">
                    {flow === "OUTBOUND_HANDOFF" ? t.scan.senderEmail : t.scan.customerEmail}
                  </Label>
                  <Input
                    id="customer-email"
                    type="email"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="customer-notes">{t.scan.notes}</Label>
                  <Input
                    id="customer-notes"
                    value={customer.notes}
                    onChange={(e) => setCustomer({ ...customer, notes: e.target.value })}
                  />
                </div>
                {flow === "INBOUND_PICKUP" && (
                  <div className="grid gap-2">
                    <Label htmlFor="shelf-location">{t.scan.shelfLocation}</Label>
                    <Input
                      id="shelf-location"
                      value={customer.shelf}
                      onChange={(e) => setCustomer({ ...customer, shelf: e.target.value })}
                      placeholder="e.g. A3"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" size="lg" onClick={confirmScan} disabled={isPending} className="sm:h-8 sm:text-sm">
                {isPending ? t.scan.saving : t.scan.confirmScan}
              </Button>
              <Button type="button" variant="outline" onClick={discardScan} disabled={isPending}>
                {t.scan.discard}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {handover && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t.handover.confirmTitle} <span className="font-mono">{handover.trackingNumber}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HandoverPanel
              carrier={handover.carrier}
              customerName={handover.customerName}
              trackingNumber={handover.trackingNumber}
              shelfLocation={handover.shelfLocation}
              canOverride={canOverride}
              isPending={isPending}
              error={handoverError}
              onConfirm={confirmHandover}
              onDiscard={() => {
                setHandover(null);
                setHandoverError(null);
              }}
            />
          </CardContent>
        </Card>
      )}

      {result && <ScanResultCard result={result} onNext={() => setResult(null)} />}
    </div>
  );
}
