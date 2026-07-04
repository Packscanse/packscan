"use client";

import { useActionState } from "react";
import { importPreAdviceAction } from "@/actions/preadvice";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Paste-import for carrier pre-advice; replaced by API feeds in Phase 2. */
export function PreAdviceImportForm({ storeId }: { storeId: string }) {
  const [state, formAction, pending] = useActionState(importPreAdviceAction, undefined);

  return (
    <form action={formAction} className="grid max-w-xl gap-3">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="grid gap-2">
        <Label htmlFor="preadvice-lines">
          One parcel per line: TRACKING,CARRIER[,NAME][,PHONE][,EMAIL]
        </Label>
        <textarea
          id="preadvice-lines"
          name="lines"
          required
          rows={6}
          placeholder={"RR123456785SE,POSTNORD,Anna Andersson,+46701234567\n3SABCD1234567,POSTNL,Jan de Vries"}
          className="rounded-md border border-input bg-transparent p-3 font-mono text-sm shadow-xs"
        />
      </div>
      {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700 dark:text-green-400">{state.success}</p>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Importing…" : "Import pre-advice"}
      </Button>
    </form>
  );
}
