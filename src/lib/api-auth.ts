import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken } from "@/lib/api-token";

/** The authenticated API caller, resolved fresh from the DB per request. */
export type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "CLERK";
  storeId: string;
  locale: import("@prisma/client").Locale;
  authMethod: "PASSWORD" | "PIN";
};

/** Uniform error body: machine code for the app, message for the developer. */
export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export function apiJson(data: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status });
}

/**
 * Gate for every /api/v1 route except login. Verifies the bearer token,
 * then loads the user fresh — deactivation or a role/store change revokes
 * or reshapes access on the very next request (stricter than the web's
 * 5-minute re-check, and cheap: one primary-key lookup).
 */
export async function requireApiUser(
  request: Request
): Promise<{ user: ApiUser; error?: undefined } | { user?: undefined; error: NextResponse }> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    return { error: apiError(401, "UNAUTHENTICATED", "Missing bearer token.") };
  }
  const payload = await verifyApiToken(token);
  if (!payload) {
    return { error: apiError(401, "UNAUTHENTICATED", "Invalid or expired token.") };
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, storeId: true, locale: true, active: true },
  });
  if (!user || !user.active) {
    return { error: apiError(401, "UNAUTHENTICATED", "Account is not active.") };
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      locale: user.locale,
      authMethod: payload.authMethod,
    },
  };
}

/**
 * Store scoping shared by the package routes: clerks and managers only
 * reach their own store's parcels; admins may act on any.
 */
export async function loadApiScopedPackage(user: ApiUser, packageId: string) {
  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg || (user.role !== "ADMIN" && pkg.storeId !== user.storeId)) return null;
  return pkg;
}
