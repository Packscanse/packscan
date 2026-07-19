import Link from "next/link";
import type { Direction, PackageStatus, Prisma } from "@prisma/client";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/status";
import { getT } from "@/lib/i18n/server";
import { PackageTable } from "@/components/packages/PackageTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

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
  const t = await getT();
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
        <h1 className="text-xl font-semibold">{t.packages.title}</h1>
        {overdueCount > 0 && !overdue && (
          <Button asChild variant="destructive" size="sm">
            <Link href="/packages?overdue=1">
              {t.packages.overdueButton
                .replace("{count}", String(overdueCount))
                .replace("{days}", String(deadlineDays))}
            </Link>
          </Button>
        )}
        {overdue && (
          <p className="text-sm text-muted-foreground">
            {t.packages.overdueHint.replace("{days}", String(deadlineDays))}
          </p>
        )}
      </div>

      {/* GET form: filters live in the URL, no client JS needed */}
      <form className="flex flex-wrap items-end gap-2" method="GET">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t.packages.searchPlaceholder}
          className="w-full sm:w-64"
          aria-label={t.packages.searchPlaceholder}
        />
        <NativeSelect
          name="status"
          defaultValue={overdue ? "" : (status ?? "")}
          aria-label={t.packages.colStatus}
        >
          <option value="">{t.packages.allStatuses}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.status[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="direction"
          defaultValue={direction ?? ""}
          aria-label={t.packages.colDirection}
        >
          <option value="">{t.packages.bothDirections}</option>
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d === "INBOUND" ? t.packages.inbound : t.packages.outbound}
            </option>
          ))}
        </NativeSelect>
        <label className="grid gap-1 text-xs text-muted-foreground">
          {t.packages.registeredFrom}
          <Input type="date" name="from" defaultValue={params.from ?? ""} className="h-9" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          {t.packages.to}
          <Input type="date" name="to" defaultValue={params.to ?? ""} className="h-9" />
        </label>
        <Button type="submit" variant="secondary">
          {t.packages.filter}
        </Button>
        {overdue && (
          <Button asChild variant="outline">
            <Link href="/packages">{t.packages.clearOverdue}</Link>
          </Button>
        )}
      </form>

      <PackageTable packages={packages} />

      {pageCount > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageLink(page - 1)}>{t.packages.previous}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            {t.packages.pageOf
              .replace("{page}", String(page))
              .replace("{pages}", String(pageCount))
              .replace("{total}", String(total))}
          </span>
          {page < pageCount && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageLink(page + 1)}>{t.packages.next}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
