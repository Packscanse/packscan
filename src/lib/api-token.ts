import { SignJWT, jwtVerify } from "jose";

/**
 * Bearer tokens for /api/v1 (the device-app seam). Deliberately minimal:
 * the token only proves who signed in and how — role, store, and the
 * active flag are read fresh from the DB on every request (requireApiUser),
 * so deactivation and role changes take effect immediately.
 */

const ISSUER = "packscan";
const AUDIENCE = "packscan-api";
// Device apps re-authenticate at most daily; the app's own idle lock (PIN
// re-entry) guards the shared handheld, mirroring the web idle timeout.
const DEFAULT_TTL_HOURS = 12;

export type ApiTokenPayload = {
  /** User id. */
  sub: string;
  /** How the user signed in; PIN sessions act as CLERK. */
  authMethod: "PASSWORD" | "PIN";
};

function secret(): Uint8Array {
  const value = process.env.API_JWT_SECRET ?? process.env.AUTH_SECRET;
  if (!value) throw new Error("API_JWT_SECRET or AUTH_SECRET must be set");
  return new TextEncoder().encode(value);
}

function ttlHours(): number {
  const parsed = Number.parseFloat(process.env.API_TOKEN_TTL_HOURS ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_HOURS;
}

export async function signApiToken(
  payload: ApiTokenPayload
): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + ttlHours() * 60 * 60_000);
  const token = await new SignJWT({ authMethod: payload.authMethod })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Null on any problem — expired, tampered, wrong audience, malformed. */
export async function verifyApiToken(token: string): Promise<ApiTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== "string") return null;
    const authMethod = payload.authMethod === "PIN" ? "PIN" : "PASSWORD";
    return { sub: payload.sub, authMethod };
  } catch {
    return null;
  }
}
