import { NextResponse } from "next/server";
import { apiError, requireApiUser } from "@/lib/api-auth";
import { executeScan } from "@/lib/scan-flow";
import { ScanInputSchema } from "@/lib/validation/scan";

/**
 * POST /api/v1/scans — the app's version of the Scan screen submit. Body is
 * the same ScanInput the web uses (flow, trackingNumber, carrier pick,
 * details, optional handover verification, optional offline replay stamp).
 * A VERIFICATION_REQUIRED response carries the handover context; the app
 * shows its verification screen and resubmits with `verification`.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireApiUser(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Body must be JSON.");
  }
  const parsed = ScanInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "INVALID_INPUT", "Invalid scan input. Check the tracking number.");
  }

  const result = await executeScan(auth.user, parsed.data);
  if (!result.ok && result.code === "VERIFICATION_REQUIRED") {
    // Not an error from the app's perspective — a required next step.
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
