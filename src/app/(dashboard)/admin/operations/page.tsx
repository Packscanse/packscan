import Link from "next/link";
import { format } from "date-fns";
import { getRequiredManagerSession, managedStoreId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDuration } from "@/lib/duration";
import { CARRIER_LABELS, CARRIER_PROVIDERS } from "@/lib/carriers";
import { dispatchNowAction, requeueOutboxAction } from "@/actions/operations";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
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
 * The end-of-day picture across all stores: today's volumes, what's aging
 * on the shelves, and the health of the carrier-event outbox.
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

  // Last-30-days volumes and dwell: what came in per carrier, what went
  // out, and how long parcels sat before pickup (avg + longest).
  const [receivedPeriod, pickedUpPeriod, intakePeriod] = await Promise.all([
    prisma.package.groupBy({
      by: ["storeId", "carrier"],
      where: { createdAt: { gte: periodStart }, direction: "INBOUND", ...(scope && { storeId: scope }) },
      _count: { _all: true },
    }),
    prisma.scanEvent.findMany({
      where: { toStatus: "PICKED_UP", scannedAt: { gte: periodStart }, ...(scope && { storeId: scope }) },
      select: { storeId: true, scannedAt: true, package: { select: { createdAt: true } } },
    }),
    // Intake events (first scans) for the hour-of-day staffing profile.
    prisma.scanEvent.findMany({
      where: { fromStatus: null, scannedAt: { gte: periodStart }, ...(scope && { storeId: scope }) },
      select: { scannedAt: true },
    }),
  ]);

  // Hour-of-day profile (0-23): when parcels arrive vs. get picked up —
  // the owner's staffing planner.
  const receivedByHour = Array.from({ length: 24 }, () => 0);
  const pickedByHour = Array.from({ length: 24 }, () => 0);
  for (const e of intakePeriod) receivedByHour[e.scannedAt.getHours()]++;
  for (const e of pickedUpPeriod) pickedByHour[e.scannedAt.getHours()]++;
  const hourMax = Math.max(1, ...receivedByHour, ...pickedByHour);

  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  // Shelf aging is per-store because deadlines are per-store.
  const aging = await Promise.all(
    stores.map(async (store) => {
      const deadlineCutoff = new Date(Date.now() - store.pickupDeadlineDays * 24 * 60 * 60 * 1000);
      const [overdue, returnAging, waiting] = await Promise.all([
        prisma.package.count({
          where: { storeId: store.id, status: "AWAITING_PICKUP", createdAt: { lt: deadlineCutoff } },
        }),
        prisma.package.count({
          where: { storeId: store.id, status: "RETURN_PENDING", updatedAt: { lt: returnAgeCutoff } },
        }),
        prisma.package.findMany({
          where: { storeId: store.id, status: "AWAITING_PICKUP" },
          select: { createdAt: true },
        }),
      ]);
      const now = Date.now();
      const ages = waiting.map((p) => now - p.createdAt.getTime());
      const avgWaitMs = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
      const oldestWaitMs = ages.length ? Math.max(...ages) : null;
      return { store, overdue, returnAging, waitingCount: ages.length, avgWaitMs, oldestWaitMs };
    })
  );

  // Per-store 30-day rollup: received per carrier (with share) + pickup dwell.
  const periodFor = (storeId: string) => {
    const received = receivedPeriod.filter((r) => r.storeId === storeId);
    const receivedTotal = received.reduce((sum, r) => sum + r._count._all, 0);
    const dwells = pickedUpPeriod
      .filter((e) => e.storeId === storeId)
      .map((e) => e.scannedAt.getTime() - e.package.createdAt.getTime());
    const avgDwellMs = dwells.length ? dwells.reduce((a, b) => a + b, 0) / dwells.length : null;
    return { received, receivedTotal, pickedUp: dwells.length, avgDwellMs };
  };

  const receivedFor = (storeId: string) =>
    receivedToday.filter((r) => r.storeId === storeId);
  const completedFor = (storeId: string, status: string) =>
    completedToday.find((c) => c.storeId === storeId && c.toStatus === status)?._count._all ?? 0;
  const outboxCount = (status: string) =>
    outboxByStatus.find((o) => o.status === status)?._count._all ?? 0;

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Operations</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today, per store</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Picked up</TableHead>
                <TableHead>Handed off</TableHead>
                <TableHead>Returned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => {
                const received = receivedFor(store.id);
                const total = received.reduce((sum, r) => sum + r._count._all, 0);
                return (
                  <TableRow key={store.id}>
                    <TableCell>
                      {store.name} <span className="text-muted-foreground">({store.code})</span>
                    </TableCell>
                    <TableCell>
                      {total}
                      {total > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({received
                            .map((r) => `${CARRIER_LABELS[r.carrier]} ${r._count._all}`)
                            .join(", ")})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{completedFor(store.id, "PICKED_UP")}</TableCell>
                    <TableCell>{completedFor(store.id, "HANDED_OFF")}</TableCell>
                    <TableCell>{completedFor(store.id, "RETURNED_TO_CARRIER")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Busiest hours (last {PERIOD_DAYS} days) — staffing profile
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {[
            { label: "Received", data: receivedByHour, tone: "bg-primary/70" },
            { label: "Picked up", data: pickedByHour, tone: "bg-primary" },
          ].map((series) => (
            <div key={series.label} className="grid gap-1">
              <p className="text-xs text-muted-foreground">{series.label}</p>
              <div className="flex h-16 items-end gap-px overflow-x-auto">
                {series.data.map((count, hour) => (
                  <div key={hour} className="flex min-w-4 flex-1 flex-col items-center gap-0.5">
                    <div
                      className={`w-full rounded-t-sm ${count > 0 ? series.tone : "bg-muted"}`}
                      style={{ height: `${Math.max(count > 0 ? 8 : 2, (count / hourMax) * 56)}px` }}
                      title={`${String(hour).padStart(2, "0")}:00 — ${count}`}
                    />
                    {hour % 3 === 0 && (
                      <span className="text-[9px] text-muted-foreground">{hour}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlement export</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p className="text-muted-foreground">
            CSV per store and carrier for a month — received, picked up, handed off, returned —
            to reconcile against the carrier&rsquo;s settlement.
          </p>
          <form action="/api/settlement" method="GET" className="flex flex-wrap items-end gap-2">
            <Input type="month" name="month" defaultValue={defaultMonth} required className="w-44" aria-label="Settlement month" />
            <SubmitButton pendingText="Preparing…">Download CSV</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shelf right now</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {aging.map(({ store, overdue, returnAging, waitingCount, avgWaitMs, oldestWaitMs }) => (
            <p key={store.id}>
              <span className="text-muted-foreground">
                {store.name} ({store.code}):{" "}
              </span>
              {waitingCount === 0
                ? "nothing awaiting pickup"
                : `${waitingCount} awaiting pickup · avg wait ${formatDuration(avgWaitMs!)} · oldest ${formatDuration(oldestWaitMs!)}`}
              {overdue > 0 && (
                <>
                  {" · "}
                  <Link href="/packages?overdue=1" className="font-medium text-destructive underline-offset-2 hover:underline">
                    {overdue} overdue for return ({store.pickupDeadlineDays}-day deadline)
                  </Link>
                </>
              )}
              {returnAging > 0 &&
                ` · ${returnAging} return(s) awaiting driver collection for over ${RETURN_PENDING_AGE_DAYS} days`}
            </p>
          ))}
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
            <span className={outboxCount("FAILED") > 0 ? "font-medium text-destructive" : ""}>
              {outboxCount("FAILED")}
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
            {outboxCount("FAILED") > 0 && (
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
                <select
                  name="carrier"
                  aria-label="Carrier to re-queue"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">All carriers</option>
                  {CARRIER_PROVIDERS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {CARRIER_LABELS[p.code]}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="outline" pendingText="Re-queueing…">
                  Re-queue awaiting-credentials
                </SubmitButton>
              </form>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Use &ldquo;re-queue awaiting-credentials&rdquo; after a carrier&rsquo;s API goes live to
            backfill its history.
          </p>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
