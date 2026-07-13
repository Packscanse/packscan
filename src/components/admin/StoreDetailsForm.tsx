"use client";

import { useActionState } from "react";
import { updateStoreDetailsAction, type AdminFormState } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function StateLine({ state }: { state: AdminFormState | undefined }) {
  if (state?.error) return <p className="text-xs text-destructive" role="alert">{state.error}</p>;
  if (state?.success) return <p className="text-xs text-green-700 dark:text-green-400">{state.success}</p>;
  return null;
}

/** Edit a store's name and address after creation. */
export function StoreDetailsForm({
  storeId,
  name,
  address,
}: {
  storeId: string;
  name: string;
  address: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateStoreDetailsAction, undefined);

  return (
    <form action={formAction} className="grid max-w-56 gap-1.5">
      <input type="hidden" name="storeId" value={storeId} />
      <Input
        name="name"
        key={`n-${name}`}
        defaultValue={name}
        required
        minLength={2}
        maxLength={120}
        aria-label="Store name"
        className="h-8"
      />
      <Input
        name="address"
        key={`a-${address ?? ""}`}
        defaultValue={address ?? ""}
        maxLength={200}
        placeholder="Address"
        aria-label="Store address"
        className="h-8"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
      <StateLine state={state} />
    </form>
  );
}
