import { apiError, apiJson, requireApiUser } from "@/lib/api-auth";
import { findPreAdviceMatch } from "@/lib/scan-flow";

/**
 * GET /api/v1/pre-advice?tracking=… — pre-advice match for a just-scanned
 * label: exact carrier attribution and pre-filled recipient details for the
 * app's intake form. Null match is a normal answer, not an error.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireApiUser(request);
  if (auth.error) return auth.error;

  const tracking = new URL(request.url).searchParams.get("tracking")?.trim() ?? "";
  if (!tracking) return apiError(422, "INVALID_INPUT", "Query parameter `tracking` is required.");

  const match = await findPreAdviceMatch(auth.user.storeId, tracking);
  return apiJson({ match });
}
