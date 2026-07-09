import { z } from "zod";

// Two ways in: password (full access) or 6-digit counter PIN (scanning
// only). Exactly one must be provided.
export const LoginSchema = z
  .object({
    email: z.email(),
    password: z.preprocess(
      (v) => (typeof v === "string" && v === "" ? undefined : v),
      z.string().min(1).optional()
    ),
    pin: z.preprocess(
      (v) => (typeof v === "string" && v === "" ? undefined : v),
      z.string().regex(/^\d{6}$/).optional()
    ),
  })
  .refine((data) => Boolean(data.password) !== Boolean(data.pin), {
    message: "Provide either a password or a PIN",
  });
