import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useAuth } from "../auth";
import { DEFAULT_SERVER_URL, getServerUrl, setServerUrl } from "../config";
import { NetworkError } from "../api/client";
import type { AppMessages } from "../i18n";
import { Button, Chip, Field, colors } from "../ui";

export function LoginScreen({ t }: { t: AppMessages }) {
  const { signIn } = useAuth();
  const [server, setServer] = useState(DEFAULT_SERVER_URL);
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<"pin" | "password">("pin");
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
      const code = await signIn({
        email: email.trim(),
        ...(mode === "pin" ? { pin: secret.trim() } : { password: secret }),
      });
      if (code) setError(t.login.invalid);
    } catch (e) {
      setError(e instanceof NetworkError ? t.login.offline : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingTop: 80 }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: colors.text }}>{t.appName}</Text>
        <Text style={{ color: colors.muted }}>{t.login.title}</Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip title={t.login.usePin} active={mode === "pin"} onPress={() => setMode("pin")} />
          <Chip
            title={t.login.usePassword}
            active={mode === "password"}
            onPress={() => setMode("password")}
          />
        </View>

        <Field
          label={t.login.email}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@store.example"
        />
        <Field
          label={mode === "pin" ? t.login.pin : t.login.password}
          value={secret}
          onChangeText={setSecret}
          secureTextEntry
          keyboardType={mode === "pin" ? "number-pad" : "default"}
          maxLength={mode === "pin" ? 6 : undefined}
          placeholder="••••••"
        />
        <Field
          label={t.login.serverUrl}
          value={server}
          onChangeText={setServer}
          keyboardType="url"
          placeholder={DEFAULT_SERVER_URL}
        />
        <Text style={{ color: colors.muted, fontSize: 12 }}>{t.login.serverHint}</Text>

        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

        <Button
          title={busy ? t.login.signingIn : t.login.signIn}
          onPress={() => void submit()}
          loading={busy}
          disabled={!email.trim() || !secret}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
