"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/session";
import {
  executeScan,
  findPreAdviceMatch,
  type PreAdviceMatch,
  type ProcessScanResult,
} from "@/lib/scan-flow";
import { ScanInputSchema } from "@/lib/validation/scan";

export type { PreAdviceMatch, ProcessScanResult } from "@/lib/scan-flow";

/** Web scan entry: session → executeScan (shared with POST /api/v1/scans). */
export async function processScan(input: unknown): Promise<ProcessScanResult> {
  const session = await getRequiredSession();
  const parsed = ScanInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Invalid scan input. Check the tracking number and try again.",
    };
  }
  const result = await executeScan(
    {
      id: session.user.id,
      storeId: session.user.storeId,
      role: session.user.role,
      authMethod: session.user.authMethod,
    },
    parsed.data
  );
  if (result.ok) revalidatePath("/packages");
  return result;
}

/**
 * Pre-advice match for a just-scanned tracking number: exact carrier
 * attribution and pre-filled recipient details, no typing at intake.
 */
export async function lookupPreAdvice(
  rawTrackingNumber: string
): Promise<PreAdviceMatch | null> {
  const session = await getRequiredSession();
  return findPreAdviceMatch(session.user.storeId, rawTrackingNumber);
}
