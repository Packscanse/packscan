"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/session";
import {
  executeScan,
  lookupScanContext,
  type ScanLookup,
  type ProcessScanResult,
} from "@/lib/scan-flow";
import { ScanInputSchema } from "@/lib/validation/scan";

// NOTE: "use server" files may only export async functions (even type
// re-exports are rejected by the bundler) — import ProcessScanResult and
// ScanLookup from "@/lib/scan-flow" instead.

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
 * What the scan screen wants to know about a just-captured code: a
 * pre-advice match (pre-filled intake, exact carrier) and/or a parcel
 * already awaiting pickup (jump straight to handover verification).
 */
export async function lookupScan(rawTrackingNumber: string): Promise<ScanLookup> {
  const session = await getRequiredSession();
  return lookupScanContext(session.user.storeId, rawTrackingNumber);
}
