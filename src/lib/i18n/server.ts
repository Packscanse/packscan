import { cache } from "react";
import type { Locale } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getMessages, type Messages, DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * The signed-in user's language, read fresh from the database (React-cached,
 * so it's one query per request no matter how many components ask). Reading
 * the DB rather than the JWT makes a language change take effect on the very
 * next render — the token's copy only refreshes on the periodic re-check.
 * Locale is a display preference, not a security boundary, so this is safe.
 */
export const getUserLocale = cache(async (): Promise<Locale> => {
  const session = await auth();
  if (!session?.user) return DEFAULT_LOCALE;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { locale: true },
  });
  return user?.locale ?? DEFAULT_LOCALE;
});

/** Server-side translations for the current user. */
export const getT = cache(async (): Promise<Messages> => getMessages(await getUserLocale()));
