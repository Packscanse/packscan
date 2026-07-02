"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";
import { CreateStoreSchema, CreateUserSchema } from "@/lib/validation/admin";

export type AdminFormState = { error?: string; success?: string };

async function requireAdmin(): Promise<string | null> {
  const session = await getRequiredSession();
  return session.user.role === "ADMIN" ? null : "Forbidden";
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
