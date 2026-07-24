import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api, NetworkError, UnauthenticatedError } from "../api/client";
import type {
  CarrierCode,
  HandoverContext,
  ScanContext,
  ScanFlow,
  ScanInput,
  ScanResult,
  ShelfSuggestion,
} from "../api/types";
import { ALL_CARRIERS, CARRIER_LABELS } from "../carriers";
import type { AppMessages } from "../i18n";
import { enqueueScan, flushQueue, readQueue, type SyncAttention } from "../offline";
import {
  Button,
  Card,
  Chip,
  DoneScreen,
  Field,
  Keypad,
  SectionLabel,
  ShelfPoster,
  Tile,
  accentForeground,
  colors,
  DEFAULT_ACCENT,
} from "../ui";
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
  shelf: ShelfSuggestion | null;
  notes: string;
};

/**
 * The counter's home screen: viewfinder first, one flow pill row, and for
 * intake a "put it on" shelf suggestion instead of a form. A pickup scan of
 * a known parcel skips this screen entirely and goes straight to handover.
 */
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
  onHandover: (input: ScanInput, handover: HandoverContext, companions: HandoverContext[]) => void;
  onViewPackage: (id: string) => void;
}) {
  const [flow, setFlow] = useState<ScanFlow>("INBOUND_PICKUP");
  const [manual, setManual] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [customShelf, setCustomShelf] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ title: string; meta: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);
  const [justQueued, setJustQueued] = useState(false);
  const [attention, setAttention] = useState<SyncAttention[]>([]);
  // The lookup that failed for a reason that is NOT "offline" — shown as a
  // card (viewfinder state) or an inline line (pending form), never silent.
  const [scanError, setScanError] = useState<{
    trackingNumber: string;
    inputMethod: ScanInput["inputMethod"];
    message: string;
  } | null>(null);
  // Which number is being looked up right now — feeds the busy indicator.
  const [lookupTracking, setLookupTracking] = useState<string | null>(null);
  // One green blink over the viewfinder per accepted camera read: the
  // "I heard you" that must not wait for the server.
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );

  function blink() {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(true);
    flashTimer.current = setTimeout(() => setFlash(false), 250);
  }

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

  function resetEntry() {
    setPending(null);
    setCustomShelf(false);
    setShowContact(false);
    setScanError(null);
  }

  async function startScan(raw: string, inputMethod: ScanInput["inputMethod"]) {
    const trackingNumber = raw.trim();
    if (trackingNumber.length < 6 || pending || busy) return;
    setResult(null);
    setScanError(null);
    setLookupTracking(trackingNumber);
    setBusy(true);
    try {
      const ctx = await api<ScanContext>(
        `/scan-context?tracking=${encodeURIComponent(trackingNumber)}`
      );
      // A parcel already on the shelf + pickup mode = the match screen, now.
      if (flow === "INBOUND_PICKUP" && ctx.handover) {
        onHandover(
          {
            trackingNumber: ctx.trackingNumber,
            flow,
            carrier: ctx.handover.carrier,
            carrierManual: false,
            inputMethod,
          },
          ctx.handover,
          ctx.companions
        );
        return;
      }
      const auto = ctx.preAdvice?.carrier ?? ctx.candidates[0]?.carrier ?? "UNKNOWN";
      setPending({
        trackingNumber: ctx.trackingNumber,
        inputMethod,
        carrier: auto,
        autoCarrier: auto,
        preAdvice: ctx.preAdvice !== null,
        customerName: ctx.preAdvice?.customerName ?? "",
        customerPhone: ctx.preAdvice?.customerPhone ?? "",
        shelfLocation: ctx.shelf.suggested ?? "",
        shelf: ctx.shelf,
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
          shelf: null,
          notes: "",
        });
      } else if (!(e instanceof UnauthenticatedError)) {
        // Reachable-but-broken backend (bad status body, non-JSON 500, …):
        // never swallow it — show a card with the number and a retry.
        setScanError({
          trackingNumber,
          inputMethod,
          message: t.scan.lookupFailed(trackingNumber),
        });
      }
    } finally {
      setLookupTracking(null);
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
    setScanError(null);
    setBusy(true);
    try {
      const res = await api<ScanResult>("/scans", { body: input });
      if (!res.ok && res.code === "VERIFICATION_REQUIRED" && "handover" in res) {
        resetEntry();
        onHandover(input, res.handover, []);
        return;
      }
      if (res.ok && flow !== "OUTBOUND_HANDOFF") {
        const shelf = input.shelfLocation;
        setDoneInfo({
          title: shelf ? t.scan.doneOnShelf(shelf) : t.scan.registered,
          meta: [
            `${CARRIER_LABELS[pending.carrier] ?? pending.carrier} · ${res.trackingNumber}`,
            ...(input.customerPhone ? [t.scan.smsSent(input.customerPhone)] : []),
          ],
        });
      } else {
        setResult(res);
      }
      resetEntry();
    } catch (e) {
      if (e instanceof NetworkError) {
        setQueued(await enqueueScan(input, userId));
        setJustQueued(true);
        resetEntry();
      } else if (!(e instanceof UnauthenticatedError)) {
        // Keep the form so nothing is lost; say why the save failed.
        setScanError({
          trackingNumber: input.trackingNumber,
          inputMethod: input.inputMethod,
          message: t.scan.saveFailed(input.trackingNumber),
        });
      }
    } finally {
      setBusy(false);
    }
  }

  const isOutbound = flow === "OUTBOUND_HANDOFF";
  const isIntake = !isOutbound;
  const brand = accent ?? DEFAULT_ACCENT;

  if (doneInfo) {
    return (
      <DoneScreen
        accent={accent}
        title={doneInfo.title}
        meta={doneInfo.meta}
        nextLabel={t.done.keepScanning}
        onNext={() => setDoneInfo(null)}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, gap: 14 }}
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
      {justQueued && queued > 0 && <Text style={{ color: colors.warn }}>{t.scan.queued}</Text>}
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

      {!pending && !result && (
        <>
          {scanError && (
            <Card tone="danger">
              <Text style={{ color: colors.danger, fontWeight: "700" }}>{scanError.message}</Text>
              <Text style={{ color: colors.text, fontFamily: "Courier", fontSize: 13 }}>
                {scanError.trackingNumber}
              </Text>
              <Button
                title={t.scan.tryAgain}
                variant="secondary"
                onPress={() => {
                  const retry = scanError;
                  setScanError(null);
                  void startScan(retry.trackingNumber, retry.inputMethod);
                }}
              />
              <Button title="OK" variant="ghost" onPress={() => setScanError(null)} />
            </Card>
          )}
          <View>
            <Scanner
              height={300}
              onScan={(v) => {
                blink();
                void startScan(v, "CAMERA");
              }}
              permissionText={t.scan.cameraPermission}
              grantText={t.scan.grantCamera}
            />
            {flash && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 24,
                  borderWidth: 3,
                  borderColor: colors.ok,
                  backgroundColor: "rgba(74, 222, 128, 0.16)",
                }}
              />
            )}
          </View>
          {busy && lookupTracking ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ActivityIndicator color={colors.muted} />
              <Text style={{ color: colors.muted, textAlign: "center", fontSize: 14 }}>
                {t.scan.lookingUp(lookupTracking)}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 2 }}>
              <Text
                style={{ color: colors.text, textAlign: "center", fontSize: 19, fontWeight: "600" }}
              >
                {t.scan.pointPrompt}
              </Text>
              <Text style={{ color: colors.muted, textAlign: "center", fontSize: 13 }}>
                {t.flow[flow]}
              </Text>
            </View>
          )}
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

          {/* Mode switch pinned under the viewfinder: one thumb, three flows. */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: colors.sheet,
              borderRadius: 999,
              padding: 4,
              gap: 4,
            }}
          >
            {(Object.keys(t.flowShort) as ScanFlow[]).map((f) => {
              const active = flow === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFlow(f)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? brand : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: active ? accentForeground(brand) : colors.muted,
                    }}
                  >
                    {t.flowShort[f]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {pending && (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Pressable onPress={resetEntry} hitSlop={8}>
              <Text style={{ color: colors.muted, fontSize: 15 }}>
                ‹ {t.flowShort[flow]}
              </Text>
            </Pressable>
            <Text style={{ color: colors.muted, fontFamily: "Courier", fontSize: 13 }}>
              {pending.trackingNumber}
            </Text>
          </View>

          {pending.preAdvice && (
            <Card tone="ok">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <MaterialCommunityIcons name="check-decagram" size={22} color={colors.ok} />
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>
                    {t.scan.announced(pending.customerName || "?")}
                  </Text>
                  {pending.customerPhone ? (
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {CARRIER_LABELS[pending.carrier] ?? pending.carrier} · {t.scan.smsOnConfirm}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          )}

          {isIntake && pending.shelf && pending.shelf.alternatives.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionLabel>{t.scan.putItOn}</SectionLabel>
              <ShelfPoster
                code={pending.shelfLocation || null}
                eyebrow={t.handover.shelfEyebrow}
                meta={
                  pending.shelfLocation === pending.shelf.suggested
                    ? pending.shelf.reason === "customer"
                      ? t.scan.suggestedCustomer
                      : t.scan.suggestedSpace
                    : null
                }
                accent={accent}
                compact
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                {pending.shelf.alternatives.map((shelf) => {
                  const active = !customShelf && pending.shelfLocation === shelf;
                  return (
                    <Pressable
                      key={shelf}
                      onPress={() => {
                        setCustomShelf(false);
                        setPending({ ...pending, shelfLocation: shelf });
                      }}
                      style={{
                        flex: 1,
                        minHeight: 52,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: active ? `${brand === DEFAULT_ACCENT ? "#ffffff" : brand}40` : colors.card,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? brand : colors.border,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
                        {shelf}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => {
                    setCustomShelf(true);
                    setPending({ ...pending, shelfLocation: "" });
                  }}
                  style={{
                    flex: 1,
                    minHeight: 52,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: customShelf ? brand : colors.border,
                    borderStyle: "dashed",
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "600" }}>
                    {t.scan.ownShelf}
                  </Text>
                </Pressable>
              </View>
              {customShelf && (
                <Field
                  value={pending.shelfLocation}
                  onChangeText={(v) => setPending({ ...pending, shelfLocation: v })}
                  autoCapitalize="characters"
                  placeholder={t.scan.shelfLocation}
                  autoFocus
                />
              )}
            </View>
          )}
          {isIntake && (!pending.shelf || pending.shelf.alternatives.length === 0) && (
            <Field
              label={t.scan.shelfLocation}
              value={pending.shelfLocation}
              onChangeText={(v) => setPending({ ...pending, shelfLocation: v })}
              autoCapitalize="characters"
            />
          )}

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

          {isOutbound || showContact || (!pending.preAdvice && !isIntake) ? null : pending.preAdvice ? (
            <Pressable onPress={() => setShowContact(true)}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {[pending.customerName, pending.customerPhone].filter(Boolean).join(" · ")} ·{" "}
                <Text style={{ color: colors.secondaryText, fontWeight: "600" }}>
                  {t.scan.edit}
                </Text>
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setShowContact(true)}>
              <Text style={{ color: colors.secondaryText, fontWeight: "600", fontSize: 14 }}>
                + {t.scan.contactOptional}
              </Text>
            </Pressable>
          )}

          {(isOutbound || showContact) && (
            <View style={{ gap: 10 }}>
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
              <Field
                label={t.scan.notes}
                value={pending.notes}
                onChangeText={(v) => setPending({ ...pending, notes: v })}
              />
            </View>
          )}

          {scanError && (
            <Text style={{ color: colors.danger, fontWeight: "600" }}>{scanError.message}</Text>
          )}
          <Button
            title={
              busy
                ? t.scan.saving
                : isIntake && pending.shelfLocation.trim()
                  ? t.scan.onShelfNext(pending.shelfLocation.trim())
                  : t.scan.confirm
            }
            accent={accent}
            size="xl"
            loading={busy}
            onPress={() => void confirm()}
          />
          <Button title={t.scan.discard} variant="ghost" onPress={resetEntry} />
        </View>
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
