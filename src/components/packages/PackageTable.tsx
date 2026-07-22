import Link from "next/link";
import type { Package } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { carrierLabel } from "@/lib/carriers";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { getT } from "@/lib/i18n/server";
import { ShelfChip } from "@/components/shelf/ShelfBlock";
import { PackageStatusBadge } from "./PackageStatusBadge";

/** How long a still-waiting parcel has been on the shelf; null once handled. */
function waitingFor(pkg: Package): string | null {
  if (pkg.status !== "AWAITING_PICKUP" && pkg.status !== "RETURN_PENDING") return null;
  return formatDuration(Date.now() - pkg.createdAt.getTime());
}

export async function PackageTable({
  packages,
  deadlineDays,
  overdueCutoff,
}: {
  packages: Package[];
  /** The store's pickup deadline — rows past it go loud red. */
  deadlineDays: number;
  overdueCutoff: Date;
}) {
  const t = await getT();
  if (packages.length === 0) {
    return (
      <p className="rounded-[16px] border border-dashed border-dash p-8 text-center text-sm text-muted-foreground">
        {t.packages.empty}
      </p>
    );
  }

  // A row goes red when the parcel needs to leave: past the pickup deadline,
  // or already marked for return.
  const rowState = (pkg: Package) => {
    const overdue = pkg.status === "AWAITING_PICKUP" && pkg.createdAt < overdueCutoff;
    return { overdue, danger: overdue || pkg.status === "RETURN_PENDING" };
  };
  const dayOn = (pkg: Package) =>
    Math.max(1, Math.ceil((Date.now() - pkg.createdAt.getTime()) / 86_400_000));

  return (
    <>
      {/* Handhelds get tappable shelf rows; the table needs a desktop. */}
      <div className="grid gap-2 sm:hidden">
        {packages.map((pkg) => {
          const { overdue, danger } = rowState(pkg);
          const waiting = waitingFor(pkg);
          return (
            <Link
              key={pkg.id}
              href={`/packages/${pkg.id}`}
              className={cn(
                "flex items-center gap-3.5 rounded-[16px] border p-3 active:bg-muted",
                danger ? "border-danger-border bg-danger-surface" : "border-border bg-card"
              )}
            >
              <ShelfChip code={pkg.shelfLocation} danger={danger} size="row" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-[15px] font-bold">
                  {pkg.customerName ?? pkg.trackingNumber}
                  {overdue &&
                    ` · ${t.packages.dayOf
                      .replace("{n}", String(dayOn(pkg)))
                      .replace("{days}", String(deadlineDays))}`}
                </span>
                <span
                  className={cn(
                    "truncate text-xs",
                    danger ? "text-danger-foreground" : "text-muted-foreground"
                  )}
                >
                  {danger
                    ? t.packages.returnTo.replace("{carrier}", carrierLabel(pkg.carrier, t))
                    : `${carrierLabel(pkg.carrier, t)} · ${
                        waiting
                          ? `${t.packages.waiting} ${waiting}`
                          : `${t.status[pkg.status]} · ${format(pkg.updatedAt, "MMM d")}`
                      }`}
                </span>
              </span>
              <ChevronRight className="size-[18px] shrink-0 text-faint" />
            </Link>
          );
        })}
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.packages.colShelf}</TableHead>
              <TableHead>{t.packages.colCustomer}</TableHead>
              <TableHead>{t.packages.colTracking}</TableHead>
              <TableHead>{t.packages.colCarrier}</TableHead>
              <TableHead>{t.packages.colStatus}</TableHead>
              <TableHead>{t.packages.colWaiting}</TableHead>
              <TableHead>{t.packages.colUpdated}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map((pkg) => {
              const { overdue, danger } = rowState(pkg);
              return (
                <TableRow
                  key={pkg.id}
                  className={cn(
                    "relative cursor-pointer hover:bg-muted/50",
                    danger && "bg-danger-surface hover:bg-danger-surface/70"
                  )}
                >
                  <TableCell>
                    <ShelfChip code={pkg.shelfLocation} danger={danger} size="desktop" />
                  </TableCell>
                  <TableCell className="font-medium">
                    {pkg.customerName ?? "—"}
                    {overdue && (
                      <span className="text-danger-foreground">
                        {" "}
                        ·{" "}
                        {t.packages.dayOf
                          .replace("{n}", String(dayOn(pkg)))
                          .replace("{days}", String(deadlineDays))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">
                    <Link href={`/packages/${pkg.id}`} className="underline-offset-2 hover:underline">
                      {pkg.trackingNumber}
                    </Link>
                    {/* Pointer-only overlay makes the whole row a target; keyboard
                        and screen readers keep the visible link above. */}
                    <Link
                      href={`/packages/${pkg.id}`}
                      tabIndex={-1}
                      aria-hidden
                      className="absolute inset-0"
                    />
                  </TableCell>
                  <TableCell>{carrierLabel(pkg.carrier, t)}</TableCell>
                  <TableCell>
                    <PackageStatusBadge status={pkg.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{waitingFor(pkg) ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(pkg.updatedAt, "MMM d, HH:mm")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
