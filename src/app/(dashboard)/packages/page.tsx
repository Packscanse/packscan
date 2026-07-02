import type { Direction, PackageStatus, Prisma } from "@prisma/client";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/status";
import { PackageTable } from "@/components/packages/PackageTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUSES = Object.keys(STATUS_LABELS) as PackageStatus[];
const DIRECTIONS: Direction[] = ["INBOUND", "OUTBOUND"];

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; direction?: string; q?: string }>;
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

  const where: Prisma.PackageWhereInput = {
    storeId: session.user.storeId,
    ...(status && { status }),
    ...(direction && { direction }),
    ...(q && {
      OR: [
        { trackingNumber: { contains: q.toUpperCase() } },
        { customerName: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const packages = await prisma.package.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Packages</h1>

      {/* GET form: filters live in the URL, no client JS needed */}
      <form className="flex flex-wrap items-end gap-2" method="GET">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search tracking # or customer"
          className="w-full sm:w-64"
          aria-label="Search packages"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
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
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <PackageTable packages={packages} />
    </div>
  );
}
