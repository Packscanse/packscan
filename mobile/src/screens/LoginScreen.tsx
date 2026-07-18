import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { useAuth } from "../auth";
import { DEFAULT_SERVER_URL, getServerUrl, setServerUrl } from "../config";
import { NetworkError } from "../api/client";
import type { AppMessages } from "../i18n";
import { Button, Field, colors } from "../ui";

/**
 * Digits-only sign-in: 4-digit user number + 6-digit PIN. There is no
 * password path in the app at all — administration lives in the web
 * backend, and the server refuses password logins on this endpoint too.
 */
export function LoginScreen({ t }: { t: AppMessages }) {
  const { signIn } = useAuth();
  const [server, setServer] = useState(DEFAULT_SERVER_URL);
  const [userNumber, setUserNumber] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getServerUrl().then(setServer);
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await setServerUrl(server);
      const code = await signIn({ userNumber: userNumber.trim(), pin: pin.trim() });
      if (code === "PASSWORD_LOGIN_WEB_ONLY") setError(t.login.webOnly);
      else if (code) setError(t.login.invalid);
    } catch (e) {
      setError(e instanceof NetworkError ? t.login.offline : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  const digits = (value: string) => value.replace(/[^0-9]/g, "");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingTop: 80 }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: colors.text }}>{t.appName}</Text>
        <Text style={{ color: colors.muted }}>{t.login.title}</Text>

        <Field
          label={t.login.userNumber}
          value={userNumber}
          onChangeText={(v) => setUserNumber(digits(v))}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="1234"
          style={{ fontSize: 24, letterSpacing: 6 }}
        />
        <Field
          label={t.login.pin}
          value={pin}
          onChangeText={(v) => setPin(digits(v))}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          placeholder="••••••"
          style={{ fontSize: 24, letterSpacing: 6 }}
        />

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

        <Button
          title={busy ? t.login.signingIn : t.login.signIn}
          onPress={() => void submit()}
          loading={busy}
          disabled={userNumber.length !== 4 || pin.length !== 6}
        />

        <Text style={{ color: colors.muted, fontSize: 12 }}>{t.login.adminHint}</Text>

        <Field
          label={t.login.serverUrl}
          value={server}
          onChangeText={setServer}
          keyboardType="url"
          placeholder={DEFAULT_SERVER_URL}
        />
        <Text style={{ color: colors.muted, fontSize: 12 }}>{t.login.serverHint}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
