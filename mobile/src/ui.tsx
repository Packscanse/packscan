import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { PackageStatus } from "./api/types";

/**
 * Dark "counter mode" for handheld use behind a counter — the app-side of
 * the web's Shelf First tokens: near-black surfaces, pill buttons, the
 * shelf block as the visual hero, brand color straight from the store.
 */

export const colors = {
  bg: "#101012",
  card: "#1b1b20",
  sheet: "#18181b",
  inner: "#26262b",
  text: "#ffffff",
  secondaryText: "#c9c9d1",
  muted: "#9b9ba3",
  faint: "#71717a",
  border: "#2a2a30",
  dashed: "#3f3f46",
  danger: "#fca5a5",
  dangerSolid: "#dc2626",
  dangerBg: "#2b1214",
  dangerBorder: "#7f1d1d",
  ok: "#4ade80",
  okFill: "#15803d",
  okBg: "#0f2417",
  okBorder: "#166534",
  warn: "#fbbf24",
  warnBg: "#2b2110",
  warnBorder: "#713f12",
};

/** Default accent when the store has no brand color: white-on-dark. */
export const DEFAULT_ACCENT = "#ffffff";

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

/** Text color on an accent-filled surface — same rule as the web's branding.ts. */
export function accentForeground(accent: string): string {
  return luminance(accent) > 0.4 ? "#111111" : "#ffffff";
}

/** An accent that stays visible as text/icon on the dark background. */
export function onDarkAccent(accent: string): string {
  return luminance(accent) < 0.05 ? "#ffffff" : accent;
}

/** 25% accent tint for selected tiles (RN understands #rrggbbaa). */
export function accentTint(accent: string): string {
  return /^#[0-9a-f]{6}$/i.test(accent.trim()) ? `${accent.trim()}40` : "rgba(255,255,255,0.25)";
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size,
  disabled,
  loading,
  accent,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "xl";
  disabled?: boolean;
  loading?: boolean;
  accent?: string;
}) {
  const brand = accent ?? DEFAULT_ACCENT;
  const bg =
    variant === "primary"
      ? brand
      : variant === "danger"
        ? colors.dangerBg
        : variant === "secondary"
          ? colors.inner
          : "transparent";
  const fg =
    variant === "primary"
      ? accentForeground(brand)
      : variant === "danger"
        ? colors.danger
        : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        size === "xl" && { minHeight: 60 },
        { backgroundColor: bg, opacity: disabled || loading ? 0.4 : pressed ? 0.8 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.dashed },
        variant === "danger" && { borderWidth: 1, borderColor: colors.dangerBorder },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, size === "xl" && { fontSize: 17 }, { color: fg }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

export function Card({
  children,
  tone,
  dashed,
}: {
  children: React.ReactNode;
  tone?: "danger" | "ok" | "warn";
  dashed?: boolean;
}) {
  const toneStyle =
    tone === "danger"
      ? { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }
      : tone === "ok"
        ? { backgroundColor: colors.okBg, borderColor: colors.okBorder }
        : tone === "warn"
          ? { backgroundColor: colors.warnBg, borderColor: colors.warnBorder }
          : null;
  return (
    <View style={[styles.card, toneStyle, dashed && { borderStyle: "dashed", borderColor: colors.dashed, backgroundColor: "transparent" }]}>
      {children}
    </View>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
      <Text style={{ color: colors.muted }}>{label}:</Text>
      <Text style={{ color: colors.text, fontWeight: "500", flexShrink: 1 }}>{value}</Text>
    </View>
  );
}

export function Chip({
  title,
  active,
  onPress,
  accent,
  danger,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
  accent?: string;
  danger?: boolean;
}) {
  const brand = accent ?? DEFAULT_ACCENT;
  const activeStyle = danger
    ? { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }
    : { backgroundColor: brand, borderColor: brand };
  const fg = active ? (danger ? colors.danger : accentForeground(brand)) : colors.secondaryText;
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && activeStyle]}>
      <Text style={{ color: fg, fontWeight: "600", fontSize: 13 }}>{title}</Text>
    </Pressable>
  );
}

