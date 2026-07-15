import type { AdminFormState } from "@/actions/admin";

/** Inline success/error feedback under an admin form row. */
export function FormStateLine({ state }: { state: AdminFormState | undefined }) {
  if (state?.error) {
    return (
      <p className="text-xs text-destructive" role="alert">
        {state.error}
      </p>
    );
  }
  if (state?.success) {
    return <p className="text-xs text-green-700 dark:text-green-400">{state.success}</p>;
  }
  return null;
}
