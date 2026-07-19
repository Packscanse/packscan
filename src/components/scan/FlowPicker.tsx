"use client";

import { Button } from "@/components/ui/button";
import { SCAN_FLOWS, type ScanFlow } from "@/lib/status";
import { useT } from "@/components/i18n/I18nProvider";

export function FlowPicker({
  value,
  onChange,
}: {
  value: ScanFlow;
  onChange: (flow: ScanFlow) => void;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-3 gap-2">
      {SCAN_FLOWS.map((flow) => (
        <Button
          key={flow}
          type="button"
          variant={value === flow ? "default" : "outline"}
          onClick={() => onChange(flow)}
          className="h-12 px-2 sm:h-auto sm:px-3 sm:py-2"
        >
          <span className="sm:hidden">{t.flowShort[flow]}</span>
          <span className="hidden sm:inline">{t.flow[flow]}</span>
        </Button>
      ))}
    </div>
  );
}
