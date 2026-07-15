import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Styled native <select> — used where a plain form control inside a GET
 * form or server-action form beats the Radix Select (no client JS needed).
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs",
        className
      )}
      {...props}
    />
  );
}

export { NativeSelect };
