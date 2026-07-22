"use client";

import { SCAN_FLOWS, type ScanFlow } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/I18nProvider";

/** Shelf First mode switch: a segmented pill track, active segment in brand. */
export function FlowPicker({
  value,
  onChange,
}: {
  value: ScanFlow;
  onChange: (flow: ScanFlow) => void;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-3 gap-1 rounded-full bg-card p-1">
      {SCAN_FLOWS.map((flow) => (
        <button
          key={flow}
          type="button"
          aria-pressed={value === flow}
          onClick={() => onChange(flow)}
          className={cn(
            "h-11 rounded-full px-2 text-sm font-semibold transition-colors",
            value === flow
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="sm:hidden">{t.flowShort[flow]}</span>
          <span className="hidden sm:inline">{t.flow[flow]}</span>
        </button>
      ))}
    </div>
  );
}
