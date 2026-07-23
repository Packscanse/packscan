import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { HandoverContext, HandoverInput, IdType } from "../api/types";
import { CARRIER_LABELS } from "../carriers";
import type { AppMessages } from "../i18n";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Field,
  SectionLabel,
  ShelfChip,
  ShelfPoster,
  Tile,
  colors,
} from "../ui";
import { Scanner } from "../components/Scanner";

const ID_TYPES: IdType[] = ["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID", "OTHER"];

function daysOnShelf(arrivedAt: string): number {
  const ms = Date.now() - new Date(arrivedAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

/**
 * The match screen: the shelf poster answers "where is it?", verification
 * is two tap-tiles (a third when a proxy collects), and the confirm stays
 * disabled until the carrier's policy is met. Client-side gating is a
 * convenience; the server re-validates on submit.
 */
export function HandoverScreen({
  t,
  accent,
  handover,
  companions,
  canOverride,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  t: AppMessages;
  accent?: string;
  handover: HandoverContext;
  companions: HandoverContext[];
  canOverride: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (verification: HandoverInput) => void;
  onCancel: () => void;
}) {
  const policy = handover.policy;
  const carrierLabel = CARRIER_LABELS[handover.carrier] ?? handover.carrier;
  const [presentedCode, setPresentedCode] = useState("");
  const [captureCodeOpen, setCaptureCodeOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [idChecked, setIdChecked] = useState(false);
  const [idType, setIdType] = useState<IdType | null>(null);
  const [collectorName, setCollectorName] = useState("");
  const [collectorIdChecked, setCollectorIdChecked] = useState(false);
  const [collectorIdType, setCollectorIdType] = useState<IdType | null>(null);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const codeRequired = policy.code === "required";
  const showCode = policy.code !== "none";
  const isProxy = collectorName.trim().length > 0;

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
    setCaptureCodeOpen(false);
  }

  // A proxy pickup needs both photo-IDs — mirrors the server's checkHandover.
  const idsSatisfied = isProxy
    ? idChecked && idType !== null && collectorIdChecked && collectorIdType !== null
    : (policy.idCheck !== "required" || idChecked) && (!idChecked || idType !== null);
  const policySatisfied = (!codeRequired || presentedCode.length > 0) && idsSatisfied;
  const satisfied = override
    ? overrideReason.trim().length >= 3 && (!idChecked || idType !== null)
    : policySatisfied;

  const days = daysOnShelf(handover.arrivedAt);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={{ color: colors.muted, fontSize: 15 }}>‹ {t.handover.back}</Text>
        </Pressable>
        <Text style={{ color: colors.muted, fontFamily: "Courier", fontSize: 13 }}>
          {handover.trackingNumber}
        </Text>
      </View>

      <ShelfPoster
        code={handover.shelfLocation}
        eyebrow={t.handover.shelfEyebrow}
        name={handover.customerName}
        meta={`${carrierLabel} · ${t.handover.onShelfDays(days)}`}
        accent={accent}
      />

      {companions.length > 0 && (
        <Card dashed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <MaterialCommunityIcons name="package-variant-plus" size={22} color={colors.muted} />
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>
                {t.handover.alsoWaiting(handover.customerName ?? "?", companions.length)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{t.handover.takeAll}</Text>
            </View>
          </View>
          {companions.map((c) => (
            <View key={c.packageId} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ShelfChip code={c.shelfLocation} accent={accent} size={36} />
              <Text style={{ color: colors.secondaryText, fontFamily: "Courier", fontSize: 12 }}>
                …{c.trackingNumber.slice(-6)}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <View style={{ flexDirection: "row", gap: 10 }}>
        {showCode && (
          <Tile
            icon="qrcode"
            label={t.handover.codeTile}
            hint={presentedCode ? `${t.handover.scannedCode}${presentedCode}` : t.handover.codeHint + (codeRequired ? "" : t.handover.optional)}
            active={presentedCode.length > 0}
            accent={accent}
            onPress={() => {
              if (presentedCode) {
                setPresentedCode("");
              } else {
                setCaptureCodeOpen((open) => !open);
              }
            }}
          />
        )}
        <Tile
          icon="card-account-details-outline"
          label={t.handover.idTile + (policy.idCheck === "required" || isProxy ? " *" : "")}
          hint={t.handover.idHint}
          active={idChecked}
          accent={accent}
          onPress={() => setIdChecked(!idChecked)}
        />
        {isProxy && (
          <Tile
            icon="account-switch-outline"
            label={t.handover.collectorIdTile + " *"}
            hint={t.handover.collectorIdHint}
            active={collectorIdChecked}
            accent={accent}
            onPress={() => setCollectorIdChecked(!collectorIdChecked)}
          />
        )}
      </View>

      {captureCodeOpen && !presentedCode && (
        <Card>
          <Text style={{ fontWeight: "600", color: colors.text }}>
            {t.handover.scanCode(carrierLabel)}
          </Text>
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
          {warning ? <Text style={{ color: colors.danger }}>{warning}</Text> : null}
        </Card>
      )}
      {warning && !captureCodeOpen ? (
        <Text style={{ color: colors.danger }}>{warning}</Text>
      ) : null}

      {idChecked && (
        <View style={{ gap: 6 }}>
          <SectionLabel>{t.handover.recipientId}</SectionLabel>
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
        </View>
      )}

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

      {isProxy && collectorIdChecked && (
        <View style={{ gap: 6 }}>
          <SectionLabel>{t.handover.collectorId}</SectionLabel>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {ID_TYPES.map((type) => (
              <Chip
                key={type}
                title={t.idType[type]}
                active={collectorIdType === type}
                accent={accent}
                onPress={() => setCollectorIdType(type)}
              />
            ))}
          </View>
        </View>
      )}

      {canOverride && (
        <Card tone={override ? "warn" : undefined}>
          <Checkbox
            checked={override}
            onToggle={() => setOverride(!override)}
            label={t.handover.overrideLabel}
            accent={accent}
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
        title={busy ? t.handover.saving : satisfied ? t.handover.confirm : t.handover.verifyToConfirm}
        accent={accent}
        size="xl"
        loading={busy}
        disabled={!satisfied}
        onPress={() =>
          onConfirm({
            presentedCode: presentedCode || undefined,
            idChecked,
            idType: idChecked && idType ? idType : undefined,
            collectorName: collectorName.trim() || undefined,
            collectorIdChecked: isProxy && collectorIdChecked ? true : undefined,
            collectorIdType:
              isProxy && collectorIdChecked && collectorIdType ? collectorIdType : undefined,
            override: override || undefined,
            overrideReason: override ? overrideReason.trim() : undefined,
          })
        }
      />
      <Button title={t.handover.cancel} variant="ghost" onPress={onCancel} />
    </ScrollView>
  );
}
