/**
 * Counter mode: the Shelf First design is dark on handhelds and light on
 * desktop — the mode follows form factor, not a user setting. A tiny inline
 * script toggles the `.dark` class from a media query so the right palette
 * is applied before first paint (no light flash on phones) and live when a
 * window is resized across the breakpoint.
 *
 * The breakpoint mirrors Tailwind's `sm` (640px) — the same line where the
 * bottom tab bar swaps for the top nav. The root layout suppresses the
 * hydration warning this class causes on <html>.
 */
const COUNTER_MODE_SCRIPT = [
  "(function(){",
  "if(window.__psCounterMode)return;window.__psCounterMode=1;",
  'var m=window.matchMedia("(max-width: 639px)");',
  'var a=function(){document.documentElement.classList.toggle("dark",m.matches);};',
  "a();",
  'm.addEventListener("change",a);',
  "})();",
].join("");

export function CounterMode() {
  return <script dangerouslySetInnerHTML={{ __html: COUNTER_MODE_SCRIPT }} />;
}
