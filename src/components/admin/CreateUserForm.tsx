"use client";

import { useActionState } from "react";
import { createUserAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateUserForm({
  stores,
}: {
  stores: { id: string; name: string; code: string }[];
}) {
  const [state, formAction, pending] = useActionState(createUserAction, undefined);

  return (
    <form action={formAction} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="user-email">Email</Label>
        <Input id="user-email" name="email" type="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="user-name">Name</Label>
        <Input id="user-name" name="name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="user-password">Password (min 8 characters)</Label>
        <Input id="user-password" name="password" type="password" required minLength={8} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="user-role">Role</Label>
        <select
          id="user-role"
          name="role"
          defaultValue="CLERK"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="CLERK">Clerk</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="user-store">Store</Label>
        <select
          id="user-store"
          name="storeId"
          required
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name} ({store.code})
            </option>
          ))}
        </select>
      </div>
      {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700 dark:text-green-400">{state.success}</p>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Creating…" : "Create user"}
      </Button>
    </form>
  );
}
