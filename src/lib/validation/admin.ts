import { z } from "zod";
import { CARRIER_CODES } from "@/lib/carriers";
import { optionalTrimmed } from "./common";

export const CreateStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only")
    .transform((v) => v.toUpperCase()),
  address: optionalTrimmed(200),
});

export const UpdateStoreIdleSchema = z.object({
  storeId: z.string().min(1),
  sessionIdleMinutes: z.coerce.number().int().min(1).max(10),
});

export const UpdateStoreDeadlineSchema = z.object({
  storeId: z.string().min(1),
  pickupDeadlineDays: z.coerce.number().int().min(1).max(30),
});

/** One pre-advice line: TRACKING,CARRIER[,NAME][,PHONE][,EMAIL] */
export const PreAdviceLineSchema = z.object({
  trackingNumber: z.string().trim().min(6).max(64).transform((v) => v.toUpperCase().replace(/\s+/g, "")),
  carrier: z.enum([...CARRIER_CODES, "UNKNOWN"]),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(32).optional(),
  customerEmail: z.string().trim().max(254).optional(),
});

export const CreateUserSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(["ADMIN", "MANAGER", "CLERK"]),
  storeId: z.string().min(1),
});

export const SetUserActiveSchema = z.object({
  userId: z.string().min(1),
  // Hidden form field — arrives as a string.
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const SetUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "MANAGER", "CLERK"]),
});

export const ResetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const SetUserStoreSchema = z.object({
  userId: z.string().min(1),
  storeId: z.string().min(1),
});

export const UpdateStoreDetailsSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  address: optionalTrimmed(200),
});

export const SetPinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits"),
});

export const UpdateStoreBrandSchema = z.object({
  storeId: z.string().min(1),
  // Native color inputs always submit #rrggbb; empty string clears.
  brandColor: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
});
