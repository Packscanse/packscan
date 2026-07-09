import Link from "next/link";
import type { Package } from "@prisma/client";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CARRIER_LABELS } from "@/lib/carriers";
import { PackageStatusBadge } from "./PackageStatusBadge";

export function PackageTable({ packages }: { packages: Package[] }) {
  if (packages.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No packages match. Scan one on the Scan page, or adjust the filters.
      </p>
    );
  }

  return (
    <>
      {/* Handhelds get tappable cards; the table needs a desktop. */}
      <div className="grid gap-2 sm:hidden">
        {packages.map((pkg) => (
          <Link
            key={pkg.id}
            href={`/packages/${pkg.id}`}
            className="grid gap-1 rounded-lg border bg-background p-3 active:bg-muted"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-sm font-medium">{pkg.trackingNumber}</span>
              <PackageStatusBadge status={pkg.status} />
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {CARRIER_LABELS[pkg.carrier]}
                {pkg.customerName ? ` · ${pkg.customerName}` : ""}
              </span>
              {pkg.shelfLocation && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-semibold">
                  {pkg.shelfLocation}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {pkg.direction === "INBOUND" ? "Inbound" : "Outbound"} · updated{" "}
              {format(pkg.updatedAt, "MMM d, HH:mm")}
            </p>
          </Link>
        ))}
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tracking number</TableHead>
              <TableHead>Carrier</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Shelf</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((pkg) => (
              <TableRow key={pkg.id}>
                <TableCell className="font-mono">
                  <Link href={`/packages/${pkg.id}`} className="underline-offset-2 hover:underline">
                    {pkg.trackingNumber}
                  </Link>
                </TableCell>
                <TableCell>{CARRIER_LABELS[pkg.carrier]}</TableCell>
                <TableCell className="capitalize">{pkg.direction.toLowerCase()}</TableCell>
                <TableCell>
                  <PackageStatusBadge status={pkg.status} />
                </TableCell>
                <TableCell className="font-semibold">{pkg.shelfLocation ?? "—"}</TableCell>
                <TableCell>{pkg.customerName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {format(pkg.updatedAt, "MMM d, HH:mm")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
