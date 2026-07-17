import { prisma } from "@/lib/prisma";
import { apiError, apiJson, requireApiUser } from "@/lib/api-auth";
import { getPickupPolicy } from "@/lib/carriers";

/**
 * GET /api/v1/packages/:id — full detail for the app's package page:
 * the parcel, its scan history with verification summaries, and
 * notification log. Store-scoped like the web page.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireApiUser(request);
  if (auth.error) return auth.error;
  const { id } = await params;

  const pkg = await prisma.package.findUnique({
    where: { id },
    include: {
      store: { select: { name: true, code: true } },
      scanEvents: {
        orderBy: { scannedAt: "asc" },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          scannedAt: true,
          inputMethod: true,
          courierRef: true,
          note: true,
          user: { select: { name: true } },
          verification: {
            select: {
              presentedCode: true,
              codeValidated: true,
              idChecked: true,
              idType: true,
              collectorName: true,
              override: true,
              overrideReason: true,
            },
          },
        },
      },
      notifications: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          channel: true,
          recipient: true,
          status: true,
          message: true,
          createdAt: true,
        },
      },
    },
  });

  if (!pkg || (auth.user.role !== "ADMIN" && pkg.storeId !== auth.user.storeId)) {
    return apiError(404, "NOT_FOUND", "Package not found.");
  }
  // The carrier's pickup policy rides along so the app can gate its
  // handover UI without duplicating policy tables (server still enforces).
  return apiJson({ package: pkg, pickupPolicy: getPickupPolicy(pkg.carrier) });
}
