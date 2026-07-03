import { z } from "zod";

export const CreateStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only")
    .transform((v) => v.toUpperCase()),
  address: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(200).optional()
  ),
});

export const UpdateStoreIdleSchema = z.object({
  storeId: z.string().min(1),
  sessionIdleMinutes: z.coerce.number().int().min(1).max(10),
});

export const CreateUserSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(["ADMIN", "CLERK"]),
  storeId: z.string().min(1),
});

export const SetUserActiveSchema = z.object({
  userId: z.string().min(1),
  // Hidden form field — arrives as a string.
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const SetUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "CLERK"]),
});

export const ResetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8).max(128),
});
