"use client";

import Link from "next/link";
import type { ProcessScanResult } from "@/actions/scan";
import { STATUS_LABELS } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ScanResultCard({
  result,
  onNext,
}: {
  result: ProcessScanResult;
  onNext: () => void;
}) {
  return (
    <Card
      className={
        result.ok
          ? "border-green-600/40 bg-green-50 dark:bg-green-950/20"
          : "border-destructive/40 bg-destructive/5"
      }
    >
      <CardContent className="grid gap-3 pt-4">
        {result.ok ? (
          <>
            <p className="text-lg font-semibold sm:text-base sm:font-medium">
              {result.kind === "created"
                ? `✓ Registered — ${STATUS_LABELS[result.status]}`
                : `✓ ${result.fromStatus ? STATUS_LABELS[result.fromStatus] : ""} → ${STATUS_LABELS[result.status]}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {result.carrier} · <span className="font-mono">{result.trackingNumber}</span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button type="button" size="lg" onClick={onNext} className="sm:h-8 sm:text-sm">
                Scan next
              </Button>
              <Button asChild variant="outline">
                <Link href={`/packages/${result.packageId}`}>View package</Link>
              </Button>
              {result.direction === "OUTBOUND" && result.kind === "created" && (
                <Button asChild variant="outline">
                  <Link href={`/packages/${result.packageId}/receipt`}>Print drop-off receipt</Link>
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="font-medium text-destructive">{result.error}</p>
            <div className="flex flex-col gap-2 sm:block">
              <Button type="button" variant="outline" size="lg" onClick={onNext} className="sm:h-8 sm:text-sm">
                Scan again
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
