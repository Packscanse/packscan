"use client";

import { useActionState } from "react";
import { updateStoreDetailsAction } from "@/actions/admin";
import { FormStateLine } from "./FormStateLine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <FormStateLine state={state} />
    </form>
  );
}
