"use client";

import { useActionState } from "react";
import type { Locale } from "@prisma/client";
import { setLocaleAction } from "@/actions/profile";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { useT } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export function LanguageForm({ current }: { current: Locale }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(setLocaleAction, undefined);

  return (
    <form action={formAction} className="grid max-w-sm gap-2">
      <Label htmlFor="locale">{t.profile.language}</Label>
      <NativeSelect id="locale" name="locale" defaultValue={current} className="w-full">
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </NativeSelect>
      <p className="text-xs text-muted-foreground">{t.profile.languageHint}</p>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? t.profile.saving : t.profile.save}
      </Button>
      {state?.success && (
        <p className="text-sm text-green-700 dark:text-green-400">{t.profile.saved}</p>
      )}
      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
