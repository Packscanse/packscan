import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle, FileSpreadsheet, PlugZap } from "lucide-react";
import { getRequiredManagerSession, managedStoreId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDuration } from "@/lib/duration";
import { hourProfileUtc, pickupStats, returnAgingCounts, shelfAging } from "@/lib/reports";
import { CARRIER_LABELS, CARRIER_PROVIDERS } from "@/lib/carriers";
import { dispatchNowAction, requeueOutboxAction } from "@/actions/operations";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const RETURN_PENDING_AGE_DAYS = 3;
const PERIOD_DAYS = 30;

/**
 * "Right now" — the owner's glance, exceptions before statistics: what needs
 * a human, then today's numbers, when people come, and each store's shelf.
 * Deliberately English (admin surface).
 */
export default async function OperationsPage() {
  const session = await getRequiredManagerSession();
  // Managers see their own store; the outbox (global plumbing) is admin-only.
  const scope = managedStoreId(session);
  const isAdmin = session.user.role === "ADMIN";

  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const returnAgeCutoff = new Date(Date.now() - RETURN_PENDING_AGE_DAYS * 24 * 60 * 60 * 1000);
  const periodStart = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const [stores, receivedToday, completedToday, outboxByStatus, failedEvents, oldestPending] =
    await Promise.all([
      prisma.store.findMany({
        where: scope ? { id: scope } : undefined,
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true, pickupDeadlineDays: true },
      }),
      prisma.package.groupBy({
        by: ["storeId", "carrier"],
        where: { createdAt: { gte: startOfDay }, ...(scope && { storeId: scope }) },
        _count: { _all: true },
      }),
      prisma.scanEvent.groupBy({
        by: ["storeId", "toStatus"],
        where: {
          scannedAt: { gte: startOfDay },
          toStatus: { in: ["PICKED_UP", "HANDED_OFF", "RETURNED_TO_CARRIER"] },
          ...(scope && { storeId: scope }),
        },
        _count: { _all: true },
      }),
      isAdmin
        ? prisma.carrierEventOutbox.groupBy({ by: ["status"], _count: { _all: true } })
        : Promise.resolve([]),
      isAdmin
        ? prisma.carrierEventOutbox.findMany({
            where: { status: "FAILED" },
            orderBy: { nextAttemptAt: "desc" },
            take: 10,
            include: { package: { select: { id: true, trackingNumber: true } } },
          })
        : Promise.resolve([]),
      isAdmin
        ? prisma.carrierEventOutbox.findFirst({
            where: { status: "PENDING" },
            orderBy: { createdAt: "asc" },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
    ]);

  // Last-30-days rollups — aggregated in the database so this page costs
  // the same at 1000 stores as at one.
  const [receivedPeriod, pickupPeriodStats, hourBuckets, agingRows, returnAging] =
    await Promise.all([
      prisma.package.groupBy({
        by: ["storeId", "carrier"],
        where: { createdAt: { gte: periodStart }, direction: "INBOUND", ...(scope && { storeId: scope }) },
        _count: { _all: true },
      }),
      pickupStats(periodStart, scope),
      hourProfileUtc(periodStart, scope),
      shelfAging(scope),
      returnAgingCounts(returnAgeCutoff, scope),
    ]);

  // Hour-of-day profile (0-23): when parcels arrive vs. get picked up —
  // the owner's staffing planner. Buckets come back in UTC; rotate them
  // into the server's display timezone.
  const tzShift = Math.round(-new Date().getTimezoneOffset() / 60);
  const receivedByHour = Array.from({ length: 24 }, () => 0);
  const pickedByHour = Array.from({ length: 24 }, () => 0);
  for (const b of hourBuckets) {
    const hour = (b.hour + tzShift + 24) % 24;
    receivedByHour[hour] += b.received;
    pickedByHour[hour] += b.pickedUp;
  }
  const pickMax = Math.max(1, ...pickedByHour);
  const receivedMax = Math.max(1, ...receivedByHour);
  // The peak window: the contiguous hours around the maximum that still see
  // ≥60% of it — "pickups peak 17–19" for the second-clerk decision.
  const peakHours = new Set<number>();
  const argMax = pickedByHour.indexOf(pickMax);
  if (pickMax >= 5) {
    peakHours.add(argMax);
    for (let h = argMax - 1; h >= 0 && pickedByHour[h] >= pickMax * 0.6; h--) peakHours.add(h);
    for (let h = argMax + 1; h < 24 && pickedByHour[h] >= pickMax * 0.6; h++) peakHours.add(h);
  }
  const peakStart = Math.min(...(peakHours.size ? peakHours : [0]));
  const peakEnd = Math.max(...(peakHours.size ? peakHours : [0]));

  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const agingByStore = new Map(agingRows.map((r) => [r.storeId, r]));
  const aging = stores.map((store) => {
    const row = agingByStore.get(store.id);
    return {
      store,
      overdue: row?.overdue ?? 0,
      returnAging: returnAging.get(store.id) ?? 0,
      waitingCount: row?.waiting ?? 0,
      avgWaitMs: row?.avgWaitMs ?? null,
      oldestWaitMs: row?.oldestWaitMs ?? null,
    };
  });

  // Per-store 30-day rollup: received per carrier (with share) + pickup dwell.
  const pickupByStore = new Map(pickupPeriodStats.map((r) => [r.storeId, r]));
  const periodFor = (storeId: string) => {
    const received = receivedPeriod.filter((r) => r.storeId === storeId);
    const receivedTotal = received.reduce((sum, r) => sum + r._count._all, 0);
    const pickup = pickupByStore.get(storeId);
    return {
      received,
      receivedTotal,
      pickedUp: pickup?.pickedUp ?? 0,
      avgDwellMs: pickup ? pickup.avgDwellMs : null,
    };
  };

  const completedFor = (storeId: string, status: string) =>
    completedToday.find((c) => c.storeId === storeId && c.toStatus === status)?._count._all ?? 0;
  const receivedTodayFor = (storeId: string) =>
    receivedToday.filter((r) => r.storeId === storeId).reduce((sum, r) => sum + r._count._all, 0);
  const outboxCount = (status: string) =>
    outboxByStatus.find((o) => o.status === status)?._count._all ?? 0;

  // ── Roll-ups for the stat cards.
  const totalWaiting = aging.reduce((sum, a) => sum + a.waitingCount, 0);
  const weightedWait = aging.reduce(
    (sum, a) => sum + (a.avgWaitMs ?? 0) * a.waitingCount,
    0
  );
  const avgWaitMs = totalWaiting > 0 ? weightedWait / totalWaiting : null;
  const pickedToday = stores.reduce((sum, s) => sum + completedFor(s.id, "PICKED_UP"), 0);
  const handedOffToday = stores.reduce((sum, s) => sum + completedFor(s.id, "HANDED_OFF"), 0);
  const returnedToday = stores.reduce(
    (sum, s) => sum + completedFor(s.id, "RETURNED_TO_CARRIER"),
    0
  );
  const receivedTodayTotal = receivedToday.reduce((sum, r) => sum + r._count._all, 0);
  const carrierSplit = Object.entries(
    receivedToday.reduce<Record<string, number>>((acc, r) => {
      acc[r.carrier] = (acc[r.carrier] ?? 0) + r._count._all;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([carrier, count]) => `${CARRIER_LABELS[carrier as keyof typeof CARRIER_LABELS]} ${count}`)
    .join(" · ");

  // ── Exceptions first: everything below is fine without a human today.
  const failedCount = outboxCount("FAILED");
  const needsHuman = [
    ...aging
      .filter((a) => a.overdue > 0)
      .map((a) => ({
        key: `overdue-${a.store.id}`,
        icon: AlertTriangle,
        text: (
          <>
            <b>{a.store.name}:</b> {a.overdue} parcel(s) past the{" "}
            {a.store.pickupDeadlineDays}-day deadline — flag for the driver today
          </>
        ),
        action: (
          <Link
            href="/packages?view=return"
            className="grid h-[34px] shrink-0 place-items-center rounded-full bg-white px-4 text-[13px] font-semibold text-[#2b1214]"
          >
            Show them
          </Link>
        ),
      })),
    ...aging
      .filter((a) => a.returnAging > 0)
      .map((a) => ({
        key: `return-${a.store.id}`,
        icon: AlertTriangle,
        text: (
          <>
            <b>{a.store.name}:</b> {a.returnAging} return(s) waiting {RETURN_PENDING_AGE_DAYS}+
            days for driver collection
          </>
        ),
        action: (
          <Link
            href="/packages?view=return"
            className="grid h-[34px] shrink-0 place-items-center rounded-full bg-white px-4 text-[13px] font-semibold text-[#2b1214]"
          >
            Show it
          </Link>
        ),
      })),
    ...(failedCount > 0
      ? [
          {
            key: "outbox-failed",
            icon: PlugZap,
            text: (
              <>
                <b>Carrier API:</b> {failedCount} event(s) failed for good — credentials likely
                expired
              </>
            ),
            action: (
              <form action={requeueOutboxAction}>
                <input type="hidden" name="status" value="FAILED" />
                <SubmitButton
                  variant="ghost"
                  pendingText="Re-queueing…"
                  className="h-[34px] rounded-full bg-white px-4 text-[13px] font-semibold text-[#2b1214] hover:bg-white/90 hover:text-[#2b1214]"
                >
                  Re-queue
                </SubmitButton>
              </form>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Right now</h1>
        <p className="text-sm text-muted-foreground">
          {format(today, "EEEE MMM d, HH:mm")} · {stores.length} store{stores.length === 1 ? "" : "s"}
        </p>
      </div>

      {needsHuman.length > 0 && (
        <div className="grid gap-3 rounded-[20px] border border-[#7f1d1d] bg-[#2b1214] p-5 text-white">
          <p className="text-[13px] font-bold tracking-[0.08em] text-[#fca5a5] uppercase">
            Needs a human ({needsHuman.length})
          </p>
          {needsHuman.map(({ key, icon: Icon, text, action }) => (
            <div key={key} className="flex items-center gap-3 text-sm">
              <Icon className="size-4 shrink-0 text-[#fca5a5]" />
              <span className="min-w-0 flex-1">{text}</span>
              {action}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "On shelves now",
            number: totalWaiting,
            context: avgWaitMs !== null ? `avg wait ${formatDuration(avgWaitMs)}` : "—",
          },
          {
            label: "Handed over today",
            number: pickedToday,
            context: `${handedOffToday} handed off · ${returnedToday} returned`,
          },
          {
            label: "Received today",
            number: receivedTodayTotal,
            context: carrierSplit || "—",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="grid gap-1 pt-4">
              <p className="text-[13px] font-semibold text-muted-foreground">{stat.label}</p>
              <p className="text-[44px] leading-none font-extrabold tracking-tight">
                {stat.number}
              </p>
              <p className="text-[13px] text-muted-foreground">{stat.context}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline gap-x-3 text-[15px] font-bold">
            When people come
            {pickMax >= 5 && (
              <span className="text-[13px] font-normal text-muted-foreground">
                pickups peak {peakStart}–{peakEnd + 1} — schedule a second clerk
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">Pickups</p>
            <div className="flex h-[90px] items-end gap-px overflow-x-auto">
              {pickedByHour.map((count, hour) => (
                <div key={hour} className="flex min-w-4 flex-1 flex-col items-center gap-0.5">
                  <div
                    className={`w-full rounded-t-[3px] ${
                      count > 0 ? (peakHours.has(hour) ? "bg-primary" : "bg-secondary") : "bg-muted"
                    }`}
                    style={{ height: `${Math.max(count > 0 ? 8 : 2, (count / pickMax) * 76)}px` }}
                    title={`${String(hour).padStart(2, "0")}:00 — ${count}`}
                  />
                  {hour % 3 === 0 && (
                    <span className="text-[10px] text-muted-foreground">{hour}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">Received (van & drop-offs)</p>
            <div className="flex h-10 items-end gap-px overflow-x-auto">
              {receivedByHour.map((count, hour) => (
                <div key={hour} className="flex min-w-4 flex-1 flex-col items-center">
                  <div
                    className={`w-full rounded-t-[3px] ${count > 0 ? "bg-secondary" : "bg-muted"}`}
                    style={{ height: `${Math.max(count > 0 ? 6 : 2, (count / receivedMax) * 34)}px` }}
                    title={`${String(hour).padStart(2, "0")}:00 — ${count}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {aging.map(({ store, overdue, returnAging: returnCount, waitingCount, oldestWaitMs }) => (
          <Card key={store.id}>
            <CardContent className="grid gap-2.5 pt-4">
              <p className="text-[15px] font-bold">
                {store.name} <span className="font-normal text-muted-foreground">({store.code})</span>
              </p>
              <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-extrabold text-primary-foreground">
                  {waitingCount}
                </span>
                <span>
                  on shelf
                  {oldestWaitMs !== null && ` · oldest ${formatDuration(oldestWaitMs)}`}
                  {overdue > 0 && (
                    <span className="font-bold text-destructive"> · {overdue} overdue</span>
                  )}
                  {returnCount > 0 && (
                    <span className="font-bold text-destructive"> · {returnCount} return{returnCount === 1 ? "" : "s"} stuck</span>
                  )}
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground">
                Today: {receivedTodayFor(store.id)} in · {completedFor(store.id, "PICKED_UP")} out ·{" "}
                {completedFor(store.id, "RETURNED_TO_CARRIER")} returned
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-4">
          <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-48 flex-1 text-sm">
            Settlement CSV — per store &amp; carrier, to reconcile against the carrier&rsquo;s
            statement.
          </span>
          <form action="/api/settlement" method="GET" className="flex items-end gap-2">
            <Input
              type="month"
              name="month"
              defaultValue={defaultMonth}
              required
              className="w-44"
              aria-label="Settlement month"
            />
            <SubmitButton pendingText="Preparing…">Download</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Last {PERIOD_DAYS} days — volumes, carrier share, time to pickup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Received (by carrier)</TableHead>
                <TableHead>Picked up</TableHead>
                <TableHead>Avg time to pickup</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => {
                const p = periodFor(store.id);
                return (
                  <TableRow key={store.id}>
                    <TableCell>
                      {store.name} <span className="text-muted-foreground">({store.code})</span>
                    </TableCell>
                    <TableCell>
                      {p.receivedTotal}
                      {p.receivedTotal > 0 && (
                        <span className="text-muted-foreground">
                          {" — "}
                          {p.received
                            .slice()
                            .sort((a, b) => b._count._all - a._count._all)
                            .map(
                              (r) =>
                                `${CARRIER_LABELS[r.carrier]} ${r._count._all} (${Math.round(
                                  (r._count._all / p.receivedTotal) * 100
                                )}%)`
                            )
                            .join(" · ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{p.pickedUp}</TableCell>
                    <TableCell>
                      {p.avgDwellMs === null ? "—" : formatDuration(p.avgDwellMs)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Carrier event outbox</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              <span className="text-muted-foreground">Pending: </span>
              {outboxCount("PENDING")}
              {oldestPending && (
                <span className="text-muted-foreground">
                  {" "}
                  (oldest queued {format(oldestPending.createdAt, "MMM d, HH:mm")})
                </span>
              )}
              <span className="text-muted-foreground"> · Sent: </span>
              {outboxCount("SENT")}
              <span className="text-muted-foreground"> · Awaiting credentials: </span>
              {outboxCount("NOT_CONFIGURED")}
              <span className="text-muted-foreground"> · Failed (dead-lettered): </span>
              <span className={failedCount > 0 ? "font-medium text-destructive" : ""}>
                {failedCount}
              </span>
            </p>

            {failedEvents.length > 0 && (
              <div className="grid gap-1">
                <p className="font-medium">Dead-lettered events</p>
                {failedEvents.map((event) => (
                  <p key={event.id} className="text-muted-foreground">
                    {event.eventType} ·{" "}
                    <Link
                      href={`/packages/${event.package.id}`}
                      className="font-mono underline-offset-2 hover:underline"
                    >
                      {event.package.trackingNumber}
                    </Link>{" "}
                    · {event.attempts} attempts · {event.lastError ?? "no error recorded"}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <form action={dispatchNowAction}>
                <SubmitButton pendingText="Dispatching…">Run dispatch now</SubmitButton>
              </form>
              {failedCount > 0 && (
                <form action={requeueOutboxAction}>
                  <input type="hidden" name="status" value="FAILED" />
                  <SubmitButton variant="outline" pendingText="Re-queueing…">
                    Re-queue failed
                  </SubmitButton>
                </form>
              )}
              {outboxCount("NOT_CONFIGURED") > 0 && (
                <form action={requeueOutboxAction} className="flex items-end gap-2">
                  <input type="hidden" name="status" value="NOT_CONFIGURED" />
                  <NativeSelect name="carrier" aria-label="Carrier to re-queue">
                    <option value="">All carriers</option>
                    {CARRIER_PROVIDERS.map((p) => (
                      <option key={p.code} value={p.code}>
                        {CARRIER_LABELS[p.code]}
                      </option>
                    ))}
                  </NativeSelect>
                  <SubmitButton variant="outline" pendingText="Re-queueing…">
                    Re-queue awaiting-credentials
                  </SubmitButton>
                </form>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Use &ldquo;re-queue awaiting-credentials&rdquo; after a carrier&rsquo;s API goes live
              to backfill its history.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
