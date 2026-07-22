import { cn } from "@/lib/utils";

/**
 * The shelf-block motif from the Shelf First design: a brand-filled block
 * with the shelf code in heavy type. The clerk's question at the counter is
 * "where is it?", so the answer gets the visual volume — poster-sized on
 * scan and detail screens, chip-sized in lists. The danger variant (solid
 * red regardless of store brand) marks parcels going back to the carrier.
 */

const CHIP_SIZES = {
  /** 56px chip for handheld list rows */
  row: "size-14 rounded-[12px] text-2xl",
  /** 36px chip for desktop table rows */
  desktop: "size-9 rounded-[9px] text-[15px]",
  /** 30px count chip for desktop stat rows */
  count: "size-[30px] rounded-lg text-[13px]",
} as const;

export function ShelfChip({
  code,
  size = "row",
  danger = false,
  className,
}: {
  code: string | null;
  size?: keyof typeof CHIP_SIZES;
  danger?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-extrabold tracking-tight",
        CHIP_SIZES[size],
        danger
          ? "bg-[#dc2626] text-white"
          : code
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-faint",
        className
      )}
    >
      {code ?? "—"}
    </span>
  );
}

export function ShelfPoster({
  code,
  eyebrow,
  danger = false,
  className,
  children,
}: {
  code: string | null;
  /** Small tracked-out label above the code, e.g. t.scan.shelfEyebrow. */
  eyebrow?: string;
  danger?: boolean;
  className?: string;
  /** Extra centered lines under the code: customer name, carrier · dwell. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-[24px] px-5 py-8 text-center",
        danger ? "bg-[#dc2626] text-white" : "bg-primary text-primary-foreground",
        className
      )}
    >
      {eyebrow && (
        <span className="text-sm font-semibold tracking-[0.1em] uppercase opacity-80">
          {eyebrow}
        </span>
      )}
      <span className="text-[96px] leading-none font-extrabold tracking-[-0.04em]">
        {code ?? "—"}
      </span>
      {children}
    </div>
  );
}
