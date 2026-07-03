"use client";

import { useState } from "react";
import type { IdType } from "@prisma/client";
import { CARRIER_LABELS, getPickupPolicy, type CarrierCode } from "@/lib/carriers";
import { ID_TYPES, ID_TYPE_LABELS, type HandoverInput } from "@/lib/verification";
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
  isPending,
  error,
  onConfirm,
  onDiscard,
}: {
  carrier: CarrierCode;
  customerName: string | null;
  isPending: boolean;
  error: string | null;
  onConfirm: (verification: HandoverInput) => void;
  onDiscard?: () => void;
}) {
  const policy = getPickupPolicy(carrier);
  const [presentedCode, setPresentedCode] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [idChecked, setIdChecked] = useState(false);
  const [idType, setIdType] = useState<IdType | "">("");
  const [collectorName, setCollectorName] = useState("");

  const codeRequired = policy.code === "required";
  const showCode = policy.code !== "none";

  const satisfied =
    (!codeRequired || presentedCode.trim().length > 0) &&
    (policy.idCheck !== "required" || idChecked) &&
    (!idChecked || idType !== "");

  function captureCode(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setPresentedCode(code);
    setCameraOn(false);
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-sm">
        <p>
          <span className="text-muted-foreground">Carrier: </span>
          {CARRIER_LABELS[carrier]}
        </p>
        {customerName && (
          <p>
            <span className="text-muted-foreground">Addressed to: </span>
            {customerName}
          </p>
        )}
      </div>

      {showCode && (
        <div className="grid gap-2">
          <Label htmlFor="presented-code">
            Customer&rsquo;s pickup code — scan the QR in their {CARRIER_LABELS[carrier]} app
            {codeRequired ? "" : " (if they have one)"}
          </Label>
          {/* Armed for scanning the customer's phone screen. */}
          <HardwareScannerInput onDetect={captureCode} />
          {presentedCode ? (
            <div className="flex items-center gap-2">
              <p className="break-all font-mono text-sm">{presentedCode}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPresentedCode("")}>
                Clear
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Hardware scanner ready — scan the customer&rsquo;s screen. Or:
              </p>
              {cameraOn ? (
                <div className="grid gap-2">
                  <CameraScanner
                    onDetect={captureCode}
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setCameraError(null);
                      setCameraOn(true);
                    }}
                  >
                    Scan with camera
                  </Button>
                  <Input
                    id="presented-code"
                    className="w-48"
                    placeholder="…or type the code"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        captureCode(e.currentTarget.value);
                      }
                    }}
                    onBlur={(e) => captureCode(e.currentTarget.value)}
                  />
                </div>
              )}
              {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}
            </>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={idChecked}
            onChange={(e) => setIdChecked(e.target.checked)}
            className="size-4 accent-primary"
          />
          Photo ID checked{policy.idCheck === "required" ? " (required)" : ""}
        </label>
        {idChecked && (
          <Select value={idType} onValueChange={(v) => setIdType(v as IdType)}>
            <SelectTrigger aria-label="Type of ID checked" className="w-full">
              <SelectValue placeholder="Type of ID checked" />
            </SelectTrigger>
            <SelectContent>
              {ID_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ID_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {policy.proxyAllowed ? (
        <div className="grid gap-2">
          <Label htmlFor="collector-name">Collected by someone else? Their name</Label>
          <Input
            id="collector-name"
            value={collectorName}
            onChange={(e) => setCollectorName(e.target.value)}
            placeholder="Leave empty when the addressee collects"
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {CARRIER_LABELS[carrier]} requires the addressee to collect in person.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!satisfied || isPending}
          onClick={() =>
            onConfirm({
              presentedCode: presentedCode.trim() || undefined,
              idChecked,
              idType: idChecked && idType !== "" ? idType : undefined,
              collectorName: collectorName.trim() || undefined,
            })
          }
        >
          {isPending ? "Saving…" : "Confirm handover"}
        </Button>
        {onDiscard && (
          <Button type="button" variant="outline" onClick={onDiscard} disabled={isPending}>
            Discard
          </Button>
        )}
      </div>
    </div>
  );
}
