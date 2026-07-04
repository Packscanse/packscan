import Link from "next/link";
import type { Direction, PackageStatus, Prisma } from "@prisma/client";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/status";
import { PackageTable } from "@/components/packages/PackageTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUSES = Object.keys(STATUS_LABELS) as PackageStatus[];
const DIRECTIONS: Direction[] = ["INBOUND", "OUTBOUND"];
const PAGE_SIZE = 50;

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    direction?: string;
    q?: string;
    overdue?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const session = await getRequiredSession();
  const params = await searchParams;

  const status = STATUSES.includes(params.status as PackageStatus)
    ? (params.status as PackageStatus)
    : undefined;
  const direction = DIRECTIONS.includes(params.direction as Direction)
    ? (params.direction as Direction)
    : undefined;
  const q = params.q?.trim();
  const overdue = params.overdue === "1";
  const from = parseDate(params.from);
  const to = parseDate(params.to);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const store = await prisma.store.findUnique({
    where: { id: session.user.storeId },
    select: { pickupDeadlineDays: true },
  });
  const deadlineDays = store?.pickupDeadlineDays ?? 7;
  const overdueCutoff = new Date(Date.now() - deadlineDays * 24 * 60 * 60 * 1000);

  const where: Prisma.PackageWhereInput = {
    storeId: session.user.storeId,
    ...(overdue
      ? { status: "AWAITING_PICKUP", createdAt: { lt: overdueCutoff } }
      : status && { status }),
    ...(direction && { direction }),
    ...((from || to) && {
      createdAt: {
        ...(overdue ? { lt: overdueCutoff } : {}),
        ...(from && { gte: from }),
        ...(to && { lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) }),
      },
    }),
    ...(q && {
      OR: [
        { trackingNumber: { contains: q.toUpperCase() } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q } },
      ],
    }),
  };

  const [packages, total, overdueCount] = await Promise.all([
    prisma.package.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.package.count({ where }),
    prisma.package.count({
      where: { storeId: session.user.storeId, status: "AWAITING_PICKUP", createdAt: { lt: overdueCutoff } },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (direction) sp.set("direction", direction);
    if (overdue) sp.set("overdue", "1");
    if (params.from) sp.set("from", params.from);
    if (params.to) sp.set("to", params.to);
    if (p > 1) sp.set("page", String(p));
    return `/packages?${sp.toString()}`;
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Packages</h1>
        {overdueCount > 0 && !overdue && (
          <Button asChild variant="destructive" size="sm">
            <Link href="/packages?overdue=1">
              {overdueCount} overdue for return ({deadlineDays}-day deadline)
            </Link>
          </Button>
        )}
        {overdue && (
          <p className="text-sm text-muted-foreground">
            Awaiting pickup longer than {deadlineDays} days — mark these for return.
          </p>
        )}
      </div>

      {/* GET form: filters live in the URL, no client JS needed */}
      <form className="flex flex-wrap items-end gap-2" method="GET">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search tracking #, customer or phone"
          className="w-full sm:w-64"
          aria-label="Search packages"
        />
        <select
          name="status"
          defaultValue={overdue ? "" : (status ?? "")}
          aria-label="Filter by status"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          name="direction"
          defaultValue={direction ?? ""}
          aria-label="Filter by direction"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="">Both directions</option>
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Registered from
          <Input type="date" name="from" defaultValue={params.from ?? ""} className="h-9" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          to
          <Input type="date" name="to" defaultValue={params.to ?? ""} className="h-9" />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {overdue && (
          <Button asChild variant="outline">
            <Link href="/packages">Clear overdue view</Link>
          </Button>
        )}
      </form>

      <PackageTable packages={packages} />

      {pageCount > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageLink(page - 1)}>← Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page} of {pageCount} · {total} package(s)
          </span>
          {page < pageCount && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageLink(page + 1)}>Next →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
