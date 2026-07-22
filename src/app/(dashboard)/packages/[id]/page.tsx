import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { MessageSquare, PackagePlus, ScanLine } from "lucide-react";
import { getRequiredSession, hasManagementAccess } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NEXT_STATUS, canCancel, canMarkForReturn } from "@/lib/status";
import { findVisitCompanions } from "@/lib/scan-flow";
import {
  advancePackageAction,
  cancelPackageAction,
  markForReturnAction,
  resendNotificationAction,
} from "@/actions/packages";
import { PackageStatusBadge } from "@/components/packages/PackageStatusBadge";
import { HandoverForm } from "@/components/packages/HandoverForm";
import { CarrierStatusCheck } from "@/components/packages/CarrierStatusCheck";
import { ShelfPoster } from "@/components/shelf/ShelfBlock";
import { carrierLabel } from "@/lib/carriers";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { getT } from "@/lib/i18n/server";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

/** One entry in the parcel's story: a dot on the timeline. */
interface StoryItem {
  key: string;
  at: Date | null;
  title: string;
  meta: string[];
  amber?: string;
  pending?: boolean;
}

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
      store: { select: { name: true, code: true, pickupDeadlineDays: true } },
      preAdvice: { select: { announcedAt: true, customerName: true, customerPhone: true } },
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
  const deadlineDays = pkg.store.pickupDeadlineDays;
  const dayOn = Math.max(1, Math.ceil((Date.now() - pkg.createdAt.getTime()) / 86_400_000));
  const overdue = pkg.status === "AWAITING_PICKUP" && dayOn > deadlineDays;
  const waiting = pkg.status === "AWAITING_PICKUP";
  const showPoster =
    Boolean(pkg.shelfLocation) && (waiting || pkg.status === "RETURN_PENDING");
  const canResend = waiting && Boolean(pkg.customerPhone || pkg.customerEmail);

  // The same customer's other shelf parcels — worth one line, not a table.
  const companions = waiting
    ? await findVisitCompanions(pkg.storeId, {
        id: pkg.id,
        customerName: pkg.customerName,
        customerPhone: pkg.customerPhone,
      })
    : [];

  // Dwell: arrival → handover (or "so far" while the parcel still waits).
  const handedOver = pkg.scanEvents.find((e) =>
    ["PICKED_UP", "RETURNED_TO_CARRIER", "HANDED_OFF"].includes(e.toStatus)
  );
  const dwellMs = handedOver
    ? handedOver.scannedAt.getTime() - pkg.createdAt.getTime()
    : ["AWAITING_PICKUP", "RETURN_PENDING", "PENDING_HANDOFF"].includes(pkg.status)
      ? Date.now() - pkg.createdAt.getTime()
      : null;

  // ── The story: pre-advice, every scan event, every notification, and the
  // step that hasn't happened yet — one timeline, oldest first.
  const story: StoryItem[] = [];
  if (pkg.preAdvice) {
    story.push({
      key: "announced",
      at: pkg.preAdvice.announcedAt,
      title: t.detail.storyAnnounced.replace("{carrier}", carrierLabel(pkg.carrier, t)),
      meta: [
        [
          format(pkg.preAdvice.announcedAt, "MMM d, HH:mm"),
          pkg.preAdvice.customerName || pkg.preAdvice.customerPhone
            ? t.detail.storyAnnouncedMeta
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      ],
    });
  }
  for (const event of pkg.scanEvents) {
    const verification = event.verification;
    story.push({
      key: `event-${event.id}`,
      at: event.scannedAt,
      title: event.fromStatus
        ? `${t.status[event.fromStatus]} → ${t.status[event.toStatus]}`
        : t.detail.registeredAs.replace("{status}", t.status[event.toStatus]),
      meta: [
        [
          format(event.scannedAt, "MMM d, HH:mm"),
          event.user.name,
          t.inputMethod[event.inputMethod],
          event.toStatus === "AWAITING_PICKUP" && pkg.shelfLocation
            ? `${t.detail.shelf} ${pkg.shelfLocation}`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        verification
          ? `${t.detail.verified}: ${
              [
                verification.presentedCode &&
                  `${verification.codeValidated ? t.detail.codeValidated : t.detail.codeCaptured} (${verification.presentedCode})`,
                verification.idChecked &&
                  `${t.detail.idChecked}${verification.idType ? ` (${t.idType[verification.idType]})` : ""}`,
                verification.collectorIdChecked &&
                  `${t.detail.collectorIdChecked}${verification.collectorIdType ? ` (${t.idType[verification.collectorIdType]})` : ""}`,
              ]
                .filter(Boolean)
                .join(" · ") || t.detail.nothing
            }${verification.collectorName ? ` · ${t.detail.collectedBy} ${verification.collectorName}` : ""}`
          : null,
        event.courierRef ? `${t.detail.courierRef}: ${event.courierRef}` : null,
        event.note ? `${t.detail.note}: ${event.note}` : null,
      ].filter((line): line is string => Boolean(line)),
      amber: verification?.override
        ? `${t.detail.override} — ${verification.overrideReason}`
        : undefined,
    });
  }
  for (const n of pkg.notifications) {
    story.push({
      key: `notification-${n.id}`,
      at: n.createdAt,
      title: `${n.channel} → ${n.recipient} (${n.status.toLowerCase().replace("_", " ")})`,
      meta: [`"${n.message}"`, format(n.createdAt, "MMM d, HH:mm")],
    });
  }
  story.sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
  if (waiting) {
    story.push({
      key: "pending",
      at: null,
      pending: true,
      title: (pkg.customerName ? t.detail.storyWaiting : t.detail.storyWaitingUnnamed)
        .replace("{name}", pkg.customerName ?? "")
        .replace("{n}", String(dayOn))
        .replace("{days}", String(deadlineDays)),
      meta: [],
    });
  } else if (pkg.status === "RETURN_PENDING") {
    story.push({
      key: "pending",
      at: null,
      pending: true,
      title: t.detail.storyWaitingDriver.replace("{carrier}", carrierLabel(pkg.carrier, t)),
      meta: [],
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/packages"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← {t.packages.title}
        </Link>
        <PackageStatusBadge status={pkg.status} />
      </div>

      {showPoster ? (
        <ShelfPoster
          code={pkg.shelfLocation}
          eyebrow={t.handover.shelf}
          danger={overdue || pkg.status === "RETURN_PENDING"}
        >
          {pkg.customerName && (
            <span className="text-lg font-semibold">{pkg.customerName}</span>
          )}
          <span className="font-mono text-[13px] opacity-80">
            {pkg.trackingNumber} · {carrierLabel(pkg.carrier, t)}
          </span>
        </ShelfPoster>
      ) : (
        <h1 className="font-mono text-xl font-semibold">{pkg.trackingNumber}</h1>
      )}

      {waiting && (
        <div className="flex gap-2">
          {canResend && (
            <form action={resendNotificationAction.bind(null, pkg.id)} className="flex-1">
              <SubmitButton
                variant="secondary"
                pendingText={t.detail.updating}
                className="h-13 w-full rounded-[14px]"
              >
                <MessageSquare data-icon="inline-start" />
                {t.detail.resendSms}
              </SubmitButton>
            </form>
          )}
          <Button asChild className="h-13 flex-1 rounded-[14px]">
            <a href="#handover">
              <ScanLine data-icon="inline-start" />
              {t.handover.handOver}
            </a>
          </Button>
        </div>
      )}

      {companions.length > 0 && (
        <div className="flex items-center gap-3 rounded-[16px] border bg-card px-4 py-3 text-sm text-muted-foreground">
          <PackagePlus className="size-5 shrink-0" />
          <span>
            {t.detail.companionHint
              .replace("{name}", pkg.customerName ?? "")
              .replace("{count}", String(companions.length))
              .replace(
                "{shelves}",
                [...new Set(companions.map((c) => c.shelfLocation).filter(Boolean))].join(", ") ||
                  "—"
              )}
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-[13px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            {t.detail.storyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid">
            {story.map((item, i) => (
              <li key={item.key} className="relative grid gap-0.5 pb-4 pl-6 last:pb-0">
                {i < story.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-3 bottom-0 left-[4.5px] w-0.5 bg-border"
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1 left-0 size-2.5 rounded-full",
                    item.pending ? "border-2 border-dash" : "bg-ok"
                  )}
                />
                <p
                  className={cn(
                    "text-sm font-semibold",
                    item.pending && "font-medium text-muted-foreground"
                  )}
                >
                  {item.title}
                </p>
                {item.meta.map((line, j) => (
                  <p key={j} className="text-xs text-muted-foreground">
                    {line}
                  </p>
                ))}
                {item.amber && (
                  <p className="text-xs font-medium text-warn">{item.amber}</p>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.detail.details}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">{t.detail.carrier}: </span>
            {carrierLabel(pkg.carrier, t)}
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
        <div id="handover">
          <HandoverForm
            packageId={pkg.id}
            carrier={pkg.carrier}
            customerName={pkg.customerName}
            trackingNumber={pkg.trackingNumber}
            shelfLocation={pkg.shelfLocation}
            canOverride={hasManagementAccess(session)}
          />
        </div>
      )}

      {(next === "HANDED_OFF" ||
        next === "RETURNED_TO_CARRIER" ||
        canMarkForReturn(pkg.status) ||
        pkg.direction === "OUTBOUND" ||
        canCancel(pkg.status)) && (
        <Card>
          <CardContent className="grid gap-3 pt-4">
            {(next === "HANDED_OFF" ||
              next === "RETURNED_TO_CARRIER" ||
              canMarkForReturn(pkg.status) ||
              pkg.direction === "OUTBOUND") && (
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
              </div>
            )}
            {/* Cancelling is the one action that ends a parcel's story — it
                gets its own visually separated row, never a neighbour. */}
            {canCancel(pkg.status) && (
              <>
                {(next === "HANDED_OFF" ||
                  next === "RETURNED_TO_CARRIER" ||
                  canMarkForReturn(pkg.status) ||
                  pkg.direction === "OUTBOUND") && <Separator />}
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
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lost-parcel investigation: ask the carrier's tracking API directly.
          UNKNOWN has no provider to ask, so the card is hidden. */}
      {pkg.carrier !== "UNKNOWN" && (
        <CarrierStatusCheck packageId={pkg.id} carrierLabel={carrierLabel(pkg.carrier, t)} />
      )}
    </div>
  );
}
