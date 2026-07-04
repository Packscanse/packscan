import Link from "next/link";
import { format } from "date-fns";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CARRIER_LABELS } from "@/lib/carriers";
import { PreAdviceImportForm } from "@/components/admin/PreAdviceImportForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * What the carriers announced as inbound for this store. Clerks use it to
 * spot announced-but-missing parcels the same day; the import form (admin)
 * is the manual seam until carrier API feeds exist.
 */
export default async function ExpectedPage() {
  const session = await getRequiredSession();

  const [announced, receivedToday] = await Promise.all([
    prisma.preAdvice.findMany({
      where: { storeId: session.user.storeId, status: "ANNOUNCED" },
      orderBy: { announcedAt: "asc" },
      take: 200,
    }),
    prisma.preAdvice.findMany({
      where: {
        storeId: session.user.storeId,
        status: "RECEIVED",
        receivedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Expected parcels</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Announced, not yet received ({announced.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {announced.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing outstanding — every announced parcel has been scanned in.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking number</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Announced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announced.map((advice) => (
                  <TableRow key={advice.id}>
                    <TableCell className="font-mono">{advice.trackingNumber}</TableCell>
                    <TableCell>{CARRIER_LABELS[advice.carrier]}</TableCell>
                    <TableCell>{advice.customerName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(advice.announcedAt, "MMM d, HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {receivedToday.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Received today ({receivedToday.length})</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {receivedToday.map((advice) => (
              <p key={advice.id}>
                {advice.packageId ? (
                  <Link
                    href={`/packages/${advice.packageId}`}
                    className="font-mono underline-offset-2 hover:underline"
                  >
                    {advice.trackingNumber}
                  </Link>
                ) : (
                  <span className="font-mono">{advice.trackingNumber}</span>
                )}{" "}
                <Badge variant="secondary">{CARRIER_LABELS[advice.carrier]}</Badge>{" "}
                <span className="text-muted-foreground">
                  {advice.receivedAt ? format(advice.receivedAt, "HH:mm") : ""}
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {session.user.role === "ADMIN" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import pre-advice</CardTitle>
          </CardHeader>
          <CardContent>
            <PreAdviceImportForm storeId={session.user.storeId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
