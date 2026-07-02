import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminOverviewPage() {
  const [stores, statusCounts, recentEvents] = await Promise.all([
    prisma.store.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true, packages: true } } },
    }),
    prisma.package.groupBy({ by: ["storeId", "status"], _count: { _all: true } }),
    prisma.scanEvent.findMany({
      orderBy: { scannedAt: "desc" },
      take: 15,
      include: {
        package: { select: { trackingNumber: true, id: true } },
        store: { select: { code: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const countFor = (storeId: string, status: "AWAITING_PICKUP" | "PENDING_HANDOFF") =>
    statusCounts.find((c) => c.storeId === storeId && c.status === status)?._count._all ?? 0;

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Admin overview</h1>

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
