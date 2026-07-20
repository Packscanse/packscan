import Link from "next/link";
import { format } from "date-fns";
import { getRequiredManagerSession, managedStoreId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/status";
import { resolveAlertAction } from "@/actions/operations";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Alert messages arrive as one string with the stack-level cause appended
 * ("… Last error: connect ETIMEDOUT …"). Managers read the headline; the
 * technical tail collapses behind a disclosure.
 */
function splitAlertMessage(message: string): [string, string | null] {
  const idx = message.indexOf("Last error:");
  if (idx === -1) return [message, null];
  return [message.slice(0, idx).trim(), message.slice(idx).trim()];
}

export default async function AdminOverviewPage() {
  const session = await getRequiredManagerSession();
  // Managers see their own store; chain admins see everything.
  const scope = managedStoreId(session);
  const [openAlerts, stores, statusCounts, recentEvents, recentOverrides] = await Promise.all([
    prisma.adminAlert.findMany({
      where: { resolvedAt: null, ...(scope && { storeId: scope }) },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { store: { select: { code: true } } },
    }),
    prisma.store.findMany({
      where: scope ? { id: scope } : undefined,
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true, packages: true } } },
    }),
    prisma.package.groupBy({
      by: ["storeId", "status"],
      where: scope ? { storeId: scope } : undefined,
      _count: { _all: true },
    }),
    prisma.scanEvent.findMany({
      where: scope ? { storeId: scope } : undefined,
      orderBy: { scannedAt: "desc" },
      take: 15,
      include: {
        package: { select: { trackingNumber: true, id: true } },
        store: { select: { code: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.handoverVerification.findMany({
      where: { override: true, ...(scope && { scanEvent: { storeId: scope } }) },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        scanEvent: {
          include: {
            package: { select: { trackingNumber: true, id: true } },
            store: { select: { code: true } },
            user: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const countFor = (storeId: string, status: "AWAITING_PICKUP" | "PENDING_HANDOFF") =>
    statusCounts.find((c) => c.storeId === storeId && c.status === status)?._count._all ?? 0;

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Admin overview</h1>

      {/* Dead-lettered carrier events and anything else that stopped working
          silently. Stays until someone resolves it, so nothing is missed. */}
      {openAlerts.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Alerts ({openAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {openAlerts.map((alert) => {
              const [headline, techDetail] = splitAlertMessage(alert.message);
              return (
                <div key={alert.id} className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="text-muted-foreground">
                        {format(alert.createdAt, "MMM d, HH:mm")} · {alert.store.code} ·{" "}
                      </span>
                      {alert.packageId ? (
                        <Link
                          href={`/packages/${alert.packageId}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {headline}
                        </Link>
                      ) : (
                        headline
                      )}
                    </p>
                    {techDetail && (
                      <details className="mt-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none">Technical details</summary>
                        <p className="mt-1 break-all font-mono">{techDetail}</p>
                      </details>
                    )}
                  </div>
                  <form action={resolveAlertAction.bind(null, alert.id)}>
                    <SubmitButton variant="outline" size="sm" pendingText="Resolving…">
                      Resolve
                    </SubmitButton>
                  </form>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stores</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Packages</TableHead>
                <TableHead>Awaiting pickup</TableHead>
                <TableHead>Pending handoff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell>
                    {store.name} <span className="text-muted-foreground">({store.code})</span>
                  </TableCell>
                  <TableCell>{store._count.users}</TableCell>
                  <TableCell>{store._count.packages}</TableCell>
                  <TableCell>{countFor(store.id, "AWAITING_PICKUP")}</TableCell>
                  <TableCell>{countFor(store.id, "PENDING_HANDOFF")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Overrides skip the carrier's verification policy — every one of
          them deserves a manager's glance. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Manager overrides (all stores{recentOverrides.length > 0 ? `, last ${recentOverrides.length}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {recentOverrides.length === 0 && (
            <p className="text-muted-foreground">No overrides recorded.</p>
          )}
          {recentOverrides.map((v) => (
            <p key={v.id}>
              <span className="text-muted-foreground">
                {format(v.createdAt, "MMM d, HH:mm")} · {v.scanEvent.store.code} ·{" "}
              </span>
              <Link
                href={`/packages/${v.scanEvent.package.id}`}
                className="font-mono underline-offset-2 hover:underline"
              >
                {v.scanEvent.package.trackingNumber}
              </Link>
              <span className="text-muted-foreground"> by {v.scanEvent.user.name} — </span>
              {v.overrideReason}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity (all stores)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {recentEvents.length === 0 && (
            <p className="text-muted-foreground">No scans yet.</p>
          )}
          {recentEvents.map((event) => (
            <p key={event.id}>
              <span className="text-muted-foreground">
                {format(event.scannedAt, "MMM d, HH:mm")} · {event.store.code} ·{" "}
              </span>
              <Link
                href={`/packages/${event.package.id}`}
                className="font-mono underline-offset-2 hover:underline"
              >
                {event.package.trackingNumber}
              </Link>{" "}
              → {STATUS_LABELS[event.toStatus]}
              <span className="text-muted-foreground"> by {event.user.name}</span>
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
