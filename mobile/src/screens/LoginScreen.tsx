import React, { useEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "../auth";
import { DEFAULT_SERVER_URL, getServerUrl, setServerUrl } from "../config";
import { NetworkError } from "../api/client";
import type { AppMessages } from "../i18n";
import { Field, Keypad, colors, DEFAULT_ACCENT } from "../ui";

const USER_LEN = 4;
const PIN_LEN = 6;

function greeting(t: AppMessages): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return t.login.greetingMorning;
  if (hour >= 10 && hour < 17) return t.login.greetingAfternoon;
  return t.login.greetingEvening;
}

/**
 * Shift-start sign-in with zero typing: the keypad fills the 4-digit user
 * number, then the 6 PIN dots — the 6th digit signs in by itself. A wrong
 * PIN shakes the dots, clears them and stays. There is no password path in
 * the app at all — administration lives in the web backend, and the server
 * refuses password logins on this endpoint too.
 */
export function LoginScreen({ t }: { t: AppMessages }) {
  const { signIn } = useAuth();
  const [server, setServer] = useState(DEFAULT_SERVER_URL);
  const [showServer, setShowServer] = useState(false);
  const [userNumber, setUserNumber] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void getServerUrl().then(setServer);
  }, []);

  function shake() {
    shakeX.setValue(0);
    Animated.sequence(
      [-8, 8, -5, 5, 0].map((to) =>
        Animated.timing(shakeX, { toValue: to, duration: 70, useNativeDriver: true })
      )
    ).start();
  }

  async function submit(pinValue: string) {
    setBusy(true);
    setError(null);
    try {
      await setServerUrl(server);
      const code = await signIn({ userNumber, pin: pinValue });
      if (code === "PASSWORD_LOGIN_WEB_ONLY") setError(t.login.webOnly);
      else if (code) {
        setError(t.login.invalid);
        setPin("");
        shake();
      }
    } catch (e) {
      setError(e instanceof NetworkError ? t.login.offline : t.common.error);
      setPin("");
      shake();
    } finally {
      setBusy(false);
    }
  }

  function onDigit(digit: string) {
    if (busy) return;
    if (userNumber.length < USER_LEN) {
      setUserNumber(userNumber + digit);
      return;
    }
    if (pin.length < PIN_LEN) {
      const next = pin + digit;
      setPin(next);
      // The 6th digit signs in — no submit button on the happy path.
      if (next.length === PIN_LEN) void submit(next);
    }
  }

  function onDelete() {
    if (busy) return;
    if (pin.length > 0) setPin(pin.slice(0, -1));
    else setUserNumber(userNumber.slice(0, -1));
  }

  const userActive = userNumber.length < USER_LEN;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 18, paddingTop: 76, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>{t.appName}</Text>
          <Text
            style={{ color: colors.text, fontSize: 32, fontWeight: "800", letterSpacing: -0.8 }}
          >
            {greeting(t)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 15 }}>{t.login.title}</Text>
        </View>

        {/* User number: four visible digit boxes, filled left to right. */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>
            {t.login.userNumber}
          </Text>
          <Pressable
            onPress={() => {
              setUserNumber("");
              setPin("");
            }}
            style={{ flexDirection: "row", gap: 8 }}
          >
            {Array.from({ length: USER_LEN }, (_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: 14,
                  backgroundColor: colors.card,
                  borderWidth: 1.5,
                  borderColor:
                    userActive && i === userNumber.length ? DEFAULT_ACCENT : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700" }}>
                  {userNumber[i] ?? ""}
                </Text>
              </View>
            ))}
          </Pressable>
        </View>

        {/* PIN dots fill as digits arrive; wrong PIN shakes and clears. */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>
            {t.login.pin}
          </Text>
          <Animated.View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 14,
              paddingVertical: 8,
              transform: [{ translateX: shakeX }],
            }}
          >
            {Array.from({ length: PIN_LEN }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: i < pin.length ? DEFAULT_ACCENT : colors.inner,
                }}
              />
            ))}
          </Animated.View>
        </View>

        {error ? (
          <Text style={{ color: colors.danger, textAlign: "center" }}>{error}</Text>
        ) : null}

        <Keypad onDigit={onDigit} onDelete={onDelete} />

        <Text style={{ color: colors.faint, fontSize: 12, textAlign: "center" }}>
          {t.login.adminHint}
        </Text>

        <View style={{ marginTop: "auto", gap: 8 }}>
          {showServer ? (
            <>
              <Field
                label={t.login.serverUrl}
                value={server}
                onChangeText={setServer}
                keyboardType="url"
                placeholder={DEFAULT_SERVER_URL}
              />
              <Text style={{ color: colors.faint, fontSize: 12 }}>{t.login.serverHint}</Text>
            </>
          ) : (
            <Pressable onPress={() => setShowServer(true)} hitSlop={8}>
              <Text style={{ color: colors.faint, fontSize: 12, textAlign: "center" }}>
                {server.replace(/^https?:\/\//, "")} · {t.login.changeServer}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
