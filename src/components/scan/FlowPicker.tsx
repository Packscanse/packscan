"use client";

import { Button } from "@/components/ui/button";
import { FLOW_LABELS, FLOW_LABELS_SHORT, SCAN_FLOWS, type ScanFlow } from "@/lib/status";

export function FlowPicker({
  value,
  onChange,
}: {
  value: ScanFlow;
  onChange: (flow: ScanFlow) => void;
}) {
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
          <span className="sm:hidden">{FLOW_LABELS_SHORT[flow]}</span>
          <span className="hidden sm:inline">{FLOW_LABELS[flow]}</span>
        </Button>
      ))}
    </div>
  );
}
