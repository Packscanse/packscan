import { prisma } from "@/lib/prisma";
import { clientIp, verifyAppPin } from "@/lib/credentials";
import { signApiToken } from "@/lib/api-token";
import { apiError, apiJson } from "@/lib/api-auth";

/**
 * POST /api/v1/auth/login — { userNumber: "1001", pin: "123456" }.
 *
 * The device app signs in with digits only: the 4-digit user number and the
 * 6-digit counter PIN. Passwords are rejected outright — password sign-in
 * (and with it every admin capability, since PIN tokens act as CLERK) only
 * exists in the web backend. One generic 401 on failure: never reveal which
 * part of the credentials was wrong.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Body must be JSON.");
  }

  const input = (body ?? {}) as Record<string, unknown>;
  if (typeof input.password === "string" || typeof input.email === "string") {
    return apiError(
      403,
      "PASSWORD_LOGIN_WEB_ONLY",
      "The app signs in with user number + PIN. Password sign-in only exists in the web backend."
    );
  }
  if (typeof input.userNumber !== "string" || typeof input.pin !== "string") {
    return apiError(422, "INVALID_INPUT", "Expected { userNumber, pin }.");
  }

  const user = await verifyAppPin(input.userNumber, input.pin, clientIp(request.headers));
  if (!user) {
    return apiError(401, "INVALID_CREDENTIALS", "Invalid credentials.");
  }

  const [{ token, expiresAt }, store] = await Promise.all([
    signApiToken({ sub: user.id, authMethod: "PIN" }),
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
      authMethod: "PIN",
    },
    store,
  });
}
