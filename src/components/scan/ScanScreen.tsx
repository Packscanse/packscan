"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import type { ScanInputMethod } from "@prisma/client";
import {
  detectCarrierCandidates,
  normalizeTrackingNumber,
  type CarrierCode,
  type DetectionResult,
} from "@/lib/carriers";
import { FLOW_LABELS, type ScanFlow } from "@/lib/status";
import { processScan, type ProcessScanResult } from "@/actions/scan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CameraScanner } from "./CameraScanner";
import { HardwareScannerInput } from "./HardwareScannerInput";
import { FlowPicker } from "./FlowPicker";
import { CarrierBadge } from "./CarrierBadge";
import { ScanResultCard } from "./ScanResultCard";

interface PendingScan {
  code: string;
  method: ScanInputMethod;
  candidates: DetectionResult[];
}

const SAME_CODE_DEBOUNCE_MS = 2000;

export function ScanScreen() {
  const [flow, setFlow] = useState<ScanFlow>("INBOUND_PICKUP");
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [carrier, setCarrier] = useState<CarrierCode>("UNKNOWN");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", notes: "" });
  const [result, setResult] = useState<ProcessScanResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastDetection = useRef({ code: "", at: 0 });

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
  }, []);

  function confirmScan() {
    if (!pendingScan) return;
    const autoTop = pendingScan.candidates[0]?.carrier ?? "UNKNOWN";
    startTransition(async () => {
      const res = await processScan({
        trackingNumber: pendingScan.code,
        flow,
        carrier,
        carrierManual: carrier !== autoTop,
        inputMethod: pendingScan.method,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        notes: customer.notes,
      });
      setResult(res);
      setPendingScan(null);
      setCustomer({ name: "", phone: "", email: "", notes: "" });
    });
  }

  function discardScan() {
    setPendingScan(null);
  }

  const scanning = !pendingScan && !result;

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">Scan</h1>
        <FlowPicker value={flow} onChange={setFlow} />
      </div>

      {scanning && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Scan a package — {FLOW_LABELS[flow]}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Hardware scanner: invisible, always armed while scanning. */}
            <HardwareScannerInput onDetect={(code) => handleCode(code, "HARDWARE_SCANNER")} />
            <p className="text-sm text-muted-foreground">
              Hardware scanner ready — just scan a label. Or:
            </p>

            {cameraOn ? (
              <div className="grid gap-2">
                <CameraScanner
                  onDetect={(code) => handleCode(code, "CAMERA")}
                  onError={(message) => {
                    setCameraError(message);
                    setCameraOn(false);
                  }}
                />
                <Button type="button" variant="outline" onClick={() => setCameraOn(false)}>
                  Stop camera
                </Button>
              </div>
            ) : (
              <div className="grid gap-2">
                <Button type="button" variant="secondary" onClick={() => { setCameraError(null); setCameraOn(true); }}>
                  Start camera scanning
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
                placeholder="Enter tracking number manually"
                aria-label="Manual tracking number entry"
              />
              <Button type="submit" variant="outline" disabled={manualValue.trim().length < 6}>
                Use
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {pendingScan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confirm scan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1">
              <p className="font-mono text-lg">{pendingScan.code}</p>
              <p className="text-xs text-muted-foreground">{FLOW_LABELS[flow]}</p>
            </div>

            <CarrierBadge
              candidates={pendingScan.candidates}
              value={carrier}
              onChange={setCarrier}
            />

            {flow === "INBOUND_PICKUP" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="customer-name">Customer name</Label>
                  <Input
                    id="customer-name"
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="customer-phone">Phone (SMS notification)</Label>
                  <Input
                    id="customer-phone"
                    type="tel"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="customer-email">Email (fallback notification)</Label>
                  <Input
                    id="customer-email"
                    type="email"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="customer-notes">Notes</Label>
                  <Input
                    id="customer-notes"
                    value={customer.notes}
                    onChange={(e) => setCustomer({ ...customer, notes: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" onClick={confirmScan} disabled={isPending}>
                {isPending ? "Saving…" : "Confirm scan"}
              </Button>
              <Button type="button" variant="outline" onClick={discardScan} disabled={isPending}>
                Discard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && <ScanResultCard result={result} onNext={() => setResult(null)} />}
    </div>
  );
}
