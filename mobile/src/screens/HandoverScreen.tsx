import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { HandoverContext, HandoverInput, IdType } from "../api/types";
import { CARRIER_LABELS } from "../carriers";
import type { AppMessages } from "../i18n";
import { Button, Card, Checkbox, Chip, Field, Row, colors } from "../ui";
import { Scanner } from "../components/Scanner";

const ID_TYPES: IdType[] = ["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID", "OTHER"];

/**
 * The verification step before a pickup completes — the app version of the
 * web's HandoverPanel. Client-side gating is a convenience; the server
 * re-validates against the carrier's policy on submit.
 */
export function HandoverScreen({
  t,
  accent,
  handover,
  canOverride,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  t: AppMessages;
  accent?: string;
  handover: HandoverContext;
  canOverride: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (verification: HandoverInput) => void;
  onCancel: () => void;
}) {
  const policy = handover.policy;
  const carrierLabel = CARRIER_LABELS[handover.carrier] ?? handover.carrier;
  const [presentedCode, setPresentedCode] = useState("");
  const [typed, setTyped] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [idChecked, setIdChecked] = useState(false);
  const [idType, setIdType] = useState<IdType | null>(null);
  const [collectorName, setCollectorName] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const codeRequired = policy.code === "required";
  const showCode = policy.code !== "none";

  function captureCode(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (value === handover.trackingNumber) {
      // Habit-scanning the parcel label must never become "evidence".
      setWarning(t.handover.ownLabelWarning);
      return;
    }
    setWarning(null);
    setPresentedCode(value);
  }

  const policySatisfied =
    (!codeRequired || presentedCode.length > 0) &&
    (policy.idCheck !== "required" || idChecked) &&
    (!idChecked || idType !== null);
  const satisfied = override
    ? overrideReason.trim().length >= 3 && (!idChecked || idType !== null)
    : policySatisfied;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>
        {t.handover.title}
      </Text>
      <Card>
        <Row label={t.handover.carrier} value={carrierLabel} />
        {handover.customerName ? (
          <Row label={t.handover.addressedTo} value={handover.customerName} />
        ) : null}
        {handover.shelfLocation ? (
          <Row label={t.handover.shelf} value={handover.shelfLocation} />
        ) : null}
        <Text style={{ fontFamily: "Courier", color: colors.muted }}>
          {handover.trackingNumber}
        </Text>
      </Card>

      {showCode && (
        <Card>
          <Text style={{ fontWeight: "600", color: colors.text }}>
            {t.handover.scanCode(carrierLabel)}
            {codeRequired ? "" : t.handover.optional}
          </Text>
          {presentedCode ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontFamily: "Courier", flexShrink: 1, color: colors.text }}>
                {t.handover.scannedCode}
                {presentedCode}
              </Text>
              <Button
                title={t.handover.clear}
                variant="ghost"
                onPress={() => setPresentedCode("")}
              />
            </View>
          ) : (
            <>
              <Scanner
                onScan={captureCode}
                permissionText={t.scan.cameraPermission}
                grantText={t.scan.grantCamera}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Field
                    placeholder={t.handover.typeCode}
                    value={typed}
                    onChangeText={setTyped}
                    autoCorrect={false}
                    onSubmitEditing={() => {
                      captureCode(typed);
                      setTyped("");
                    }}
                  />
                </View>
                <Button
                  title={t.scan.use}
                  variant="secondary"
                  onPress={() => {
                    captureCode(typed);
                    setTyped("");
                  }}
                />
              </View>
            </>
          )}
          {warning ? <Text style={{ color: colors.danger }}>{warning}</Text> : null}
        </Card>
      )}

      <Card>
        <Checkbox
          checked={idChecked}
          onToggle={() => setIdChecked(!idChecked)}
          label={`${t.handover.idChecked}${policy.idCheck === "required" ? ` ${t.handover.required}` : ""}`}
        />
        {idChecked && (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {ID_TYPES.map((type) => (
              <Chip
                key={type}
                title={t.idType[type]}
                active={idType === type}
                accent={accent}
                onPress={() => setIdType(type)}
              />
            ))}
          </View>
        )}
      </Card>

      {policy.proxyAllowed ? (
        <Field
          label={t.handover.collectorLabel}
          value={collectorName}
          onChangeText={setCollectorName}
          autoCapitalize="words"
        />
      ) : (
        <Text style={{ color: colors.muted }}>{t.handover.noProxy(carrierLabel)}</Text>
      )}

      {canOverride && (
        <Card tone={override ? "warn" : undefined}>
          <Checkbox
            checked={override}
            onToggle={() => setOverride(!override)}
            label={t.handover.overrideLabel}
          />
          {override && (
            <Field
              label={t.handover.overrideReason}
              value={overrideReason}
              onChangeText={setOverrideReason}
            />
          )}
        </Card>
      )}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <Button
        title={busy ? t.handover.saving : t.handover.confirm}
        accent={accent}
        loading={busy}
        disabled={!satisfied}
        onPress={() =>
          onConfirm({
            presentedCode: presentedCode || undefined,
            idChecked,
            idType: idChecked && idType ? idType : undefined,
            collectorName: collectorName.trim() || undefined,
            override: override || undefined,
            overrideReason: override ? overrideReason.trim() : undefined,
          })
        }
      />
      <Button title={t.handover.cancel} variant="ghost" onPress={onCancel} />
    </ScrollView>
  );
}
