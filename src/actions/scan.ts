"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/lib/session";
import { registerScan, type HandoverContext } from "@/lib/packages";
import { ScanInputSchema } from "@/lib/validation/scan";
import type { PackageStatus } from "@prisma/client";

// Serializable result for the client component (no Date objects / full models).
export type ProcessScanResult =
  | {
      ok: true;
      kind: "created" | "transitioned";
      packageId: string;
      trackingNumber: string;
      carrier: string;
      status: PackageStatus;
      fromStatus?: PackageStatus;
    }
  // Pickup completion needs the handover step: resubmit with `verification`.
  | { ok: false; code: "VERIFICATION_REQUIRED"; error: string; handover: HandoverContext }
  | { ok: false; code?: undefined; error: string };

export async function processScan(input: unknown): Promise<ProcessScanResult> {
  const session = await getRequiredSession();
  const parsed = ScanInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid scan input. Check the tracking number and try again." };
  }

  // storeId/userId always come from the session — never from the client.
  const outcome = await registerScan({
    ...parsed.data,
    storeId: session.user.storeId,
    userId: session.user.id,
  });

  if (!outcome.ok) {
    if (outcome.code === "VERIFICATION_REQUIRED") {
      return {
        ok: false,
        code: "VERIFICATION_REQUIRED",
        error: outcome.error,
        handover: outcome.handover,
      };
    }
    return { ok: false, error: outcome.error };
  }

  revalidatePath("/packages");
  return {
    ok: true,
    kind: outcome.kind,
    packageId: outcome.package.id,
    trackingNumber: outcome.package.trackingNumber,
    carrier: outcome.package.carrier,
    status: outcome.package.status,
    fromStatus: outcome.kind === "transitioned" ? outcome.fromStatus : undefined,
  };
}
