"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getRequiredSession, hasManagementAccess } from "@/lib/session";
import {
  BCRYPT_ROUNDS,
  generateLoginNumber,
  resetUserPassword,
  setUserActive,
  setUserPin,
  setUserRole,
  setUserStore,
} from "@/lib/users";
import { validateLogo } from "@/lib/branding";
import {
  CreateStoreSchema,
  CreateUserSchema,
  ResetPasswordSchema,
  SetPinSchema,
  SetUserActiveSchema,
  SetUserRoleSchema,
  SetUserStoreSchema,
  UpdateStoreBrandSchema,
  UpdateStoreDeadlineSchema,
  UpdateStoreDetailsSchema,
  UpdateStoreIdleSchema,
} from "@/lib/validation/admin";

export type AdminFormState = { error?: string; success?: string };

// Administration demands a password-established session — a counter PIN
// never unlocks it, even for an admin account.
type ActiveSession = Awaited<ReturnType<typeof getRequiredSession>>;

function isFullAdmin(session: ActiveSession): boolean {
  return session.user.role === "ADMIN" && session.user.authMethod === "PASSWORD";
}

async function requireAdmin(): Promise<string | null> {
  const session = await getRequiredSession();
  return isFullAdmin(session) ? null : "Forbidden";
}

/** ADMIN or store MANAGER (password session). */
async function requireManagerSession() {
  const session = await getRequiredSession();
  return hasManagementAccess(session)
    ? ({ ok: true, session, isAdmin: session.user.role === "ADMIN" } as const)
    : ({ ok: false, error: "Forbidden" } as const);
}

/** Managers may only manage their own store; admins any. */
function canManageStore(auth: { session: ActiveSession; isAdmin: boolean }, storeId: string): boolean {
  return auth.isAdmin || auth.session.user.storeId === storeId;
}

/**
 * Managers may only manage non-ADMIN accounts in their own store; admins
 * any account. Returns the target when allowed.
 */
async function manageableUser(
  auth: { session: ActiveSession; isAdmin: boolean },
  userId: string
) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return null;
  if (auth.isAdmin) return target;
  if (target.storeId !== auth.session.user.storeId || target.role === "ADMIN") return null;
  return target;
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
  const auth = await requireManagerSession();
  if (!auth.ok) return;

  const parsed = UpdateStoreIdleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !canManageStore(auth, parsed.data.storeId)) return;

  await prisma.store.update({
    where: { id: parsed.data.storeId },
    data: { sessionIdleMinutes: parsed.data.sessionIdleMinutes },
  });
  revalidatePath("/admin/stores");
}

/** Days a parcel may await pickup before the Packages page flags it overdue. */
export async function updateStoreDeadlineAction(formData: FormData): Promise<void> {
  const auth = await requireManagerSession();
  if (!auth.ok) return;

  const parsed = UpdateStoreDeadlineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !canManageStore(auth, parsed.data.storeId)) return;

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
  const auth = await requireManagerSession();
  if (!auth.ok) return { error: auth.error };

  const parsed = CreateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  // Managers hire for their own store and can never mint chain admins.
  if (!auth.isAdmin && (parsed.data.storeId !== auth.session.user.storeId || parsed.data.role === "ADMIN")) {
    return { error: "Managers can only create clerk/manager accounts in their own store." };
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
        passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS),
        // Every account gets its 4-digit device-app sign-in number up front.
        loginNumber: await generateLoginNumber(),
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
  const auth = await requireManagerSession();
  if (!auth.ok) return { error: auth.error };

  const parsed = SetUserActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };
  if (!(await manageableUser(auth, parsed.data.userId))) return { error: "Forbidden" };

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
  const auth = await requireManagerSession();
  if (!auth.ok) return { error: auth.error };

  const parsed = SetUserRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };
  if (!(await manageableUser(auth, parsed.data.userId))) return { error: "Forbidden" };
  if (!auth.isAdmin && parsed.data.role === "ADMIN") {
    return { error: "Only chain admins can grant the admin role." };
  }

  const result = await setUserRole({
    actorId: auth.session.user.id,
    targetId: parsed.data.userId,
    role: parsed.data.role,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/users");
  return { success: `Role set to ${parsed.data.role}.` };
}

/** Edit store name/address after creation. */
export async function updateStoreDetailsAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const auth = await requireManagerSession();
  if (!auth.ok) return { error: auth.error };

  const parsed = UpdateStoreDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!canManageStore(auth, parsed.data.storeId)) return { error: "Forbidden" };

  await prisma.store.update({
    where: { id: parsed.data.storeId },
    data: { name: parsed.data.name, address: parsed.data.address ?? null },
  });
  revalidatePath("/admin/stores");
  revalidatePath("/", "layout");
  return { success: "Store updated." };
}

/** Move a user to another store. */
export async function setUserStoreAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const forbidden = await requireAdmin();
  if (forbidden) return { error: forbidden };

  const parsed = SetUserStoreSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };

  const result = await setUserStore({
    targetId: parsed.data.userId,
    storeId: parsed.data.storeId,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/users");
  return { success: "User moved." };
}

/** Set the 6-digit counter PIN for quick sign-in on shared devices. */
export async function setUserPinAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const auth = await requireManagerSession();
  if (!auth.ok) return { error: auth.error };

  const parsed = SetPinSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "PIN must be exactly 6 digits." };
  if (!(await manageableUser(auth, parsed.data.userId))) return { error: "Forbidden" };

  const result = await setUserPin({ targetId: parsed.data.userId, pin: parsed.data.pin });
  if (!result.ok) return { error: result.error };

  return { success: "PIN set." };
}

/** Chain branding: store logo uploaded as a DB-stored data URL (≤256KB). */
export async function updateStoreLogoAction(
  _prev: AdminFormState | undefined,
  formData: FormData
): Promise<AdminFormState> {
  const auth = await requireManagerSession();
  if (!auth.ok) return { error: auth.error };

  const storeId = formData.get("storeId");
  if (typeof storeId !== "string" || !storeId) return { error: "Invalid store." };
  if (!canManageStore(auth, storeId)) return { error: "Forbidden" };

  const remove = formData.get("remove") === "true";
  if (remove) {
    await prisma.store.update({ where: { id: storeId }, data: { logoData: null } });
    revalidatePath("/admin/stores");
    revalidatePath("/", "layout");
    return { success: "Logo removed." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File)) return { error: "Choose a logo file first." };
  const invalid = validateLogo(file.type, file.size);
  if (invalid) return { error: invalid };

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  await prisma.store.update({
    where: { id: storeId },
    data: { logoData: `data:${file.type};base64,${base64}` },
  });
  revalidatePath("/admin/stores");
  revalidatePath("/", "layout");
  return { success: "Logo updated." };
}

/** Chain branding: the store's primary color themes the whole app. */
export async function updateStoreBrandAction(formData: FormData): Promise<void> {
  const auth = await requireManagerSession();
  if (!auth.ok) return;

  const parsed = UpdateStoreBrandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !canManageStore(auth, parsed.data.storeId)) return;

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
  const auth = await requireManagerSession();
  if (!auth.ok) return { error: auth.error };

  const parsed = ResetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Password must be 8-128 characters." };
  }
  if (!(await manageableUser(auth, parsed.data.userId))) return { error: "Forbidden" };

  const result = await resetUserPassword({
    targetId: parsed.data.userId,
    password: parsed.data.password,
  });
  if (!result.ok) return { error: result.error };

  return { success: "Password reset." };
}
