import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, NetworkError } from "../api/client";
import type {
  CarrierCode,
  HandoverContext,
  ScanContext,
  ScanFlow,
  ScanInput,
  ScanResult,
} from "../api/types";
import { ALL_CARRIERS, CARRIER_LABELS } from "../carriers";
import type { AppMessages } from "../i18n";
import { enqueueScan, flushQueue, readQueue, type SyncAttention } from "../offline";
import { Button, Card, Chip, Field, Row, colors } from "../ui";
import { Scanner } from "../components/Scanner";

type Pending = {
  trackingNumber: string;
  inputMethod: ScanInput["inputMethod"];
  carrier: CarrierCode;
  autoCarrier: CarrierCode;
  preAdvice: boolean;
  customerName: string;
  customerPhone: string;
  shelfLocation: string;
  notes: string;
};

export function ScanScreen({
  t,
  accent,
  userId,
  onHandover,
  onViewPackage,
}: {
  t: AppMessages;
  accent?: string;
  userId: string;
  onHandover: (input: ScanInput, handover: HandoverContext) => void;
  onViewPackage: (id: string) => void;
}) {
  const [flow, setFlow] = useState<ScanFlow>("INBOUND_PICKUP");
  const [manual, setManual] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);
  const [justQueued, setJustQueued] = useState(false);
  const [attention, setAttention] = useState<SyncAttention[]>([]);

  const refreshQueue = useCallback(async () => {
    setQueued((await readQueue()).length);
  }, []);

  const sync = useCallback(async () => {
    try {
      const outcome = await flushQueue();
      setQueued(outcome.remaining);
      if (outcome.attention.length > 0) setAttention((prev) => [...prev, ...outcome.attention]);
    } catch {
      // ignored: auth errors are handled by the root screen switch
    }
  }, []);

  // Try to drain the queue on mount and every 30 s while scans are waiting.
  useEffect(() => {
    void refreshQueue().then(() => void sync());
    const timer = setInterval(() => void sync(), 30_000);
    return () => clearInterval(timer);
  }, [refreshQueue, sync]);

  async function startScan(raw: string, inputMethod: ScanInput["inputMethod"]) {
    const trackingNumber = raw.trim();
    if (trackingNumber.length < 6 || pending || busy) return;
    setResult(null);
    setBusy(true);
    try {
      const ctx = await api<ScanContext>(
        `/scan-context?tracking=${encodeURIComponent(trackingNumber)}`
      );
      const auto = ctx.preAdvice?.carrier ?? ctx.candidates[0]?.carrier ?? "UNKNOWN";
      setPending({
        trackingNumber: ctx.trackingNumber,
        inputMethod,
        carrier: auto,
        autoCarrier: auto,
        preAdvice: ctx.preAdvice !== null,
        customerName: ctx.preAdvice?.customerName ?? "",
        customerPhone: ctx.preAdvice?.customerPhone ?? "",
        shelfLocation: "",
        notes: "",
      });
    } catch (e) {
      if (e instanceof NetworkError) {
        // Offline: no server-side detection available — confirm with a
        // manual carrier pick; the scan itself will queue on submit.
        setPending({
          trackingNumber: trackingNumber.toUpperCase(),
          inputMethod,
          carrier: "UNKNOWN",
          autoCarrier: "UNKNOWN",
          preAdvice: false,
          customerName: "",
          customerPhone: "",
          shelfLocation: "",
          notes: "",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function buildInput(p: Pending): ScanInput {
    return {
      trackingNumber: p.trackingNumber,
      flow,
      carrier: p.carrier,
      carrierManual: p.carrier !== p.autoCarrier,
      inputMethod: p.inputMethod,
      customerName: p.customerName.trim() || undefined,
      customerPhone: p.customerPhone.trim() || undefined,
      shelfLocation: p.shelfLocation.trim() || undefined,
      notes: p.notes.trim() || undefined,
    };
  }

  async function confirm() {
    if (!pending) return;
    const input = buildInput(pending);
    setBusy(true);
    try {
      const res = await api<ScanResult>("/scans", { body: input });
      if (!res.ok && res.code === "VERIFICATION_REQUIRED" && "handover" in res) {
        setPending(null);
        onHandover(input, res.handover);
        return;
      }
      setResult(res);
      setPending(null);
    } catch (e) {
      if (e instanceof NetworkError) {
        setQueued(await enqueueScan(input, userId));
        setJustQueued(true);
        setPending(null);
      }
    } finally {
      setBusy(false);
    }
  }

  const isOutbound = flow === "OUTBOUND_HANDOFF";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      {queued > 0 && (
        <Card tone="warn">
          <Text style={{ color: colors.warn, fontWeight: "600" }}>
            {t.scan.queuedCount(queued)}
          </Text>
          <Button title={t.scan.syncNow} variant="secondary" onPress={() => void sync()} />
        </Card>
      )}
      {justQueued && queued > 0 && (
        <Text style={{ color: colors.warn }}>{t.scan.queued}</Text>
      )}
      {attention.length > 0 && (
        <Card tone="danger">
          <Text style={{ fontWeight: "700", color: colors.danger }}>{t.scan.attention}</Text>
          {attention.map((a, i) => (
            <Text key={i} style={{ color: colors.text }}>
              {a.trackingNumber}: {a.message}
            </Text>
          ))}
          <Button title="OK" variant="secondary" onPress={() => setAttention([])} />
        </Card>
      )}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {(Object.keys(t.flowShort) as ScanFlow[]).map((f) => (
          <Chip
            key={f}
            title={t.flowShort[f]}
            active={flow === f}
            accent={accent}
            onPress={() => setFlow(f)}
          />
        ))}
      </View>
      <Text style={{ color: colors.muted }}>{t.flow[flow]}</Text>

      {!pending && !result && (
        <>
          <Scanner
            onScan={(v) => void startScan(v, "CAMERA")}
            permissionText={t.scan.cameraPermission}
            grantText={t.scan.grantCamera}
          />
          <Text style={{ color: colors.muted, textAlign: "center" }}>{t.scan.scanPrompt}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field
                placeholder={t.scan.manualPlaceholder}
                value={manual}
                onChangeText={setManual}
                autoCorrect={false}
                onSubmitEditing={() => {
                  void startScan(manual, "MANUAL_ENTRY");
                  setManual("");
                }}
              />
            </View>
            <Button
              title={t.scan.use}
              variant="secondary"
              onPress={() => {
                void startScan(manual, "MANUAL_ENTRY");
                setManual("");
              }}
            />
          </View>
        </>
      )}

      {pending && (
        <Card>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
            {pending.trackingNumber}
          </Text>
          {pending.preAdvice && (
            <Text style={{ color: colors.ok }}>{t.scan.preAdviceMatched}</Text>
          )}
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>
            {t.scan.carrier}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {ALL_CARRIERS.map((c) => (
              <Chip
                key={c}
                title={CARRIER_LABELS[c]}
                active={pending.carrier === c}
                accent={accent}
                onPress={() => setPending({ ...pending, carrier: c })}
              />
            ))}
          </View>
          <Field
            label={isOutbound ? t.scan.senderName : t.scan.customerName}
            value={pending.customerName}
            onChangeText={(v) => setPending({ ...pending, customerName: v })}
            autoCapitalize="words"
          />
          <Field
            label={t.scan.customerPhone}
            value={pending.customerPhone}
            onChangeText={(v) => setPending({ ...pending, customerPhone: v })}
            keyboardType="phone-pad"
          />
          {!isOutbound && (
            <Field
              label={t.scan.shelfLocation}
              value={pending.shelfLocation}
              onChangeText={(v) => setPending({ ...pending, shelfLocation: v })}
              autoCapitalize="characters"
            />
          )}
          <Field
            label={t.scan.notes}
            value={pending.notes}
            onChangeText={(v) => setPending({ ...pending, notes: v })}
          />
          <Button
            title={busy ? t.scan.saving : t.scan.confirm}
            accent={accent}
            loading={busy}
            onPress={() => void confirm()}
          />
          <Button title={t.scan.discard} variant="ghost" onPress={() => setPending(null)} />
        </Card>
      )}

      {result && result.ok && (
        <Card tone="ok">
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.ok }}>
            ✓ {t.scan.registered} — {t.status[result.status]}
          </Text>
          <Text style={{ color: colors.muted }}>
            {result.carrier} · {result.trackingNumber}
          </Text>
          <Button
            title={t.scan.scanNext}
            accent={accent}
            onPress={() => {
              setResult(null);
              setJustQueued(false);
            }}
          />
          <Button
            title={t.scan.viewPackage}
            variant="ghost"
            onPress={() => onViewPackage(result.packageId)}
          />
        </Card>
      )}
      {result && !result.ok && (
        <Card tone="danger">
          <Text style={{ color: colors.danger, fontWeight: "600" }}>{result.error}</Text>
          <Button title={t.scan.scanNext} variant="secondary" onPress={() => setResult(null)} />
        </Card>
      )}
    </ScrollView>
  );
}
