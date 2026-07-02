"use client";

import { useActionState } from "react";
import { createStoreAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateStoreForm() {
  const [state, formAction, pending] = useActionState(createStoreAction, undefined);

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="store-name">Name</Label>
        <Input id="store-name" name="name" required placeholder="Kiosk Söder" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="store-code">Code</Label>
        <Input id="store-code" name="code" required placeholder="STHLM-02" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="store-address">Address (optional)</Label>
        <Input id="store-address" name="address" />
      </div>
      {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700 dark:text-green-400">{state.success}</p>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Creating…" : "Create store"}
      </Button>
    </form>
  );
}
