import { prisma } from "@/lib/prisma";
import { clientIp, verifyCredentials } from "@/lib/credentials";
import { signApiToken } from "@/lib/api-token";
import { apiError, apiJson } from "@/lib/api-auth";

/**
 * POST /api/v1/auth/login — { email, password } or { email, pin }.
 * Same verifyCredentials as the web login (rate limits, active flag,
 * password-vs-PIN rule), but returns a bearer token for the device app
 * instead of a session cookie. Deliberately one generic 401: never reveal
 * which part of the credentials failed.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Body must be JSON.");
  }

  const user = await verifyCredentials(body, clientIp(request.headers));
  if (!user) {
    return apiError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
  }

  const [{ token, expiresAt }, store] = await Promise.all([
    signApiToken({ sub: user.id, authMethod: user.authMethod }),
    prisma.store.findUnique({
      where: { id: user.storeId },
      select: { id: true, name: true, code: true, brandColor: true },
    }),
  ]);

  return apiJson({
    token,
    expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      locale: user.locale,
      authMethod: user.authMethod,
    },
    store,
  });
}
