import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { api } from "../api/client";
import type {
  CarrierStatusResult,
  HandoverContext,
  PackageDetail,
  PickupPolicy,
  ScanResult,
} from "../api/types";
import { CARRIER_LABELS } from "../carriers";
import type { AppMessages } from "../i18n";
import {
  Button,
  Card,
  Field,
  Row,
  SectionLabel,
  ShelfPoster,
  StatusBadge,
  colors,
} from "../ui";

type TimelineEntry = { at: string; title: string; meta: string[]; warn?: boolean };

/**
 * The parcel as a story: shelf poster, the actions the state machine
 * allows, then a merged timeline of scans and notifications instead of an
 * audit table.
 */
export function PackageDetailScreen({
  t,
  accent,
  packageId,
  onPickup,
  onBack,
}: {
  t: AppMessages;
  accent?: string;
  packageId: string;
  onPickup: (handover: HandoverContext, companions: HandoverContext[]) => void;
  onBack: () => void;
}) {
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [policy, setPolicy] = useState<PickupPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [lookup, setLookup] = useState<CarrierStatusResult | null>(null);
  const [looking, setLooking] = useState(false);

  const load = useCallback(async () => {
    const res = await api<
      { ok: true; package: PackageDetail; pickupPolicy: PickupPolicy } | { ok: false }
    >(`/packages/${packageId}`);
    if (res.ok) {
      setPkg(res.package);
      setPolicy(res.pickupPolicy);
    }
  }, [packageId]);

  useEffect(() => {
    void load().catch(() => setError(null));
  }, [load]);

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<ScanResult>(`/packages/${packageId}/actions`, { body });
      if (!res.ok) setError("error" in res ? res.error : t.common.error);
      await load();
    } catch {
      setError(t.common.error);
    } finally {
      setBusy(false);
    }
  }

  async function checkCarrier() {
    setLooking(true);
    try {
      setLookup(await api<CarrierStatusResult>(`/packages/${packageId}/carrier-status`));
    } catch {
      setLookup({ ok: false, code: "LOOKUP_FAILED" });
    } finally {
      setLooking(false);
    }
  }

  if (!pkg) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20 }}>
        <Text style={{ color: colors.muted }}>{t.detail.working}</Text>
      </View>
    );
  }

  const carrierLabel = CARRIER_LABELS[pkg.carrier] ?? pkg.carrier;
  const inbound = pkg.direction === "INBOUND";
  const canAdvance = pkg.status === "PENDING_HANDOFF" || pkg.status === "RETURN_PENDING";
  const canReturn = pkg.status === "AWAITING_PICKUP" || pkg.status === "LOGGED";
  const canCancel = !["PICKED_UP", "HANDED_OFF", "RETURNED_TO_CARRIER", "CANCELLED"].includes(
    pkg.status
  );
  const danger = pkg.status === "RETURN_PENDING" || pkg.status === "CANCELLED";

  const timeline: TimelineEntry[] = [
    ...pkg.scanEvents.map((event) => ({
      at: event.scannedAt,
      title: event.fromStatus
        ? `${t.status[event.fromStatus]} → ${t.status[event.toStatus]}`
        : t.status[event.toStatus],
      meta: [
        `${new Date(event.scannedAt).toLocaleString()} · ${event.user.name}`,
        ...(event.verification
          ? [
              `${t.detail.verified}: ${[
                event.verification.presentedCode && "QR",
                event.verification.idChecked &&
                  `ID${event.verification.idType ? ` (${t.idType[event.verification.idType]})` : ""}`,
                event.verification.collectorName,
              ]
                .filter(Boolean)
                .join(" · ")}`,
            ]
          : []),
        ...(event.verification?.override
          ? [`${t.detail.overrideFlag} — ${event.verification.overrideReason ?? ""}`]
          : []),
      ],
      warn: Boolean(event.verification?.override),
    })),
    ...pkg.notifications.map((n) => ({
      at: n.createdAt,
      title: t.detail.smsTo(n.recipient),
      meta: [`${new Date(n.createdAt).toLocaleString()} · ${n.status}`],
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={{ color: colors.muted, fontSize: 15 }}>‹ {t.detail.back}</Text>
        </Pressable>
        <StatusBadge status={pkg.status} label={t.status[pkg.status]} />
      </View>

      <ShelfPoster
        code={pkg.shelfLocation}
        eyebrow={t.handover.shelfEyebrow}
        name={pkg.customerName}
        meta={`${carrierLabel} · ${pkg.trackingNumber}`}
        accent={accent}
        danger={danger}
        compact
      />

      {pkg.status === "AWAITING_PICKUP" && (
        <Button
          title={t.detail.completePickup}
          accent={accent}
          size="xl"
          onPress={() =>
            onPickup(
              {
                packageId: pkg.id,
                trackingNumber: pkg.trackingNumber,
                carrier: pkg.carrier,
                customerName: pkg.customerName,
                shelfLocation: pkg.shelfLocation,
                arrivedAt: pkg.createdAt,
                policy: policy ?? { code: "accepted", idCheck: "required", proxyAllowed: true },
              },
              []
            )
          }
        />
      )}
      {canAdvance && (
        <Button
          title={pkg.status === "PENDING_HANDOFF" ? t.detail.markHandedOff : t.detail.markReturned}
          accent={accent}
          loading={busy}
          onPress={() => void action({ action: "advance" })}
        />
      )}
      {canReturn && (
        <Button
          title={t.detail.markForReturn}
          variant="secondary"
          loading={busy}
          onPress={() => void action({ action: "mark-return" })}
        />
      )}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <Card>
        <Row label={t.detail.direction} value={inbound ? t.detail.inbound : t.detail.outbound} />
        {pkg.customerPhone || pkg.customerEmail ? (
          <Row
            label={t.detail.contact}
            value={[pkg.customerPhone, pkg.customerEmail].filter(Boolean).join(" · ")}
          />
        ) : null}
        {pkg.notes ? <Row label={t.detail.notes} value={pkg.notes} /> : null}
      </Card>

      <Card>
        <SectionLabel>{t.detail.history}</SectionLabel>
        {timeline.map((entry, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ alignItems: "center", width: 12 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  marginTop: 4,
                  backgroundColor: entry.warn ? colors.warn : colors.ok,
                }}
              />
              {i < timeline.length - 1 && (
                <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 }} />
              )}
            </View>
            <View style={{ flex: 1, gap: 1, paddingBottom: i < timeline.length - 1 ? 10 : 0 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                {entry.title}
              </Text>
              {entry.meta.map((line, j) => (
                <Text
                  key={j}
                  style={{ color: entry.warn && j > 0 ? colors.warn : colors.muted, fontSize: 12 }}
                >
                  {line}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Button
          title={looking ? t.detail.checking : t.detail.checkCarrierStatus}
          variant="secondary"
          loading={looking}
          onPress={() => void checkCarrier()}
        />
        {lookup &&
          (lookup.ok ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: "700", color: colors.text }}>{lookup.status}</Text>
              {lookup.events.map((e, i) => (
                <Text key={i} style={{ color: colors.muted }}>
                  {new Date(e.timestamp).toLocaleString()} — {e.description}
                  {e.location ? ` (${e.location})` : ""}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>
              {lookup.code === "NOT_CONFIGURED"
                ? t.detail.lookupNotConfigured(carrierLabel)
                : t.detail.lookupFailed}
            </Text>
          ))}
      </Card>

      {canCancel && (
        <View style={{ gap: 10 }}>
          {cancelOpen ? (
            <Card tone="danger">
              <Field
                label={t.detail.cancelReason}
                value={cancelReason}
                onChangeText={setCancelReason}
              />
              <Button
                title={t.detail.cancelPackage}
                variant="danger"
                loading={busy}
                disabled={cancelReason.trim().length < 3}
                onPress={() => void action({ action: "cancel", reason: cancelReason.trim() })}
              />
            </Card>
          ) : (
            <Button
              title={t.detail.cancelPackage}
              variant="ghost"
              onPress={() => setCancelOpen(true)}
            />
          )}
        </View>
      )}
    </ScrollView>
  );
}
