import type { Locale } from "@prisma/client";
import { en, type Messages } from "./messages/en";
import { sv } from "./messages/sv";
import { de } from "./messages/de";
import { nl } from "./messages/nl";
import { no } from "./messages/no";
import { da } from "./messages/da";
import { fi } from "./messages/fi";

const DICTIONARIES: Record<Locale, Messages> = { EN: en, SV: sv, DE: de, NL: nl, NO: no, DA: da, FI: fi };

/** Server-side dictionary lookup. Client components use the I18nProvider. */
export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? en;
}

export type { Messages };
export {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALE_TAGS,
  isLocale,
  localeFromAcceptLanguage,
} from "./locales";
