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
            <p className="font-medium">
              {result.kind === "created"
                ? `Registered — ${STATUS_LABELS[result.status]}`
                : `Updated — ${result.fromStatus ? STATUS_LABELS[result.fromStatus] : ""} → ${STATUS_LABELS[result.status]}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {result.carrier} · {result.trackingNumber}
            </p>
            <div className="flex gap-2">
              <Button type="button" onClick={onNext}>
                Scan next
              </Button>
              <Button asChild variant="outline">
                <Link href={`/packages/${result.packageId}`}>View package</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="font-medium text-destructive">{result.error}</p>
            <div>
              <Button type="button" variant="outline" onClick={onNext}>
                Scan again
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
