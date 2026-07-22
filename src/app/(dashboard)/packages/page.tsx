import Link from "next/link";
import type { Direction, PackageStatus, Prisma } from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/status";
import { formatDuration } from "@/lib/duration";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { PackageTable } from "@/components/packages/PackageTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const STATUSES = Object.keys(STATUS_LABELS) as PackageStatus[];
const DIRECTIONS: Direction[] = ["INBOUND", "OUTBOUND"];
const PAGE_SIZE = 50;
// The shelf's mental model: what waits, what must go back, what ships out.
const VIEWS = ["waiting", "return", "outbound", "all"] as const;
type ShelfView = (typeof VIEWS)[number];

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function ViewPill({
  href,
  active,
  danger = false,
  children,
}: {
  href: string;
  active: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors",
        danger
          ? active
            ? "bg-[#dc2626] text-white"
            : "border border-danger-border bg-danger-surface text-danger-foreground"
          : active
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-muted-foreground"
      )}
    >
      {children}
    </Link>
  );
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
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
  // Legacy/advanced params (ops links, saved URLs) fall through to "all";
  // a bare /packages is the shelf itself: what's waiting, oldest first.
  const hasCustomFilter = Boolean(status || direction || overdue || q || from || to);
  const view: ShelfView = VIEWS.includes(params.view as ShelfView)
    ? (params.view as ShelfView)
    : hasCustomFilter
      ? "all"
      : "waiting";

  const store = await prisma.store.findUnique({
    where: { id: session.user.storeId },
    select: { pickupDeadlineDays: true },
  });
  const deadlineDays = store?.pickupDeadlineDays ?? 7;
  const overdueCutoff = new Date(Date.now() - deadlineDays * 24 * 60 * 60 * 1000);

  const storeScope = { storeId: session.user.storeId };
  const returnWhere: Prisma.PackageWhereInput = {
    ...storeScope,
    OR: [
      { status: "RETURN_PENDING" },
      { status: "AWAITING_PICKUP", createdAt: { lt: overdueCutoff } },
    ],
  };
  const outboundWhere: Prisma.PackageWhereInput = {
    ...storeScope,
    direction: "OUTBOUND",
    status: "PENDING_HANDOFF",
  };

  const search: Prisma.PackageWhereInput | undefined = q
    ? {
        OR: [
          { trackingNumber: { contains: q.toUpperCase() } },
          { customerName: { contains: q, mode: "insensitive" } },
          { customerPhone: { contains: q } },
        ],
      }
    : undefined;

  const allWhere: Prisma.PackageWhereInput = {
    ...storeScope,
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
  };

  const viewWhere: Record<ShelfView, Prisma.PackageWhereInput> = {
    waiting: { ...storeScope, status: "AWAITING_PICKUP" },
    return: returnWhere,
    outbound: outboundWhere,
    all: allWhere,
  };
  const where: Prisma.PackageWhereInput = search
    ? { AND: [viewWhere[view], search] }
    : viewWhere[view];
  // Waiting/return read oldest-first: the most overdue parcel tops the list.
  const orderBy: Prisma.PackageOrderByWithRelationInput =
    view === "all" ? { updatedAt: "desc" } : { createdAt: "asc" };

  const [packages, total, waitingCount, returnCount, outboundCount, oldestWaiting] =
    await Promise.all([
      prisma.package.findMany({
        where,
        orderBy,
        take: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
      }),
      prisma.package.count({ where }),
      prisma.package.count({ where: { ...storeScope, status: "AWAITING_PICKUP" } }),
      prisma.package.count({ where: returnWhere }),
      prisma.package.count({ where: outboundWhere }),
      prisma.package.aggregate({
        where: { ...storeScope, status: "AWAITING_PICKUP" },
        _min: { createdAt: true },
      }),
    ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (p: number) => {
    const sp = new URLSearchParams();
    if (params.view) sp.set("view", params.view);
    if (q) sp.set("q", q);
    if (status) sp.set("status", status);
    if (direction) sp.set("direction", direction);
    if (overdue) sp.set("overdue", "1");
    if (params.from) sp.set("from", params.from);
    if (params.to) sp.set("to", params.to);
    if (p > 1) sp.set("page", String(p));
    return `/packages?${sp.toString()}`;
  };

  const oldest = oldestWaiting._min.createdAt;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">{t.packages.title}</h1>
        {waitingCount > 0 && oldest && (
          <p className="text-sm text-muted-foreground">
            {t.packages.subtitle
              .replace("{count}", String(waitingCount))
              .replace("{duration}", formatDuration(Date.now() - oldest.getTime()))}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ViewPill href="/packages" active={view === "waiting"}>
          {t.packages.viewWaiting} {waitingCount}
        </ViewPill>
        {returnCount > 0 && (
          <ViewPill href="/packages?view=return" active={view === "return"} danger>
            <AlertTriangle className="size-3.5" />
            {t.packages.viewReturn} {returnCount}
          </ViewPill>
        )}
        {outboundCount > 0 && (
          <ViewPill href="/packages?view=outbound" active={view === "outbound"}>
            {t.packages.viewOutbound} {outboundCount}
          </ViewPill>
        )}
        <ViewPill href="/packages?view=all" active={view === "all" && !hasCustomFilter}>
          {t.packages.viewAll}
        </ViewPill>
      </div>

      {/* GET form: filters live in the URL, no client JS needed. */}
      <form className="grid gap-2" method="GET">
        {params.view && <input type="hidden" name="view" value={params.view} />}
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t.packages.searchPlaceholder}
          className="h-13 rounded-[16px] px-4 text-base"
          aria-label={t.packages.searchPlaceholder}
        />
        <details className="group">
          <summary className="cursor-pointer list-none text-[13px] text-muted-foreground underline underline-offset-4">
            {t.packages.moreFilters}
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
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
          </div>
        </details>
      </form>

      <PackageTable
        packages={packages}
        deadlineDays={deadlineDays}
        overdueCutoff={overdueCutoff}
      />

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
