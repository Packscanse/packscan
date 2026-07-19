import { NextResponse } from "next/server";
import { apiError, loadApiScopedPackage, requireApiUser } from "@/lib/api-auth";
import { advanceStatus } from "@/lib/packages";
import { HandoverInputSchema } from "@/lib/validation/scan";

/**
 * POST /api/v1/packages/:id/pickup — complete a customer pickup with the
 * handover verification (carrier-app code / ID check / override). Same
 * policy enforcement as the web: the server re-validates against the
 * carrier's pickup policy, and a PIN token acts as CLERK so overrides
 * always require a password sign-in.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireApiUser(request);
  if (auth.error) return auth.error;
  const { id } = await params;

  const pkg = await loadApiScopedPackage(auth.user, id);
  if (!pkg) return apiError(404, "NOT_FOUND", "Package not found.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Body must be JSON.");
  }
  const parsed = HandoverInputSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "INVALID_INPUT", "Invalid verification input.");

  const outcome = await advanceStatus({
    pkg,
    storeId: pkg.storeId,
    userId: auth.user.id,
    inputMethod: "STATUS_ACTION",
    verification: parsed.data,
    actorRole: auth.user.authMethod === "PASSWORD" ? auth.user.role : "CLERK",
  });
  if (!outcome.ok) return apiError(422, outcome.code ?? "INVALID_ACTION", outcome.error);

  return NextResponse.json({
    ok: true,
    packageId: outcome.package.id,
    status: outcome.package.status,
  });
}
