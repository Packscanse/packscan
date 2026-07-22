"use client";

import { useEffect } from "react";

/**
 * Counter mode: the Shelf First design is dark on handhelds and light on
 * desktop — the mode follows form factor, not a user setting. The breakpoint
 * mirrors Tailwind's `sm` (640px), the same line where the bottom tab bar
 * swaps for the top nav.
 *
 * Two mechanisms cooperate:
 * - An inline script toggles `.dark` during HTML parsing, so full page loads
 *   paint in the right palette from the first frame (no light flash).
 *   Scripts inserted by client-side navigation never execute — that case is
 *   covered by the effect below.
 * - A client effect re-applies the class after hydration/navigation and owns
 *   the live media-query listener for window resizes.
 *
 * The root layout suppresses the hydration warning this class causes on
 * <html>.
 */
const QUERY = "(max-width: 639px)";

const PRE_PAINT_SCRIPT =
  `document.documentElement.classList.toggle("dark",` +
  `window.matchMedia("${QUERY}").matches);`;

export function CounterMode() {
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const apply = () =>
      document.documentElement.classList.toggle("dark", media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />;
}
