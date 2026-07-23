import React, { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import { useAuth } from "../auth";
import { getServerUrl } from "../config";
import type { AppMessages } from "../i18n";
import { readQueue } from "../offline";
import { Button, Card, Row, colors } from "../ui";

export function SettingsScreen({ t }: { t: AppMessages }) {
  const { user, store, signOut } = useAuth();
  const [server, setServer] = useState("");
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    void getServerUrl().then(setServer);
    void readQueue().then((q) => setQueued(q.length));
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 14 }}
    >
      <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 }}>
        {t.settings.title}
      </Text>
      <Card>
        <Row label={t.settings.signedInAs} value={`${user?.name ?? ""} (${user?.role ?? ""})`} />
        <Row label={t.settings.store} value={store ? `${store.name} (${store.code})` : "—"} />
        <Row label={t.settings.server} value={server} />
        <Row
          label={t.settings.queue}
          value={queued > 0 ? t.scan.queuedCount(queued) : t.settings.queueEmpty}
        />
      </Card>
      <Button title={t.settings.signOut} variant="danger" onPress={() => void signOut()} />
      <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
        {t.settings.version}
      </Text>
    </ScrollView>
  );
}
