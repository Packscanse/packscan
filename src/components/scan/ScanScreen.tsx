"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { IdType, ScanInputMethod } from "@prisma/client";
import { ArrowLeft, CheckCircle2, PackagePlus, ScanLine } from "lucide-react";
import {
  carrierLabel,
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
import { formatDuration } from "@/lib/duration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShelfChip, ShelfPoster } from "@/components/shelf/ShelfBlock";
import { CameraScanner } from "./CameraScanner";
import { HardwareScannerInput } from "./HardwareScannerInput";
import { FlowPicker } from "./FlowPicker";
import { CarrierBadge } from "./CarrierBadge";
import { HandoverPanel } from "./HandoverPanel";
import { ScanResultCard } from "./ScanResultCard";
import { DoneScreen } from "./DoneScreen";
import { useOfflineScanQueue } from "./useOfflineScanQueue";
import { useT } from "@/components/i18n/I18nProvider";

interface PendingScan {
  code: string;
  method: ScanInputMethod;
  candidates: DetectionResult[];
}

interface VisitParcel extends HandoverContext {
  /** Its label was scanned during this visit — only then is it handed over. */
  scannedOff: boolean;
  done: boolean;
}

/**
 * One customer's pickup: the scanned parcel plus everything else waiting for
 * them. Verification chains parcel by parcel; the physical ID check (and the
 * collector's name) carries over so it happens once per visit, not per parcel.
 */
interface Visit {
  parcels: VisitParcel[];
  activeId: string | null;
  inputMethod: ScanInputMethod;
  /** When the first label was scanned — the done screen brags about it. */
  startedAt: number;
  idChecked: boolean;
  idType: IdType | "";
  collectorName: string;
  collectorIdChecked: boolean;
  collectorIdType: IdType | "";
}

/** The loud success state after the last parcel of a pickup. */
interface VisitDone {
  count: number;
  shelves: string[];
  seconds: number;
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
  // Set while a pickup's handover verification is in progress.
  const [visit, setVisit] = useState<Visit | null>(null);
  const [visitDone, setVisitDone] = useState<VisitDone | null>(null);
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
  const scanningNow = !pendingScan && !visit && !visitDone && !result;
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
      setVisit(singleParcelVisit(res.handover, method));
      setHandoverError(null);
      return;
    }
    setResult(res);
  }

  function singleParcelVisit(context: HandoverContext, method: ScanInputMethod): Visit {
    return {
      parcels: [{ ...context, scannedOff: true, done: false }],
      activeId: context.packageId,
      inputMethod: method,
      startedAt: Date.now(),
      idChecked: false,
      idType: "",
      collectorName: "",
      collectorIdChecked: false,
      collectorIdType: "",
    };
  }

  /** A visit parcel's label was scanned: check it off (and activate if idle). */
  function captureVisitParcel(normalizedTracking: string) {
    setVisit((v) => {
      if (!v) return v;
      const target = v.parcels.find((p) => p.trackingNumber === normalizedTracking);
      if (!target || target.done) return v;
      return {
        ...v,
        parcels: v.parcels.map((p) =>
          p.packageId === target.packageId ? { ...p, scannedOff: true } : p
        ),
        activeId: v.activeId ?? target.packageId,
      };
    });
  }

  function discardVisit() {
    setVisit(null);
    setHandoverError(null);
  }

  function finishVisit(parcels: VisitParcel[], startedAt: number) {
    const doneParcels = parcels.filter((p) => p.done);
    setVisitDone({
      count: doneParcels.length,
      shelves: [...new Set(doneParcels.map((p) => p.shelfLocation).filter((s): s is string => !!s))],
      seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    });
    setVisit(null);
    setResult(null);
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
    // Already on the shelf? Straight to handover — no registration detour —
    // together with everything else waiting for the same customer.
    void lookupScan(code)
      .then(({ match, handover: existing, companions }) => {
        if (lastDetection.current.code !== code) return;
        if (existing && flowRef.current === "INBOUND_PICKUP") {
          setPendingScan(null);
          setVisit({
            parcels: [
              { ...existing, scannedOff: true, done: false },
              ...companions.map((c) => ({ ...c, scannedOff: false, done: false })),
            ],
            activeId: existing.packageId,
            inputMethod: method,
            startedAt: Date.now(),
            idChecked: false,
            idType: "",
            collectorName: "",
            collectorIdChecked: false,
            collectorIdType: "",
          });
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
    if (!visit?.activeId) return;
    const active = visit.parcels.find((p) => p.packageId === visit.activeId);
    if (!active) return;
    startTransition(async () => {
      const res = await submitScan({
        trackingNumber: active.trackingNumber,
        flow,
        carrier: active.carrier,
        carrierManual: false,
        inputMethod: visit.inputMethod,
        verification,
      });
      if ("queued" in res) {
        setResult(null);
        setVisit(null);
        setHandoverError(null);
        return;
      }
      if (!res.ok) {
        // Verification rejected (wrong code, missing ID…) or the parcel was
        // just updated elsewhere — stay on the step and say why.
        setHandoverError(res.error);
        return;
      }
      setHandoverError(null);
      const parcels = visit.parcels.map((p) =>
        p.packageId === active.packageId ? { ...p, done: true } : p
      );
      const nextActive = parcels.find((p) => p.scannedOff && !p.done)?.packageId ?? null;
      if (nextActive === null && !parcels.some((p) => !p.done)) {
        // Every parcel handed over — the loud done screen, then the camera.
        finishVisit(parcels, visit.startedAt);
        return;
      }
      // Chain to the next scanned-off parcel (or wait armed for more labels);
      // the ID check carries over.
      setResult(null);
      setVisit({
        ...visit,
        parcels,
        activeId: nextActive,
        idChecked: verification.idChecked,
        idType: verification.idType ?? "",
        collectorName: verification.collectorName ?? "",
        collectorIdChecked: verification.collectorIdChecked ?? false,
        collectorIdType: verification.collectorIdType ?? "",
      });
    });
  }

  function discardScan() {
    setPendingScan(null);
  }

  // Rapid mode keeps the scanner armed even while a result is showing.
  const scanning = !pendingScan && !visit && !visitDone && (!result || (rapid && rapidEligible));
  const activeParcel = visit?.parcels.find((p) => p.packageId === visit.activeId) ?? null;
  const doneCount = visit?.parcels.filter((p) => p.done).length ?? 0;

  return (
    <div className="grid gap-4">
      {queuedCount > 0 && (
        <p className="rounded-[16px] border border-warn/40 bg-warn/10 p-3 text-sm">
          {t.scan.offlineBanner.replace("{count}", String(queuedCount))}
        </p>
      )}
      {syncNotices.length > 0 && (
        <div className="grid gap-1 rounded-[16px] border border-danger-border bg-danger-surface p-3 text-sm">
          <p className="font-medium">{t.scan.syncTitle}</p>
          {syncNotices.map((notice, i) => (
            <p key={i}>{notice}</p>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={dismissNotices} className="justify-self-start">
            {t.scan.dismiss}
          </Button>
        </div>
      )}

      {scanning && (
        <div className="grid gap-3">
          {/* The viewfinder: the whole card is the "start camera" target. */}
          <div className="relative overflow-hidden rounded-[24px] border bg-card dark:border-border dark:bg-gradient-to-b dark:from-[#1b1b20] dark:to-[#141417]">
            {/* Hardware scanner: invisible, always armed while scanning. */}
            <HardwareScannerInput onDetect={(code) => handleCode(code, "HARDWARE_SCANNER")} />
            {cameraOn ? (
              <div className="grid gap-3 p-4">
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
              <button
                type="button"
                onClick={startCamera}
                className="grid w-full place-items-center gap-6 px-6 py-14 text-center outline-none"
              >
                <span className="grid size-44 place-items-center rounded-[20px] border-2 border-dashed border-dash">
                  <ScanLine className="size-14 text-primary" />
                </span>
                <span className="grid gap-1">
                  <span className="text-xl font-semibold">{t.scan.pointAnywhere}</span>
                  <span className="text-sm text-muted-foreground">{t.scan.pointAnywhereHint}</span>
                </span>
              </button>
            )}
            {cameraError && <p className="px-6 pb-4 text-sm text-destructive">{cameraError}</p>}
          </div>

          <p className="hidden text-xs text-muted-foreground sm:block">{t.scan.scannerReady}</p>
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
              className="rounded-full px-4"
            />
            <Button type="submit" variant="outline" disabled={manualValue.trim().length < 6}>
              {t.scan.use}
            </Button>
          </form>
        </div>
      )}

      {(scanning || pendingScan) && <FlowPicker value={flow} onChange={setFlow} />}

      {scanning && rapidEligible && (
        <div className="flex flex-wrap items-center gap-3 rounded-[16px] border p-3">
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
              <p className="text-sm text-ok-strong dark:text-ok">{t.scan.preAdviceMatched}</p>
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

      {visit && (
        <div className="grid gap-4">
          {/* Back to the camera + the raw tracking for reference. */}
          <div className="flex items-center justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={discardVisit}
              className="flex items-center gap-1 text-muted-foreground"
            >
              <ArrowLeft className="size-4" />
              {t.scan.title}
            </button>
            {activeParcel && (
              <span className="truncate font-mono text-[13px] text-muted-foreground">
                {activeParcel.trackingNumber}
              </span>
            )}
          </div>

          {activeParcel ? (
            <>
              <ShelfPoster code={activeParcel.shelfLocation} eyebrow={t.handover.shelf}>
                {activeParcel.customerName && (
                  <span className="text-lg font-semibold">{activeParcel.customerName}</span>
                )}
                <span className="text-[13px] opacity-80">
                  {carrierLabel(activeParcel.carrier, t)}
                  {" · "}
                  {t.handover.onShelfFor.replace(
                    "{duration}",
                    formatDuration(Date.now() - new Date(activeParcel.arrivedAt).getTime())
                  )}
                  {visit.parcels.length > 1 &&
                    ` · ${t.handover.parcelOf
                      .replace("{n}", String(doneCount + 1))
                      .replace("{count}", String(visit.parcels.length))}`}
                </span>
              </ShelfPoster>

              {/* The rest of the visit: scanned-off parcels queue up, the
                  others invite a label scan (dashed, per the design). */}
              {visit.parcels
                .filter((p) => p.packageId !== visit.activeId)
                .map((p) =>
                  p.done || p.scannedOff ? (
                    <div
                      key={p.packageId}
                      className="flex items-center gap-3 rounded-[16px] bg-card px-4 py-3 text-sm"
                    >
                      <CheckCircle2 className="size-5 shrink-0 text-ok" />
                      <span className="grid gap-0.5">
                        <span className="font-medium">
                          {p.done ? t.status.PICKED_UP : t.handover.included}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.trackingNumber}
                        </span>
                      </span>
                      <ShelfChip code={p.shelfLocation} size="desktop" className="ml-auto" />
                    </div>
                  ) : (
                    <div
                      key={p.packageId}
                      className="flex items-center gap-3 rounded-[16px] border border-dashed border-dash px-4 py-3 text-sm"
                    >
                      <PackagePlus className="size-5 shrink-0 text-muted-foreground" />
                      <span className="grid gap-0.5">
                        <span className="font-medium">
                          {p.customerName ?? p.trackingNumber}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t.handover.scanToInclude}
                        </span>
                      </span>
                      <ShelfChip code={p.shelfLocation} size="desktop" className="ml-auto" />
                    </div>
                  )
                )}

              <HandoverPanel
                key={activeParcel.packageId}
                carrier={activeParcel.carrier}
                customerName={activeParcel.customerName}
                trackingNumber={activeParcel.trackingNumber}
                shelfLocation={activeParcel.shelfLocation}
                canOverride={canOverride}
                isPending={isPending}
                error={handoverError}
                initialIdChecked={visit.idChecked}
                initialIdType={visit.idType}
                initialCollectorName={visit.collectorName}
                initialCollectorIdChecked={visit.collectorIdChecked}
                initialCollectorIdType={visit.collectorIdType}
                visitTrackings={visit.parcels
                  .filter((p) => p.packageId !== activeParcel.packageId && !p.done)
                  .map((p) => p.trackingNumber)}
                onVisitScan={captureVisitParcel}
                onConfirm={confirmHandover}
                showContext={false}
              />
            </>
          ) : (
            <div className="grid gap-3">
              {/* Still armed: scanning a remaining label resumes the visit. */}
              <HardwareScannerInput
                onDetect={(code) => captureVisitParcel(normalizeTrackingNumber(code))}
              />
              <div className="flex items-center gap-3 rounded-[16px] bg-card px-4 py-3 text-sm">
                <CheckCircle2 className="size-5 shrink-0 text-ok" />
                <span>{t.handover.visitDone.replace("{count}", String(doneCount))}</span>
              </div>
              {visit.parcels.some((p) => !p.done) && (
                <p className="text-sm text-muted-foreground">
                  {t.handover.visitLeft.replace(
                    "{count}",
                    String(visit.parcels.filter((p) => !p.done).length)
                  )}
                </p>
              )}
              <Button type="button" size="xl" variant="outline" onClick={discardVisit}>
                {t.handover.nextCustomer}
              </Button>
            </div>
          )}
        </div>
      )}

      {visitDone && (
        <DoneScreen
          title={
            visitDone.count > 1
              ? t.handover.visitDone.replace("{count}", String(visitDone.count))
              : t.handover.doneTitle
          }
          meta={[
            visitDone.shelves.length > 0
              ? t.handover.doneShelfFreed.replace("{shelves}", visitDone.shelves.join(", "))
              : null,
            t.handover.doneVisitSeconds.replace("{seconds}", String(visitDone.seconds)),
          ]
            .filter(Boolean)
            .join("\n")}
          actionLabel={t.handover.nextCustomer}
          onDone={() => setVisitDone(null)}
        />
      )}

      {result && <ScanResultCard result={result} onNext={() => setResult(null)} />}
    </div>
  );
}
