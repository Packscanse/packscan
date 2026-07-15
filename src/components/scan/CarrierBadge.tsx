"use client";

import {
  CARRIER_CODES,
  CARRIER_LABELS,
  type CarrierCode,
  type DetectionResult,
} from "@/lib/carriers";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_CARRIERS: CarrierCode[] = [...CARRIER_CODES, "UNKNOWN"];

/**
 * Detected carrier with an always-available manual override — never a
 * failure-only fallback, per the product requirement.
 */
export function CarrierBadge({
  candidates,
  value,
  onChange,
}: {
  candidates: DetectionResult[];
  value: CarrierCode;
  onChange: (carrier: CarrierCode) => void;
}) {
  const top = candidates[0];
  const distinctCarriers = new Set(candidates.map((c) => c.carrier));

  return (
    <div className="grid gap-2">
      <Label htmlFor="carrier-select">Carrier</Label>
      <Select value={value} onValueChange={(v) => onChange(v as CarrierCode)}>
        <SelectTrigger id="carrier-select" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ALL_CARRIERS.map((carrier) => (
            <SelectItem key={carrier} value={carrier}>
              {CARRIER_LABELS[carrier]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {top
          ? `Auto-detected ${CARRIER_LABELS[top.carrier]} (${top.confidence} confidence)`
          : "No carrier pattern recognized — select manually."}
        {distinctCarriers.size > 1 &&
          ` Multiple carriers match this format (${[...distinctCarriers]
            .map((c) => CARRIER_LABELS[c])
            .join(", ")}) — please verify.`}
      </p>
    </div>
  );
}
