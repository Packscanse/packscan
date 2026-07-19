import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
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
import { Button, Card, Field, Row, StatusBadge, colors } from "../ui";

/**
 * Package detail with the status actions the state machine allows. Pickup
 * routes through the shared handover screen; the rest are one-tap actions.
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
  onPickup: (handover: HandoverContext) => void;
  onBack: () => void;
}) {
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [policy, setPolicy] = useState<PickupPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Button title="←" variant="ghost" onPress={onBack} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Text style={{ fontFamily: "Courier", fontSize: 18, fontWeight: "800", color: colors.text }}>
          {pkg.trackingNumber}
        </Text>
        <StatusBadge status={pkg.status} label={t.status[pkg.status]} />
      </View>

      <Card>
        <Row label={t.detail.carrier} value={carrierLabel} />
        <Row label={t.detail.direction} value={inbound ? t.detail.inbound : t.detail.outbound} />
        {pkg.customerName ? (
          <Row label={inbound ? t.detail.customer : t.detail.sender} value={pkg.customerName} />
        ) : null}
        {pkg.customerPhone || pkg.customerEmail ? (
          <Row
            label={t.detail.contact}
            value={[pkg.customerPhone, pkg.customerEmail].filter(Boolean).join(" · ")}
          />
        ) : null}
        {pkg.shelfLocation ? <Row label={t.detail.shelf} value={pkg.shelfLocation} /> : null}
        {pkg.notes ? <Row label={t.detail.notes} value={pkg.notes} /> : null}
        <Row label={t.detail.registered} value={new Date(pkg.createdAt).toLocaleString()} />
      </Card>

      {pkg.status === "AWAITING_PICKUP" && (
        <Button
          title={t.detail.completePickup}
          accent={accent}
          onPress={() =>
            onPickup({
              packageId: pkg.id,
              trackingNumber: pkg.trackingNumber,
              carrier: pkg.carrier,
              customerName: pkg.customerName,
              shelfLocation: pkg.shelfLocation,
              policy: policy ?? { code: "accepted", idCheck: "required", proxyAllowed: true },
            })
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
      {canCancel && (
        <Card>
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
      )}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

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

      <Card>
        <Text style={{ fontWeight: "700", color: colors.text }}>{t.detail.history}</Text>
        {pkg.scanEvents.map((event) => (
          <View key={event.id} style={{ gap: 2 }}>
            <Text style={{ color: colors.text }}>
              {event.fromStatus
                ? `${t.status[event.fromStatus]} → ${t.status[event.toStatus]}`
                : t.status[event.toStatus]}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {new Date(event.scannedAt).toLocaleString()} · {event.user.name}
            </Text>
            {event.verification && (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {t.detail.verified}:{" "}
                {[
                  event.verification.presentedCode && "QR",
                  event.verification.idChecked &&
                    `ID${event.verification.idType ? ` (${t.idType[event.verification.idType]})` : ""}`,
                  event.verification.collectorName,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
            {event.verification?.override && (
              <Text style={{ color: colors.warn, fontWeight: "700", fontSize: 12 }}>
                {t.detail.overrideFlag} — {event.verification.overrideReason}
              </Text>
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
