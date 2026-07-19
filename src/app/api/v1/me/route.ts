import { prisma } from "@/lib/prisma";
import { apiJson, requireApiUser } from "@/lib/api-auth";

/**
 * GET /api/v1/me — who does this token belong to, right now. The app calls
 * it at launch to validate a stored token and refresh role/store/branding
 * (including the logo, which is too heavy for the login response).
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireApiUser(request);
  if (auth.error) return auth.error;

  const store = await prisma.store.findUnique({
    where: { id: auth.user.storeId },
    select: {
      id: true,
      name: true,
      code: true,
      brandColor: true,
      logoData: true,
      pickupDeadlineDays: true,
      sessionIdleMinutes: true,
    },
  });

  return apiJson({ user: auth.user, store });
}
