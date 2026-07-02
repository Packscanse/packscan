import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NEXT_STATUS, STATUS_LABELS, canCancel } from "@/lib/status";
import { advancePackageAction, cancelPackageAction } from "@/actions/packages";
import { PackageStatusBadge } from "@/components/packages/PackageStatusBadge";
import { CARRIER_LABELS } from "@/lib/carriers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const ADVANCE_LABELS: Partial<Record<string, string>> = {
  AWAITING_PICKUP: "Mark picked up",
  PENDING_HANDOFF: "Mark handed off",
};

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getRequiredSession();
  const { id } = await params;

  const pkg = await prisma.package.findUnique({
    where: { id },
    include: {
      store: { select: { name: true, code: true } },
      scanEvents: {
        orderBy: { scannedAt: "asc" },
        include: { user: { select: { name: true } } },
      },
      notifications: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!pkg || (session.user.role !== "ADMIN" && pkg.storeId !== session.user.storeId)) {
    notFound();
  }

  const next = NEXT_STATUS[pkg.status];
  const advanceLabel = ADVANCE_LABELS[pkg.status];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{pkg.trackingNumber}</h1>
        <PackageStatusBadge status={pkg.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Carrier: </span>
            {CARRIER_LABELS[pkg.carrier]}
            {pkg.carrierManual && " (manually set)"}
          </p>
          <p>
            <span className="text-muted-foreground">Direction: </span>
            <span className="capitalize">{pkg.direction.toLowerCase()}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Store: </span>
            {pkg.store.name} ({pkg.store.code})
          </p>
          <p>
            <span className="text-muted-foreground">Registered: </span>
            {format(pkg.createdAt, "MMM d yyyy, HH:mm")}
          </p>
          {pkg.customerName && (
            <p>
              <span className="text-muted-foreground">Customer: </span>
              {pkg.customerName}
            </p>
          )}
          {(pkg.customerPhone || pkg.customerEmail) && (
            <p>
              <span className="text-muted-foreground">Contact: </span>
              {[pkg.customerPhone, pkg.customerEmail].filter(Boolean).join(" · ")}
            </p>
          )}
          {pkg.notes && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Notes: </span>
              {pkg.notes}
            </p>
          )}
        </CardContent>
      </Card>

      {(next || canCancel(pkg.status)) && (
        <div className="flex flex-wrap gap-2">
          {next && advanceLabel && (
            <form action={advancePackageAction.bind(null, pkg.id)}>
              <Button type="submit">{advanceLabel}</Button>
            </form>
          )}
          {canCancel(pkg.status) && (
            <form action={cancelPackageAction.bind(null, pkg.id)}>
              <Button type="submit" variant="destructive">
                Cancel package
              </Button>
            </form>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan history</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {pkg.scanEvents.map((event, i) => (
            <div key={event.id}>
              {i > 0 && <Separator className="mb-3" />}
              <p>
                {event.fromStatus
                  ? `${STATUS_LABELS[event.fromStatus]} → ${STATUS_LABELS[event.toStatus]}`
                  : `Registered as ${STATUS_LABELS[event.toStatus]}`}
              </p>
              <p className="text-muted-foreground">
                {format(event.scannedAt, "MMM d yyyy, HH:mm:ss")} · {event.user.name} ·{" "}
                {event.inputMethod.toLowerCase().replace("_", " ")}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {pkg.notifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {pkg.notifications.map((n, i) => (
              <div key={n.id}>
                {i > 0 && <Separator className="mb-3" />}
                <p>
                  {n.channel} to {n.recipient}{" "}
                  <span className="text-muted-foreground">({n.status.toLowerCase().replace("_", " ")})</span>
                </p>
                <p className="text-muted-foreground">&ldquo;{n.message}&rdquo;</p>
                <p className="text-muted-foreground">{format(n.createdAt, "MMM d yyyy, HH:mm")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
