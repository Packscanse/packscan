import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeTrackingNumber } from "@/lib/carriers";

/**
 * Inbound half of "Carrier API → platform → counter workflow": carriers
 * push announced-parcel events here (webhook or polled feed adapter) and
 * they land as PreAdvice — which pre-fills intake, fixes carrier
 * attribution, and powers the Expected page. Upsert semantics: a
 * re-announcement UPDATES contact details while the parcel is still
 * ANNOUNCED; once RECEIVED it is never touched.
 */

export const CarrierIngestSchema = z.object({
  carrier: z.enum(["DHL", "POSTNORD", "POSTNL", "FEDEX", "SCHENKER"]),
  storeCode: z.string().trim().min(2).max(16),
  parcels: z
    .array(
      z.object({
        trackingNumber: z.string().trim().min(6).max(64),
        customerName: z.string().trim().max(120).optional(),
        customerPhone: z.string().trim().max(32).optional(),
        customerEmail: z.string().trim().max(254).optional(),
      })
    )
    .min(1)
    .max(1000),
});

export type IngestResult =
  | { ok: true; created: number; updated: number; skippedReceived: number }
  | { ok: false; error: string };

export async function ingestCarrierEvents(payload: unknown): Promise<IngestResult> {
  const parsed = CarrierIngestSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payload" };
  }

  const store = await prisma.store.findUnique({
    where: { code: parsed.data.storeCode.toUpperCase() },
    select: { id: true },
  });
  if (!store) return { ok: false, error: `Unknown store code ${parsed.data.storeCode}` };

  let created = 0;
  let updated = 0;
  let skippedReceived = 0;

  for (const parcel of parsed.data.parcels) {
    const trackingNumber = normalizeTrackingNumber(parcel.trackingNumber);
    const existing = await prisma.preAdvice.findUnique({
      where: { storeId_trackingNumber: { storeId: store.id, trackingNumber } },
      select: { id: true, status: true },
    });
    if (existing?.status === "RECEIVED") {
      skippedReceived++;
      continue;
    }
    const data = {
      carrier: parsed.data.carrier,
      customerName: parcel.customerName ?? null,
      customerPhone: parcel.customerPhone ?? null,
      customerEmail: parcel.customerEmail ?? null,
    };
    if (existing) {
      await prisma.preAdvice.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.preAdvice.create({
        data: { ...data, storeId: store.id, trackingNumber },
      });
      created++;
    }
  }

  return { ok: true, created, updated, skippedReceived };
}
