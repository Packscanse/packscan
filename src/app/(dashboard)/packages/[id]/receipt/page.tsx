import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CARRIER_LABELS } from "@/lib/carriers";
import { STATUS_LABELS } from "@/lib/status";
import { PrintButton } from "@/components/packages/PrintButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/**
 * Printable proof of drop-off for a private sender handing an outbound
 * parcel to the store. The @media print CSS in the buttons hides the
 * navigation actions; everything else is plain document flow.
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getRequiredSession();
  const { id } = await params;

  const pkg = await prisma.package.findUnique({
    where: { id },
    include: {
      store: { select: { name: true, code: true, address: true } },
      scanEvents: {
        orderBy: { scannedAt: "asc" },
        take: 1,
        include: { user: { select: { name: true } } },
      },
    },
  });

  if (
    !pkg ||
    pkg.direction !== "OUTBOUND" ||
    (session.user.role !== "ADMIN" && pkg.storeId !== session.user.storeId)
  ) {
    notFound();
  }

  const receivedEvent = pkg.scanEvents[0];

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Drop-off receipt</h1>
        <div className="flex gap-2">
          <PrintButton />
          <Button asChild variant="outline">
            <Link href={`/packages/${pkg.id}`}>Back to package</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-4 text-sm">
          <div>
            <p className="text-base font-semibold">{pkg.store.name} ({pkg.store.code})</p>
            {pkg.store.address && <p className="text-muted-foreground">{pkg.store.address}</p>}
          </div>
          <Separator />
          <p className="font-medium">Parcel received for carrier handoff</p>
          <div className="grid gap-1">
            <p>
              <span className="text-muted-foreground">Tracking number: </span>
              <span className="font-mono">{pkg.trackingNumber}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Carrier: </span>
              {CARRIER_LABELS[pkg.carrier]}
            </p>
            {pkg.customerName && (
              <p>
                <span className="text-muted-foreground">Sender: </span>
                {pkg.customerName}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Received: </span>
              {receivedEvent
                ? `${format(receivedEvent.scannedAt, "MMM d yyyy, HH:mm")} by ${receivedEvent.user.name}`
                : format(pkg.createdAt, "MMM d yyyy, HH:mm")}
            </p>
            <p>
              <span className="text-muted-foreground">Status: </span>
              {STATUS_LABELS[pkg.status]}
            </p>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            This receipt confirms the parcel was received at the pickup point above.
            Tracking and delivery remain subject to the carrier&rsquo;s terms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
