import { z } from "zod";
import { SCAN_FLOWS } from "@/lib/status";

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

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
});

export type ScanInput = z.infer<typeof ScanInputSchema>;
