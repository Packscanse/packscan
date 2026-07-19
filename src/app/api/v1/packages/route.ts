import type { Direction, PackageStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STATUS_LABELS } from "@/lib/status";
import { apiJson, requireApiUser } from "@/lib/api-auth";

const STATUSES = Object.keys(STATUS_LABELS) as PackageStatus[];
const DIRECTIONS: Direction[] = ["INBOUND", "OUTBOUND"];
const PAGE_SIZE = 50;

/**
 * GET /api/v1/packages?status=&direction=&q=&overdue=1&page= — the app's
 * package list, always scoped to the caller's store. Same filters as the
 * web page; unknown filter values are ignored rather than rejected.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireApiUser(request);
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  const status = STATUSES.includes(params.get("status") as PackageStatus)
    ? (params.get("status") as PackageStatus)
    : undefined;
  const direction = DIRECTIONS.includes(params.get("direction") as Direction)
    ? (params.get("direction") as Direction)
    : undefined;
  const q = params.get("q")?.trim() || undefined;
  const overdue = params.get("overdue") === "1";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const store = await prisma.store.findUnique({
    where: { id: auth.user.storeId },
    select: { pickupDeadlineDays: true },
  });
  const deadlineDays = store?.pickupDeadlineDays ?? 7;
  const overdueCutoff = new Date(Date.now() - deadlineDays * 24 * 60 * 60 * 1000);

  const where: Prisma.PackageWhereInput = {
    storeId: auth.user.storeId,
    ...(overdue
      ? { status: "AWAITING_PICKUP", createdAt: { lt: overdueCutoff } }
      : status && { status }),
    ...(direction && { direction }),
    ...(q && {
      OR: [
        { trackingNumber: { contains: q.toUpperCase() } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q } },
      ],
    }),
  };

  const [packages, total] = await Promise.all([
    prisma.package.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        trackingNumber: true,
        carrier: true,
        direction: true,
        status: true,
        customerName: true,
        shelfLocation: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.package.count({ where }),
  ]);

  return apiJson({
    packages,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    deadlineDays,
  });
}