export function Checkbox({
  checked,
  onToggle,
  label,
  disabled,
  accent,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
  accent?: string;
}) {
  const brand = accent ?? DEFAULT_ACCENT;
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, opacity: disabled ? 0.5 : 1 }}
    >
      <View
        style={[styles.checkbox, checked && { backgroundColor: brand, borderColor: brand }]}
      >
        {checked ? (
          <Text style={{ color: accentForeground(brand), fontWeight: "700" }}>✓</Text>
        ) : null}
      </View>
      <Text style={{ color: colors.text, flexShrink: 1, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const STATUS_TONES: Record<PackageStatus, { bg: string; fg: string }> = {
  LOGGED: { bg: colors.inner, fg: colors.secondaryText },
  AWAITING_PICKUP: { bg: "#172554", fg: "#93c5fd" },
  PICKED_UP: { bg: colors.okBg, fg: colors.ok },
  PENDING_HANDOFF: { bg: colors.warnBg, fg: colors.warn },
  HANDED_OFF: { bg: colors.okBg, fg: colors.ok },
  RETURN_PENDING: { bg: "#3b1113", fg: colors.danger },
  RETURNED_TO_CARRIER: { bg: colors.inner, fg: colors.secondaryText },
  CANCELLED: { bg: colors.dangerBg, fg: colors.danger },
};

export function StatusBadge({ status, label }: { status: PackageStatus; label: string }) {
  const tone = STATUS_TONES[status];
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: tone.fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

/**
 * The shelf-block motif — the answer to "where is it?" at poster scale.
 */
export function ShelfPoster({
  code,
  eyebrow,
  name,
  meta,
  accent,
  danger,
  compact,
}: {
  code: string | null;
  eyebrow: string;
  name?: string | null;
  meta?: string | null;
  accent?: string;
  danger?: boolean;
  compact?: boolean;
}) {
  const bg = danger ? colors.dangerSolid : (accent ?? DEFAULT_ACCENT);
  const fg = accentForeground(bg);
  const dim = { color: fg, opacity: 0.8 } as const;
  return (
    <View style={[styles.poster, { backgroundColor: bg }, compact && { paddingVertical: 20 }]}>
      <Text style={[styles.posterEyebrow, dim]}>{eyebrow}</Text>
      <Text
        style={[styles.posterCode, { color: fg }, compact && { fontSize: 64, lineHeight: 68 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {code ?? "—"}
      </Text>
      {name ? <Text style={[styles.posterName, { color: fg }]}>{name}</Text> : null}
      {meta ? <Text style={[styles.posterMeta, dim]}>{meta}</Text> : null}
    </View>
  );
}

/** Row-sized shelf block for lists. */
export function ShelfChip({
  code,
  accent,
  danger,
  size = 52,
}: {
  code: string | null;
  accent?: string;
  danger?: boolean;
  size?: number;
}) {
  const bg = danger ? colors.dangerSolid : (accent ?? DEFAULT_ACCENT);
  const fg = accentForeground(bg);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{ color: fg, fontWeight: "800", fontSize: size * 0.38 }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {code ?? "—"}
      </Text>
    </View>
  );
}

/**
 * Verification tap-tile: dashed idle, accent-tinted when verified.
 */
export function Tile({
  icon,
  label,
  hint,
  active,
  onPress,
  accent,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
  accent?: string;
}) {
  const brand = onDarkAccent(accent ?? DEFAULT_ACCENT);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tile,
        active
          ? { backgroundColor: accentTint(accent ?? DEFAULT_ACCENT), borderColor: brand }
          : { backgroundColor: colors.inner, borderColor: colors.dashed },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={active ? brand : colors.muted} />
      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>
        {active ? "✓ " : ""}
        {label}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text>
    </Pressable>
  );
}

/** On-screen digit pad — 58px keys, delete bottom-right. */
export function Keypad({
  onDigit,
  onDelete,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {keys.map((key, i) =>
        key === "" ? (
          <View key={i} style={styles.key} />
        ) : (
          <Pressable
            key={i}
            onPress={() => (key === "⌫" ? onDelete() : onDigit(key))}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: pressed ? colors.inner : colors.card },
            ]}
          >
            {key === "⌫" ? (
              <MaterialCommunityIcons name="backspace-outline" size={24} color={colors.text} />
            ) : (
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "600" }}>{key}</Text>
            )}
          </Pressable>
        )
      )}
    </View>
  );
}

/**
 * Loud success state: accent glow, big check, meta lines, auto-return.
 */
export function DoneScreen({
  accent,
  title,
  meta,
  nextLabel,
  onNext,
  autoMs = 4000,
}: {
  accent?: string;
  title: string;
  meta: string[];
  nextLabel: string;
  onNext: () => void;
  autoMs?: number;
}) {
  const brand = accent ?? DEFAULT_ACCENT;
  useEffect(() => {
    const timer = setTimeout(onNext, autoMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Pressable style={styles.done} onPress={onNext}>
      <View style={[styles.doneGlow, { backgroundColor: accentTint(brand), opacity: 0.5 }]} />
      <View style={[styles.doneCircle, { backgroundColor: brand }]}>
        <MaterialCommunityIcons name="check-bold" size={52} color={accentForeground(brand)} />
      </View>
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: "700", textAlign: "center" }}>
        {title}
      </Text>
      <View style={{ gap: 2 }}>
        {meta.map((line, i) => (
          <Text
            key={i}
            style={{ color: colors.secondaryText, fontSize: 15, textAlign: "center" }}
          >
            {line}
          </Text>
        ))}
      </View>
      <Pressable onPress={onNext} style={styles.doneNext}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{nextLabel}</Text>
      </Pressable>
    </Pressable>
  );
}

/** UPPERCASE section label, 0.08em-ish tracking. */
export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 52,
    fontSize: 16,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.dashed,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  poster: {
    borderRadius: 24,
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 2,
  },
  posterEyebrow: { fontSize: 13, fontWeight: "600", letterSpacing: 2 },
  posterCode: { fontSize: 96, lineHeight: 100, fontWeight: "800", letterSpacing: -2 },
  posterName: { fontSize: 18, fontWeight: "600" },
  posterMeta: { fontSize: 13 },
  tile: {
    flex: 1,
    minHeight: 96,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 4,
  },
  key: {
    width: "31%",
    flexGrow: 1,
    height: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  done: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    padding: 24,
    overflow: "hidden",
  },
  doneGlow: {
    position: "absolute",
    top: "8%",
    alignSelf: "center",
    width: 460,
    height: 460,
    borderRadius: 230,
  },
  doneCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  doneNext: {
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.dashed,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    marginTop: 10,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.2,
  },
});
