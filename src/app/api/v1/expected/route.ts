import { prisma } from "@/lib/prisma";
import { apiJson, requireApiUser } from "@/lib/api-auth";

/**
 * GET /api/v1/expected — what carriers announced as inbound for this store:
 * outstanding pre-advice plus today's received, mirroring the web page.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireApiUser(request);
  if (auth.error) return auth.error;

  const select = {
    id: true,
    trackingNumber: true,
    carrier: true,
    customerName: true,
    announcedAt: true,
    receivedAt: true,
    packageId: true,
  } as const;

  const [announced, receivedToday] = await Promise.all([
    prisma.preAdvice.findMany({
      where: { storeId: auth.user.storeId, status: "ANNOUNCED" },
      orderBy: { announcedAt: "asc" },
      take: 200,
      select,
    }),
    prisma.preAdvice.findMany({
      where: {
        storeId: auth.user.storeId,
        status: "RECEIVED",
        receivedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
      select,
    }),
  ]);

  return apiJson({ announced, receivedToday });
}
