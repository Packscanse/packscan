"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";

/**
 * The loud Shelf First success state: radial brand glow, a check circle that
 * scales in, and nothing to read unless you want to. Tapping anywhere — or
 * ~4 seconds of nothing — returns to the camera for the next customer.
 */
export function DoneScreen({
  title,
  meta,
  actionLabel,
  onDone,
  autoReturnMs = 4000,
}: {
  title: string;
  /** Small centered lines under the title (join with \n). */
  meta?: string;
  actionLabel: string;
  onDone: () => void;
  autoReturnMs?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, autoReturnMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      onClick={onDone}
      className="grid min-h-[480px] w-full place-items-center overflow-hidden rounded-[24px] text-center outline-none"
      style={{
        background:
          "radial-gradient(circle at 50% 30%, color-mix(in oklch, var(--primary) 35%, var(--background)), var(--background))",
      }}
    >
      <span className="grid justify-items-center gap-4 p-8">
        <span className="grid size-24 origin-center animate-in place-items-center rounded-full bg-primary text-primary-foreground duration-300 zoom-in-50">
          <Check className="size-13" strokeWidth={3} />
        </span>
        <span className="text-[26px] font-bold">{title}</span>
        {meta && (
          <span className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
            {meta}
          </span>
        )}
        <span className="mt-2 grid h-[52px] place-items-center rounded-full border border-dash px-6 text-[15px] font-semibold">
          {actionLabel}
        </span>
      </span>
    </button>
  );
}
