"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";
import { resetUserPassword, setUserActive, setUserPin, setUserRole } from "@/lib/users";
import {
  CreateStoreSchema,
  CreateUserSchema,
  ResetPasswordSchema,
  SetPinSchema,
  SetUserActiveSchema,
  SetUserRoleSchema,
  UpdateStoreBrandSchema,
  UpdateStoreDeadlineSchema,
  UpdateStoreIdleSchema,
} from "@/lib/validation/admin";

export type AdminFormState = { error?: string; success?: string };

// Administration demands a password-established session — a counter PIN
// never unlocks it, even for an admin account.
function isFullAdmin(session: Awaited<ReturnType<typeof getRequiredSession>>): boolean {
  return session.user.role === "ADMIN" && session.user.authMethod === "PASSWORD";
}

async function requireAdmin(): Promise<string | null> {
  const session = await getRequiredSession();
  return isFullAdmin(session) ? null : "Forbidden";
}

async function requireAdminSession() {
  const session = await getRequiredSession();
  return isFullAdmin(session)
    ? ({ ok: true, session } as const)
    : ({ ok: false, error: "Forbidden" } as const);
}

export async function createStoreAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const forbidden = await requireAdmin();
  if (forbidden) return { error: forbidden };

  const parsed = CreateStoreSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const store = await prisma.store.create({ data: parsed.data });
    revalidatePath("/admin/stores");
    return { success: `Store ${store.name} (${store.code}) created.` };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: `Store code ${parsed.data.code} is already in use.` };
    }
    throw e;
  }
}

/** Per-store inactivity timeout (1-10 min); takes effect on staff sessions within ~5 min via the JWT recheck. */
export async function updateStoreIdleAction(formData: FormData): Promise<void> {
  const forbidden = await requireAdmin();
  if (forbidden) return;

  const parsed = UpdateStoreIdleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await prisma.store.update({
    where: { id: parsed.data.storeId },
    data: { sessionIdleMinutes: parsed.data.sessionIdleMinutes },
  });
  revalidatePath("/admin/stores");
}

/** Days a parcel may await pickup before the Packages page flags it overdue. */
export async function updateStoreDeadlineAction(formData: FormData): Promise<void> {
  const forbidden = await requireAdmin();
  if (forbidden) return;

  const parsed = UpdateStoreDeadlineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await prisma.store.update({
    where: { id: parsed.data.storeId },
    data: { pickupDeadlineDays: parsed.data.pickupDeadlineDays },
  });
  revalidatePath("/admin/stores");
}

export async function createUserAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const forbidden = await requireAdmin();
  if (forbidden) return { error: forbidden };

  const parsed = CreateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const store = await prisma.store.findUnique({ where: { id: parsed.data.storeId } });
  if (!store) return { error: "Selected store does not exist." };

  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        storeId: parsed.data.storeId,
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
      },
    });
    revalidatePath("/admin/users");
    return { success: `${user.role} account ${user.email} created for ${store.name}.` };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: `Email ${parsed.data.email} is already in use.` };
    }
    throw e;
  }
}

/** Deactivation revokes live sessions within ~5 min via the JWT re-check. */
export async function setUserActiveAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const auth = await requireAdminSession();
  if (!auth.ok) return { error: auth.error };

  const parsed = SetUserActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };

  const result = await setUserActive({
    actorId: auth.session.user.id,
    targetId: parsed.data.userId,
    active: parsed.data.active,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/users");
  return { success: parsed.data.active ? "Account reactivated." : "Account deactivated." };
}

export async function setUserRoleAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const auth = await requireAdminSession();
  if (!auth.ok) return { error: auth.error };

  const parsed = SetUserRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };

  const result = await setUserRole({
    actorId: auth.session.user.id,
    targetId: parsed.data.userId,
    role: parsed.data.role,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/users");
  return { success: `Role set to ${parsed.data.role}.` };
}

/** Set the 6-digit counter PIN for quick sign-in on shared devices. */
export async function setUserPinAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const forbidden = await requireAdmin();
  if (forbidden) return { error: forbidden };

  const parsed = SetPinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "PIN must be exactly 6 digits." };

  const result = await setUserPin({ targetId: parsed.data.userId, pin: parsed.data.pin });
  if (!result.ok) return { error: result.error };

  return { success: "PIN set." };
}

/** Chain branding: the store's primary color themes the whole app. */
export async function updateStoreBrandAction(formData: FormData): Promise<void> {
  const forbidden = await requireAdmin();
  if (forbidden) return;

  const parsed = UpdateStoreBrandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await prisma.store.update({
    where: { id: parsed.data.storeId },
    data: { brandColor: parsed.data.brandColor === "" ? null : parsed.data.brandColor.toLowerCase() },
  });
  revalidatePath("/admin/stores");
  revalidatePath("/", "layout");
}

export async function resetUserPasswordAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const forbidden = await requireAdmin();
  if (forbidden) return { error: forbidden };

  const parsed = ResetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Password must be 8-128 characters." };
  }

  const result = await resetUserPassword({
    targetId: parsed.data.userId,
    password: parsed.data.password,
  });
  if (!result.ok) return { error: result.error };

  return { success: "Password reset." };
}
