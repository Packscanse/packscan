"use client";

import { useActionState, useState } from "react";
import { importPreAdviceAction } from "@/actions/preadvice";
import { CARRIER_CODES } from "@/lib/carriers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/i18n/I18nProvider";

const VALID_CARRIERS = new Set<string>([...CARRIER_CODES, "UNKNOWN"]);

/** Paste-import for carrier pre-advice; replaced by API feeds in Phase 2. */
export function PreAdviceImportForm({ storeId }: { storeId: string }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(importPreAdviceAction, undefined);
  const [clientError, setClientError] = useState<string | null>(null);

  // Catch the malformed line before the round-trip, with its line number —
  // the server re-validates regardless.
  function validateLines(e: React.FormEvent<HTMLFormElement>) {
    const text = new FormData(e.currentTarget).get("lines");
    const lines = (typeof text === "string" ? text : "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const [i, line] of lines.entries()) {
      const [trackingNumber, carrier] = line.split(/[,;\t]/).map((f) => f.trim());
      if (
        !trackingNumber ||
        trackingNumber.length < 6 ||
        !carrier ||
        !VALID_CARRIERS.has(carrier.toUpperCase())
      ) {
        setClientError(t.expected.lineInvalid.replace("{line}", String(i + 1)));
        e.preventDefault();
        return;
      }
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={validateLines} className="grid max-w-xl gap-3">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="grid gap-2">
        <Label htmlFor="preadvice-lines">{t.expected.importFormat}</Label>
        <textarea
          id="preadvice-lines"
          name="lines"
          required
          rows={6}
          placeholder={"RR123456785SE,POSTNORD,Anna Andersson,+46701234567\n3SABCD1234567,POSTNL,Jan de Vries"}
          className="rounded-md border border-input bg-transparent p-3 font-mono text-sm shadow-xs"
        />
        <p className="text-xs text-muted-foreground">
          {t.expected.validCarriers.replace("{codes}", CARRIER_CODES.join(", "))}
        </p>
      </div>
      {(clientError ?? state?.error) && (
        <p className="text-sm text-destructive" role="alert">
          {clientError ?? state?.error}
        </p>
      )}
      {!clientError && state?.success && (
        <p className="text-sm text-green-700 dark:text-green-400">{state.success}</p>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? t.expected.importing : t.expected.importButton}
      </Button>
    </form>
  );
}
