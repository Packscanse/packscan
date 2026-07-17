"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import {
  lookupCarrierStatusAction,
  type CarrierStatusResult,
} from "@/actions/packages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/components/i18n/I18nProvider";

/**
 * "Customer says the parcel is lost" — one tap asks the carrier's tracking
 * API where it is. Read-only; with no credentials configured yet the answer
 * is a friendly not-connected notice instead of an error.
 */
export function CarrierStatusCheck({
  packageId,
  carrierLabel,
}: {
  packageId: string;
  carrierLabel: string;
}) {
  const t = useT();
  const [result, setResult] = useState<CarrierStatusResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function lookup() {
    startTransition(async () => {
      setResult(await lookupCarrierStatusAction(packageId));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.detail.carrierStatusTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div>
          <Button type="button" variant="outline" onClick={lookup} disabled={isPending}>
            {isPending ? t.detail.checking : t.detail.checkCarrierStatus}
          </Button>
        </div>
        {result &&
          (result.ok ? (
            <div className="grid gap-2">
              <p className="font-medium">{result.status}</p>
              {result.estimatedDelivery && (
                <p className="text-muted-foreground">
                  {t.detail.lookupEstimated}:{" "}
                  {format(new Date(result.estimatedDelivery), "MMM d yyyy, HH:mm")}
                </p>
              )}
              {result.events.map((event, i) => (
                <p key={i} className="text-muted-foreground">
                  {format(new Date(event.timestamp), "MMM d, HH:mm")} — {event.description}
                  {event.location ? ` (${event.location})` : ""}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">
              {result.code === "NOT_CONFIGURED"
                ? t.detail.lookupNotConfigured.replace("{carrier}", carrierLabel)
                : result.code === "UNKNOWN_CARRIER"
                  ? t.detail.lookupUnknownCarrier
                  : t.detail.lookupFailed}
            </p>
          ))}
      </CardContent>
    </Card>
  );
}
