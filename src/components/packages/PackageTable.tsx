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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tracking number</TableHead>
          <TableHead>Carrier</TableHead>
          <TableHead>Direction</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden sm:table-cell">Customer</TableHead>
          <TableHead className="hidden sm:table-cell">Updated</TableHead>
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
            <TableCell className="hidden sm:table-cell">{pkg.customerName ?? "—"}</TableCell>
            <TableCell className="hidden text-muted-foreground sm:table-cell">
              {format(pkg.updatedAt, "MMM d, HH:mm")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
