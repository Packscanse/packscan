import { NextResponse } from "next/server";
import { apiError, loadApiScopedPackage, requireApiUser } from "@/lib/api-auth";
import { lookupCarrierStatus } from "@/lib/carrier-lookup";

/**
 * GET /api/v1/packages/:id/carrier-status — live "where is this parcel?"
 * lookup at the carrier, for lost-parcel investigations from the app.
 * Read-only; NOT_CONFIGURED until carrier API credentials exist.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireApiUser(request);
  if (auth.error) return auth.error;
  const { id } = await params;

  const pkg = await loadApiScopedPackage(auth.user, id);
  if (!pkg) return apiError(404, "NOT_FOUND", "Package not found.");

  return NextResponse.json(await lookupCarrierStatus(pkg));
}
