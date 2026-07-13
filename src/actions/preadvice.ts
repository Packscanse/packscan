"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRequiredManagerSession, managedStoreId } from "@/lib/session";
import { PreAdviceLineSchema } from "@/lib/validation/admin";

export type ImportState = { error?: string; success?: string };

/**
 * Paste-import seam for carrier pre-advice, one parcel per line:
 *   TRACKING,CARRIER[,NAME][,PHONE][,EMAIL]
 * Replaced by direct carrier-API feeds once credentials exist — the
 * PreAdvice table and matching logic stay the same either way.
 */
export async function importPreAdviceAction(
  _prev: ImportState | undefined,
  formData: FormData
): Promise<ImportState> {
  const session = await getRequiredManagerSession();

  const storeId = formData.get("storeId");
  const text = formData.get("lines");
  if (typeof storeId !== "string" || !storeId || typeof text !== "string") {
    return { error: "Invalid input" };
  }
  const scope = managedStoreId(session);
  if (scope && storeId !== scope) return { error: "Forbidden" };
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return { error: "Store not found." };

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { error: "Nothing to import." };
  if (lines.length > 500) return { error: "Too many lines (max 500 per import)." };

  const rows = [];
  for (const [i, line] of lines.entries()) {
    const [trackingNumber, carrier, customerName, customerPhone, customerEmail] = line
      .split(/[,;\t]/)
      .map((f) => f.trim());
    const parsed = PreAdviceLineSchema.safeParse({
      trackingNumber,
      carrier: carrier?.toUpperCase(),
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      customerEmail: customerEmail || undefined,
    });
    if (!parsed.success) {
      return { error: `Line ${i + 1} is invalid: "${line}" (expected TRACKING,CARRIER[,NAME][,PHONE][,EMAIL])` };
    }
    rows.push({ ...parsed.data, storeId });
  }

  const result = await prisma.preAdvice.createMany({ data: rows, skipDuplicates: true });
  revalidatePath("/expected");
  const skipped = rows.length - result.count;
  return {
    success: `Imported ${result.count} announced parcel(s) for ${store.name}.${skipped > 0 ? ` ${skipped} duplicate(s) skipped.` : ""}`,
  };
}
