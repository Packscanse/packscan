"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import {
  resetUserPasswordAction,
  setUserActiveAction,
  setUserPinAction,
  setUserRoleAction,
  setUserStoreAction,
  type AdminFormState,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function StateLine({ state }: { state: AdminFormState | undefined }) {
  if (state?.error) return <p className="text-xs text-destructive" role="alert">{state.error}</p>;
  if (state?.success) return <p className="text-xs text-green-700 dark:text-green-400">{state.success}</p>;
  return null;
}

/**
 * Per-row lifecycle controls on the admin Users page. Self-targeting rules
 * (no self-deactivation / self role change) and the last-active-admin guard
 * are enforced server-side in src/lib/users.ts; `isSelf` only pre-disables
 * the controls that would always be rejected.
 */
export function UserActions({
  userId,
  role,
  active,
  isSelf,
  storeId,
  stores,
}: {
  userId: string;
  role: Role;
  active: boolean;
  isSelf: boolean;
  storeId: string;
  stores: { id: string; name: string; code: string }[];
}) {
  const [activeState, activeAction, activePending] = useActionState(setUserActiveAction, undefined);
  const [roleState, roleAction, rolePending] = useActionState(setUserRoleAction, undefined);
  const [pwState, pwAction, pwPending] = useActionState(resetUserPasswordAction, undefined);
  const [pinState, pinAction, pinPending] = useActionState(setUserPinAction, undefined);
  const [storeState, storeAction, storePending] = useActionState(setUserStoreAction, undefined);

  return (
    <div className="grid max-w-xs gap-2">
      <form action={roleAction} className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <select
          name="role"
          key={role}
          defaultValue={role}
          disabled={isSelf}
          aria-label="Role"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50"
        >
          <option value="CLERK">Clerk</option>
          <option value="ADMIN">Admin</option>
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={isSelf || rolePending}>
          {rolePending ? "Saving…" : "Set role"}
        </Button>
      </form>
      <StateLine state={roleState} />

      <form action={activeAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button
          type="submit"
          variant={active ? "destructive" : "secondary"}
          size="sm"
          disabled={(isSelf && active) || activePending}
        >
          {activePending ? "Saving…" : active ? "Deactivate" : "Reactivate"}
        </Button>
      </form>
      <StateLine state={activeState} />

      <form action={pwAction} className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <Input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          placeholder="New password"
          autoComplete="new-password"
          aria-label="New password"
          className="h-8 w-36"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pwPending}>
          {pwPending ? "Saving…" : "Reset"}
        </Button>
      </form>
      <StateLine state={pwState} />

      {stores.length > 1 && (
        <>
          <form action={storeAction} className="flex items-center gap-2">
            <input type="hidden" name="userId" value={userId} />
            <select
              name="storeId"
              key={storeId}
              defaultValue={storeId}
              aria-label="Store"
              className="h-8 max-w-40 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm" disabled={storePending}>
              {storePending ? "Moving…" : "Move"}
            </Button>
          </form>
          <StateLine state={storeState} />
        </>
      )}

      <form action={pinAction} className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <Input
          name="pin"
          type="text"
          required
          inputMode="numeric"
          pattern="\d{6}"
          minLength={6}
          maxLength={6}
          placeholder="6-digit PIN"
          autoComplete="off"
          aria-label="Counter PIN"
          className="h-8 w-36"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pinPending}>
          {pinPending ? "Saving…" : "Set PIN"}
        </Button>
      </form>
      <StateLine state={pinState} />
    </div>
  );
}
