import type { CSSProperties } from "react";

/**
 * Per-store chain branding: the store's primary color overrides the theme's
 * `--primary` (and friends) for everything rendered inside the dashboard.
 * Foreground is picked by WCAG relative luminance so text on brand-colored
 * buttons stays readable for both ICA red and lighter brand colors.
 */

function channel(hex: string): number {
  const v = Number.parseInt(hex, 16) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hexColor: string): number {
  const hex = hexColor.replace("#", "");
  return (
    0.2126 * channel(hex.slice(0, 2)) +
    0.7152 * channel(hex.slice(2, 4)) +
    0.0722 * channel(hex.slice(4, 6))
  );
}

/**
 * Store logos are stored as data URLs in the DB (no external file storage
 * needed); rendered only via <img>, where SVG scripts never execute.
 */
export const LOGO_MAX_BYTES = 256 * 1024;
export const LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
]);

export function validateLogo(type: string, size: number): string | null {
  if (!LOGO_TYPES.has(type)) return "Logo must be PNG, JPEG, SVG, or WebP.";
  if (size === 0) return "The file is empty.";
  if (size > LOGO_MAX_BYTES) return "Logo must be 256 KB or smaller.";
  return null;
}

export function brandStyle(brandColor: string | null): CSSProperties | undefined {
  if (!brandColor || !/^#[0-9a-f]{6}$/i.test(brandColor)) return undefined;
  const foreground = relativeLuminance(brandColor) > 0.4 ? "#111111" : "#ffffff";
  return {
    "--primary": brandColor,
    "--primary-foreground": foreground,
    "--ring": brandColor,
  } as CSSProperties;
}
