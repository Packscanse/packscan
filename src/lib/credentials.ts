import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { DEFAULT_IDLE_MINUTES } from "@/lib/auth-config";
import { LoginSchema } from "@/lib/validation/auth";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/rate-limit";

export type VerifiedUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "CLERK";
  storeId: string;
  idleMinutes: number;
  authMethod: "PASSWORD" | "PIN";
  locale: import("@prisma/client").Locale;
};

/**
 * The one credential check for every way in — the web login (Auth.js
 * authorize) and POST /api/v1/auth/login. Rate limiting, the active flag,
 * and the password-vs-PIN rule live here so the two doors can never drift.
 * Returns null on any failure; the caller must not say which part failed.
 */
export async function verifyCredentials(raw: unknown, ip: string): Promise<VerifiedUser | null> {
  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const email = parsed.data.email.toLowerCase();

  if ((await isRateLimited("email", email)) || (await isRateLimited("ip", ip))) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { store: { select: { sessionIdleMinutes: true } } },
  });
  if (!user || !user.active) {
    await Promise.all([recordFailure("email", email), recordFailure("ip", ip)]);
    return null;
  }
  // Counter PIN signs in for scanning; administration always needs the
  // password (enforced via authMethod on the session/token).
  const valid = parsed.data.pin
    ? user.pinHash !== null && (await bcrypt.compare(parsed.data.pin, user.pinHash))
    : await bcrypt.compare(parsed.data.password!, user.passwordHash);
  if (!valid) {
    await Promise.all([recordFailure("email", email), recordFailure("ip", ip)]);
    return null;
  }
  await clearFailures("email", email);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
    idleMinutes: user.store?.sessionIdleMinutes ?? DEFAULT_IDLE_MINUTES,
    authMethod: parsed.data.pin ? "PIN" : "PASSWORD",
    locale: user.locale,
  };
}

/**
 * The device app's sign-in: 4-digit user number + 6-digit PIN, nothing
 * else. Passwords are deliberately not accepted here — administration
 * happens in the web backend only. Same rate limiting and generic-failure
 * posture as verifyCredentials.
 */
export async function verifyAppPin(
  userNumber: string,
  pin: string,
  ip: string
): Promise<VerifiedUser | null> {
  if (!/^\d{4}$/.test(userNumber) || !/^\d{6}$/.test(pin)) return null;

  if ((await isRateLimited("email", `nr:${userNumber}`)) || (await isRateLimited("ip", ip)))
    return null;

  const user = await prisma.user.findUnique({
    where: { loginNumber: userNumber },
    include: { store: { select: { sessionIdleMinutes: true } } },
  });
  const valid =
    user !== null &&
    user.active &&
    user.pinHash !== null &&
    (await bcrypt.compare(pin, user.pinHash));
  if (!user || !valid) {
    await Promise.all([recordFailure("email", `nr:${userNumber}`), recordFailure("ip", ip)]);
    return null;
  }
  await clearFailures("email", `nr:${userNumber}`);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
    idleMinutes: user.store?.sessionIdleMinutes ?? DEFAULT_IDLE_MINUTES,
    authMethod: "PIN",
    locale: user.locale,
  };
}

/** Left-most X-Forwarded-For entry behind a proxy; "local" in dev. */
export function clientIp(headers: Headers | null | undefined): string {
  return headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
