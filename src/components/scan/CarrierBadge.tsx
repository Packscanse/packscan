"use client";

import {
  CARRIER_CODES,
  CARRIER_LABELS,
  type CarrierCode,
  type Confidence,
  type DetectionResult,
} from "@/lib/carriers";
import { useT } from "@/components/i18n/I18nProvider";
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
  const t = useT();
  const top = candidates[0];
  const distinctCarriers = new Set(candidates.map((c) => c.carrier));
  const confidenceLabel: Record<Confidence, string> = {
    high: t.scan.confidenceHigh,
    medium: t.scan.confidenceMedium,
    low: t.scan.confidenceLow,
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor="carrier-select">{t.scan.carrier}</Label>
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
          ? t.scan.autoDetected
              .replace("{carrier}", CARRIER_LABELS[top.carrier])
              .replace("{confidence}", confidenceLabel[top.confidence])
          : t.scan.noCarrierPattern}
        {distinctCarriers.size > 1 &&
          ` ${t.scan.multipleCarriers.replace(
            "{carriers}",
            [...distinctCarriers].map((c) => CARRIER_LABELS[c]).join(", "),
          )}`}
      </p>
    </div>
  );
}
