"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import {
  resetUserPasswordAction,
  setUserActiveAction,
  setUserRoleAction,
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
}: {
  userId: string;
  role: Role;
  active: boolean;
  isSelf: boolean;
}) {
  const [activeState, activeAction, activePending] = useActionState(setUserActiveAction, undefined);
  const [roleState, roleAction, rolePending] = useActionState(setUserRoleAction, undefined);
  const [pwState, pwAction, pwPending] = useActionState(resetUserPasswordAction, undefined);

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
    </div>
  );
}
