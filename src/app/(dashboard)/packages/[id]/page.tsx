import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NEXT_STATUS, STATUS_LABELS, canCancel, canMarkForReturn } from "@/lib/status";
import {
  advancePackageAction,
  cancelPackageAction,
  markForReturnAction,
} from "@/actions/packages";
import { PackageStatusBadge } from "@/components/packages/PackageStatusBadge";
import { HandoverForm } from "@/components/packages/HandoverForm";
import { CARRIER_LABELS } from "@/lib/carriers";
import { ID_TYPE_LABELS } from "@/lib/verification";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

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
        include: { user: { select: { name: true } }, verification: true },
      },
      notifications: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!pkg || (session.user.role !== "ADMIN" && pkg.storeId !== session.user.storeId)) {
    notFound();
  }

  const next = NEXT_STATUS[pkg.status];

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
              <span className="text-muted-foreground">
                {pkg.direction === "OUTBOUND" ? "Sender: " : "Customer: "}
              </span>
              {pkg.customerName}
            </p>
          )}
          {(pkg.customerPhone || pkg.customerEmail) && (
            <p>
              <span className="text-muted-foreground">Contact: </span>
              {[pkg.customerPhone, pkg.customerEmail].filter(Boolean).join(" · ")}
            </p>
          )}
          {pkg.shelfLocation && (
            <p>
              <span className="text-muted-foreground">Shelf: </span>
              <span className="font-semibold">{pkg.shelfLocation}</span>
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

      {/* Pickup completion goes through carrier-policy verification. */}
      {pkg.status === "AWAITING_PICKUP" && (
        <HandoverForm
          packageId={pkg.id}
          carrier={pkg.carrier}
          customerName={pkg.customerName}
          trackingNumber={pkg.trackingNumber}
          shelfLocation={pkg.shelfLocation}
          canOverride={session.user.role === "ADMIN"}
        />
      )}

      {(next === "HANDED_OFF" ||
        next === "RETURNED_TO_CARRIER" ||
        canMarkForReturn(pkg.status) ||
        pkg.direction === "OUTBOUND" ||
        canCancel(pkg.status)) && (
        <div className="flex flex-wrap items-end gap-2">
          {(next === "HANDED_OFF" || next === "RETURNED_TO_CARRIER") && (
            <form
              action={advancePackageAction.bind(null, pkg.id)}
              className="flex flex-wrap items-end gap-2"
            >
              <Input
                name="courierRef"
                maxLength={80}
                placeholder="Driver / route ref (optional)"
                aria-label="Courier reference"
                className="w-full sm:w-56"
              />
              <SubmitButton pendingText="Updating…">
                {next === "HANDED_OFF" ? "Mark handed off" : "Mark returned to carrier"}
              </SubmitButton>
            </form>
          )}
          {canMarkForReturn(pkg.status) && (
            <form
              action={markForReturnAction.bind(null, pkg.id)}
              className="flex flex-wrap items-end gap-2"
            >
              <Input
                name="reason"
                maxLength={300}
                placeholder="Return reason (optional)"
                aria-label="Return reason"
                className="w-full sm:w-56"
              />
              <SubmitButton variant="secondary" pendingText="Updating…">
                Mark for return
              </SubmitButton>
            </form>
          )}
          {pkg.direction === "OUTBOUND" && (
            <Button asChild variant="outline">
              <Link href={`/packages/${pkg.id}/receipt`}>Drop-off receipt</Link>
            </Button>
          )}
          {canCancel(pkg.status) && (
            <form
              action={cancelPackageAction.bind(null, pkg.id)}
              className="flex flex-wrap items-end gap-2"
            >
              <Input
                name="reason"
                required
                minLength={3}
                maxLength={300}
                placeholder="Reason for cancelling (required)"
                aria-label="Cancellation reason"
                className="w-full sm:w-64"
              />
              <SubmitButton variant="destructive" pendingText="Cancelling…">
                Cancel package
              </SubmitButton>
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
              {event.verification && (
                <p className="text-muted-foreground">
                  Verified:{" "}
                  {[
                    event.verification.presentedCode &&
                      `carrier-app code captured (${event.verification.presentedCode})`,
                    event.verification.idChecked &&
                      `ID checked${event.verification.idType ? ` (${ID_TYPE_LABELS[event.verification.idType]})` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "nothing"}
                  {event.verification.collectorName &&
                    ` · collected by ${event.verification.collectorName}`}
                </p>
              )}
              {event.verification?.override && (
                <p className="font-medium text-amber-700 dark:text-amber-500">
                  MANAGER OVERRIDE — {event.verification.overrideReason}
                </p>
              )}
              {event.courierRef && (
                <p className="text-muted-foreground">Courier ref: {event.courierRef}</p>
              )}
              {event.note && <p className="text-muted-foreground">Note: {event.note}</p>}
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
