"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";
import { isLocale } from "@/lib/i18n";

export type ProfileState = { error?: string; success?: string };

/**
 * Set the signed-in user's UI language. Takes effect on the next request;
 * the JWT re-check propagates it within ~5 minutes across other sessions.
 */
export async function setLocaleAction(
  _prev: ProfileState | undefined,
  formData: FormData
): Promise<ProfileState> {
  const session = await getRequiredSession();
  const locale = formData.get("locale");
  if (!isLocale(locale)) return { error: "Invalid language." };

  await prisma.user.update({ where: { id: session.user.id }, data: { locale } });
  revalidatePath("/", "layout");
  return { success: "saved" };
}
