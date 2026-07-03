"use client";

import { useState, useTransition } from "react";
import type { Carrier } from "@prisma/client";
import type { HandoverInput } from "@/lib/verification";
import { completePickupAction } from "@/actions/packages";
import { HandoverPanel } from "@/components/scan/HandoverPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Detail-page pickup completion: same verification step as the scan screen. */
export function HandoverForm({
  packageId,
  carrier,
  customerName,
}: {
  packageId: string;
  carrier: Carrier;
  customerName: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm(verification: HandoverInput) {
    startTransition(async () => {
      const res = await completePickupAction(packageId, verification);
      setError(res.ok ? null : res.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Complete pickup</CardTitle>
      </CardHeader>
      <CardContent>
        <HandoverPanel
          carrier={carrier}
          customerName={customerName}
          isPending={isPending}
          error={error}
          onConfirm={confirm}
        />
      </CardContent>
    </Card>
  );
}
