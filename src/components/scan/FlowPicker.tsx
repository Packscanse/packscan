"use client";

import { Button } from "@/components/ui/button";
import { FLOW_LABELS, SCAN_FLOWS, type ScanFlow } from "@/lib/status";

export function FlowPicker({
  value,
  onChange,
}: {
  value: ScanFlow;
  onChange: (flow: ScanFlow) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {SCAN_FLOWS.map((flow) => (
        <Button
          key={flow}
          type="button"
          variant={value === flow ? "default" : "outline"}
          onClick={() => onChange(flow)}
          className="h-auto justify-start px-3 py-2 text-left sm:justify-center sm:text-center"
        >
          {FLOW_LABELS[flow]}
        </Button>
      ))}
    </div>
  );
}
