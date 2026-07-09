import { z } from "zod";
import { SCAN_FLOWS } from "@/lib/status";

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

export const HandoverInputSchema = z.object({
  // QR payloads from carrier apps can be long URLs — allow generous length.
  presentedCode: optionalTrimmed(512),
  idChecked: z.boolean(),
  idType: z.enum(["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID", "OTHER"]).optional(),
  collectorName: optionalTrimmed(120),
  override: z.boolean().optional(),
  overrideReason: optionalTrimmed(300),
});

export const CourierRefSchema = optionalTrimmed(80);

export const ScanInputSchema = z.object({
  trackingNumber: z.string().trim().min(6).max(64),
  flow: z.enum(SCAN_FLOWS),
  carrier: z.enum(["DHL", "POSTNORD", "POSTNL", "FEDEX", "UNKNOWN"]),
  carrierManual: z.boolean(),
  inputMethod: z.enum(["CAMERA", "HARDWARE_SCANNER", "MANUAL_ENTRY"]),
  customerName: optionalTrimmed(120),
  customerPhone: optionalTrimmed(32),
  customerEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.email().optional()
  ),
  notes: optionalTrimmed(500),
  shelfLocation: optionalTrimmed(40),
  // Present when the scan completes a pickup handover (second submit).
  verification: HandoverInputSchema.optional(),
  // Present when replayed from the browser's offline queue: when it was
  // captured and who was signed in then (client claim — recorded, not trusted).
  offline: z
    .object({
      queuedAt: z.number().int().positive(),
      queuedByUserId: z.string().min(1).max(64),
    })
    .optional(),
});

export type ScanInput = z.infer<typeof ScanInputSchema>;

export const CancelReasonSchema = z.string().trim().min(3).max(300);
