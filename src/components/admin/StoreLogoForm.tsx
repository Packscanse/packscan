"use client";

import { useActionState } from "react";
import { updateStoreLogoAction, type AdminFormState } from "@/actions/admin";
import { Button } from "@/components/ui/button";

function StateLine({ state }: { state: AdminFormState | undefined }) {
  if (state?.error) return <p className="text-xs text-destructive" role="alert">{state.error}</p>;
  if (state?.success) return <p className="text-xs text-green-700 dark:text-green-400">{state.success}</p>;
  return null;
}

/** Upload/remove the store logo (PNG/JPEG/SVG/WebP ≤256KB, DB-stored). */
export function StoreLogoForm({
  storeId,
  storeName,
  logoData,
}: {
  storeId: string;
  storeName: string;
  logoData: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateStoreLogoAction, undefined);

  return (
    <div className="grid gap-2">
      {logoData && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoData}
          alt={`${storeName} logo`}
          className="h-8 w-fit max-w-32 rounded bg-background object-contain p-0.5"
        />
      )}
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="storeId" value={storeId} />
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          aria-label={`Logo file for ${storeName}`}
          className="max-w-48 text-xs file:mr-2 file:rounded-md file:border file:border-input file:bg-transparent file:px-2 file:py-1 file:text-xs"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </form>
      {logoData && (
        <form action={formAction}>
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="remove" value="true" />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            Remove logo
          </Button>
        </form>
      )}
      <StateLine state={state} />
    </div>
  );
}
