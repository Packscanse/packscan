import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getRequiredSession, hasManagementAccess } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NEXT_STATUS, canCancel, canMarkForReturn } from "@/lib/status";
import {
  advancePackageAction,
  cancelPackageAction,
  markForReturnAction,
} from "@/actions/packages";
import { PackageStatusBadge } from "@/components/packages/PackageStatusBadge";
import { HandoverForm } from "@/components/packages/HandoverForm";
import { CarrierStatusCheck } from "@/components/packages/CarrierStatusCheck";
import { CARRIER_LABELS } from "@/lib/carriers";
import { formatDuration } from "@/lib/duration";
import { getT } from "@/lib/i18n/server";
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
  const t = await getT();
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

  // Dwell: arrival → handover (or "so far" while the parcel still waits).
  const handedOver = pkg.scanEvents.find((e) =>
    ["PICKED_UP", "RETURNED_TO_CARRIER", "HANDED_OFF"].includes(e.toStatus)
  );
  const dwellMs = handedOver
    ? handedOver.scannedAt.getTime() - pkg.createdAt.getTime()
    : ["AWAITING_PICKUP", "RETURN_PENDING", "PENDING_HANDOFF"].includes(pkg.status)
      ? Date.now() - pkg.createdAt.getTime()
      : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{pkg.trackingNumber}</h1>
        <PackageStatusBadge status={pkg.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.detail.details}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">{t.detail.carrier}: </span>
            {CARRIER_LABELS[pkg.carrier]}
            {pkg.carrierManual && ` ${t.detail.manuallySet}`}
          </p>
          <p>
            <span className="text-muted-foreground">{t.detail.direction}: </span>
            {pkg.direction === "INBOUND" ? t.packages.inbound : t.packages.outbound}
          </p>
          <p>
            <span className="text-muted-foreground">{t.detail.store}: </span>
            {pkg.store.name} ({pkg.store.code})
          </p>
          <p>
            <span className="text-muted-foreground">{t.detail.registered}: </span>
            {format(pkg.createdAt, "MMM d yyyy, HH:mm")}
          </p>
          {dwellMs !== null && (
            <p>
              <span className="text-muted-foreground">{t.detail.timeOnShelf}: </span>
              {formatDuration(dwellMs)}
              {!handedOver && ` ${t.detail.stillWaiting}`}
            </p>
          )}
          {pkg.customerName && (
            <p>
              <span className="text-muted-foreground">
                {pkg.direction === "OUTBOUND" ? t.detail.sender : t.detail.customer}:{" "}
              </span>
              {pkg.customerName}
            </p>
          )}
          {(pkg.customerPhone || pkg.customerEmail) && (
            <p>
              <span className="text-muted-foreground">{t.detail.contact}: </span>
              {[pkg.customerPhone, pkg.customerEmail].filter(Boolean).join(" · ")}
            </p>
          )}
          {pkg.shelfLocation && (
            <p>
              <span className="text-muted-foreground">{t.detail.shelf}: </span>
              <span className="font-semibold">{pkg.shelfLocation}</span>
            </p>
          )}
          {pkg.notes && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">{t.detail.notes}: </span>
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
          canOverride={hasManagementAccess(session)}
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
                placeholder={t.detail.courierRefPlaceholder}
                aria-label={t.detail.courierRef}
                className="w-full sm:w-56"
              />
              <SubmitButton pendingText={t.detail.updating}>
                {next === "HANDED_OFF" ? t.detail.markHandedOff : t.detail.markReturned}
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
                placeholder={t.detail.returnReason}
                aria-label={t.detail.returnReason}
                className="w-full sm:w-56"
              />
              <SubmitButton variant="secondary" pendingText={t.detail.updating}>
                {t.detail.markForReturn}
              </SubmitButton>
            </form>
          )}
          {pkg.direction === "OUTBOUND" && (
            <Button asChild variant="outline">
              <Link href={`/packages/${pkg.id}/receipt`}>{t.detail.dropOffReceipt}</Link>
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
                placeholder={t.detail.cancelReason}
                aria-label={t.detail.cancelReason}
                className="w-full sm:w-64"
              />
              <SubmitButton variant="destructive" pendingText={t.detail.cancelling}>
                {t.detail.cancelPackage}
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {/* Lost-parcel investigation: ask the carrier's tracking API directly.
          UNKNOWN has no provider to ask, so the card is hidden. */}
      {pkg.carrier !== "UNKNOWN" && (
        <CarrierStatusCheck packageId={pkg.id} carrierLabel={CARRIER_LABELS[pkg.carrier]} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.detail.scanHistory}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {pkg.scanEvents.map((event, i) => (
            <div key={event.id}>
              {i > 0 && <Separator className="mb-3" />}
              <p>
                {event.fromStatus
                  ? `${t.status[event.fromStatus]} → ${t.status[event.toStatus]}`
                  : t.detail.registeredAs.replace("{status}", t.status[event.toStatus])}
              </p>
              <p className="text-muted-foreground">
                {format(event.scannedAt, "MMM d yyyy, HH:mm:ss")} · {event.user.name} ·{" "}
                {t.inputMethod[event.inputMethod]}
              </p>
              {event.verification && (
                <p className="text-muted-foreground">
                  {t.detail.verified}:{" "}
                  {[
                    event.verification.presentedCode &&
                      `${event.verification.codeValidated ? t.detail.codeValidated : t.detail.codeCaptured} (${event.verification.presentedCode})`,
                    event.verification.idChecked &&
                      `${t.detail.idChecked}${event.verification.idType ? ` (${t.idType[event.verification.idType]})` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t.detail.nothing}
                  {event.verification.collectorName &&
                    ` · ${t.detail.collectedBy} ${event.verification.collectorName}`}
                </p>
              )}
              {event.verification?.override && (
                <p className="font-medium text-amber-700 dark:text-amber-500">
                  {t.detail.override} — {event.verification.overrideReason}
                </p>
              )}
              {event.courierRef && (
                <p className="text-muted-foreground">
                  {t.detail.courierRef}: {event.courierRef}
                </p>
              )}
              {event.note && (
                <p className="text-muted-foreground">
                  {t.detail.note}: {event.note}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {pkg.notifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.detail.notifications}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {pkg.notifications.map((n, i) => (
              <div key={n.id}>
                {i > 0 && <Separator className="mb-3" />}
                <p>
                  {n.channel} → {n.recipient}{" "}
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
