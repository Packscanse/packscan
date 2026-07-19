import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, loadApiScopedPackage, requireApiUser } from "@/lib/api-auth";
import { advanceStatus, cancelPackage, markForReturn } from "@/lib/packages";
import { CancelReasonSchema, CourierRefSchema } from "@/lib/validation/scan";

// One endpoint for the non-pickup status changes; pickup has its own route
// because it carries the verification payload.
const ActionSchema = z.discriminatedUnion("action", [
  // HANDED_OFF / RETURNED_TO_CARRIER (whichever the state machine allows).
  z.object({ action: z.literal("advance"), courierRef: CourierRefSchema }),
  z.object({ action: z.literal("mark-return"), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("cancel"), reason: CancelReasonSchema }),
]);

/** POST /api/v1/packages/:id/actions — { action: "advance" | "mark-return" | "cancel", … } */
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
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "INVALID_INPUT", "Unknown or malformed action.");

  const base = { pkg, storeId: pkg.storeId, userId: auth.user.id };
  const outcome =
    parsed.data.action === "advance"
      ? await advanceStatus({
          ...base,
          inputMethod: "STATUS_ACTION",
          courierRef: parsed.data.courierRef,
        })
      : parsed.data.action === "mark-return"
        ? await markForReturn({ ...base, reason: parsed.data.reason })
        : await cancelPackage({ ...base, reason: parsed.data.reason });

  if (!outcome.ok) return apiError(422, outcome.code ?? "INVALID_ACTION", outcome.error);
  return NextResponse.json({
    ok: true,
    packageId: outcome.package.id,
    status: outcome.package.status,
  });
}
