import type { Locale } from "@prisma/client";

/** Supported UI languages, in menu order. Prisma's Locale enum is the source. */
export const LOCALES = ["SV", "EN", "DE", "NL", "NO", "DA", "FI"] as const;

export const DEFAULT_LOCALE: Locale = "EN";

/** Endonyms — each language named in itself, as a language menu should. */
export const LOCALE_LABELS: Record<Locale, string> = {
  SV: "Svenska",
  EN: "English",
  DE: "Deutsch",
  NL: "Nederlands",
  NO: "Norsk",
  DA: "Dansk",
  FI: "Suomi",
};

/** BCP-47 tags for the `lang` attribute and Intl formatting. */
export const LOCALE_TAGS: Record<Locale, string> = {
  SV: "sv",
  EN: "en",
  DE: "de",
  NL: "nl",
  NO: "nb",
  DA: "da",
  FI: "fi",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best match for an Accept-Language header (used on the pre-login screen,
 * where there is no profile yet). Falls back to the default.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const tag = part.trim().split(";")[0].toLowerCase().slice(0, 2);
    const match = LOCALES.find((l) => LOCALE_TAGS[l].slice(0, 2) === tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
