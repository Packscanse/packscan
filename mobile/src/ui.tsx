import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import type { PackageStatus } from "./api/types";

/** Big-thumb UI for handheld use behind a counter: large targets, high contrast. */

export const colors = {
  bg: "#f6f6f7",
  card: "#ffffff",
  text: "#1a1a1a",
  muted: "#6b7280",
  border: "#e5e7eb",
  danger: "#b91c1c",
  dangerBg: "#fef2f2",
  ok: "#15803d",
  okBg: "#f0fdf4",
  warnBg: "#fffbeb",
  warn: "#b45309",
};

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  accent,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  accent?: string;
}) {
  const bg =
    variant === "primary"
      ? (accent ?? "#1a1a1a")
      : variant === "danger"
        ? colors.danger
        : variant === "secondary"
          ? "#e5e7eb"
          : "transparent";
  const fg = variant === "secondary" || variant === "ghost" ? colors.text : "#ffffff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
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
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

export function Card({ children, tone }: { children: React.ReactNode; tone?: "danger" | "ok" | "warn" }) {
  const toneStyle =
    tone === "danger"
      ? { backgroundColor: colors.dangerBg, borderColor: "#fecaca" }
      : tone === "ok"
        ? { backgroundColor: colors.okBg, borderColor: "#bbf7d0" }
        : tone === "warn"
          ? { backgroundColor: colors.warnBg, borderColor: "#fde68a" }
          : null;
  return <View style={[styles.card, toneStyle]}>{children}</View>;
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
}: {
  title: string;
  active: boolean;
  onPress: () => void;
  accent?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: accent ?? "#1a1a1a", borderColor: accent ?? "#1a1a1a" },
      ]}
    >
      <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "600", fontSize: 13 }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Checkbox({
  checked,
  onToggle,
  label,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={[styles.checkbox, checked && { backgroundColor: "#1a1a1a" }]}>
        {checked ? <Text style={{ color: "#fff", fontWeight: "700" }}>✓</Text> : null}
      </View>
      <Text style={{ color: colors.text, flexShrink: 1, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const STATUS_TONES: Record<PackageStatus, { bg: string; fg: string }> = {
  LOGGED: { bg: "#e5e7eb", fg: "#374151" },
  AWAITING_PICKUP: { bg: "#dbeafe", fg: "#1d4ed8" },
  PICKED_UP: { bg: "#dcfce7", fg: "#15803d" },
  PENDING_HANDOFF: { bg: "#fef9c3", fg: "#a16207" },
  HANDED_OFF: { bg: "#dcfce7", fg: "#15803d" },
  RETURN_PENDING: { bg: "#ffedd5", fg: "#c2410c" },
  RETURNED_TO_CARRIER: { bg: "#e5e7eb", fg: "#374151" },
  CANCELLED: { bg: "#fee2e2", fg: "#b91c1c" },
};

export function StatusBadge({ status, label }: { status: PackageStatus; label: string }) {
  const tone = STATUS_TONES[status];
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: tone.fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  label: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 50,
    fontSize: 16,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
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
    borderColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
