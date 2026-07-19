import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { api, NetworkError } from "./src/api/client";
import type { HandoverContext, HandoverInput, ScanInput, ScanResult } from "./src/api/types";
import { AuthProvider, useAuth } from "./src/auth";
import { DEFAULT_LOCALE, getMessages } from "./src/i18n";
import { Button, Card, colors } from "./src/ui";
import { HandoverScreen } from "./src/screens/HandoverScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { PackageDetailScreen } from "./src/screens/PackageDetailScreen";
import { PackagesScreen } from "./src/screens/PackagesScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

type Tab = "scan" | "packages" | "settings";

/**
 * Verification pushed over whatever triggered it: a scan that turned out to
 * be a pickup (resubmit the scan with verification attached) or the pickup
 * button on a package (dedicated pickup endpoint).
 */
type HandoverJob =
  | { origin: "scan"; input: ScanInput; handover: HandoverContext }
  | { origin: "detail"; handover: HandoverContext };

function Root() {
  const { ready, user, store } = useAuth();
  const t = getMessages(user?.locale ?? DEFAULT_LOCALE);
  const accent = store?.brandColor ?? undefined;

  const [tab, setTab] = useState<Tab>("scan");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [job, setJob] = useState<HandoverJob | null>(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [done, setDone] = useState<{ trackingNumber: string; status: string } | null>(null);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) {
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen t={t} />
      </>
    );
  }

  const canOverride =
    user.authMethod === "PASSWORD" && (user.role === "ADMIN" || user.role === "MANAGER");

  async function confirmHandover(verification: HandoverInput) {
    if (!job) return;
    setJobBusy(true);
    setJobError(null);
    try {
      const result =
        job.origin === "scan"
          ? await api<ScanResult>("/scans", { body: { ...job.input, verification } })
          : await api<
              | { ok: true; packageId: string; status: string }
              | { ok: false; error: { code: string; message: string } }
            >(`/packages/${job.handover.packageId}/pickup`, { body: verification });
      if (result.ok) {
        const status =
          "status" in result && result.status in t.status
            ? t.status[result.status as keyof typeof t.status]
            : t.status.PICKED_UP;
        setDone({ trackingNumber: job.handover.trackingNumber, status });
        setJob(null);
      } else {
        setJobError(
          "error" in result
            ? typeof result.error === "string"
              ? result.error
              : result.error.message
            : t.common.error
        );
      }
    } catch (e) {
      setJobError(e instanceof NetworkError ? t.login.offline : t.common.error);
    } finally {
      setJobBusy(false);
    }
  }

  let body: React.ReactNode;
  if (done) {
    body = (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, justifyContent: "center" }}>
        <Card tone="ok">
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ok }}>✓ {done.status}</Text>
          <Text style={{ fontFamily: "Courier", color: colors.text }}>{done.trackingNumber}</Text>
          <Button
            title={t.scan.scanNext}
            accent={accent}
            onPress={() => {
              setDone(null);
              setTab("scan");
              setDetailId(null);
            }}
          />
        </Card>
      </View>
    );
  } else if (job) {
    body = (
      <HandoverScreen
        t={t}
        accent={accent}
        handover={job.handover}
        canOverride={canOverride}
        busy={jobBusy}
        error={jobError}
        onConfirm={(v) => void confirmHandover(v)}
        onCancel={() => {
          setJob(null);
          setJobError(null);
        }}
      />
    );
  } else if (detailId) {
    body = (
      <PackageDetailScreen
        t={t}
        accent={accent}
        packageId={detailId}
        onBack={() => setDetailId(null)}
        onPickup={(handover) => setJob({ origin: "detail", handover })}
      />
    );
  } else if (tab === "scan") {
    body = (
      <ScanScreen
        t={t}
        accent={accent}
        userId={user.id}
        onHandover={(input, handover) => setJob({ origin: "scan", input, handover })}
        onViewPackage={(id) => setDetailId(id)}
      />
    );
  } else if (tab === "packages") {
    body = <PackagesScreen t={t} accent={accent} onOpen={(id) => setDetailId(id)} />;
  } else {
    body = <SettingsScreen t={t} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={[styles.headerTitle, accent ? { color: accent } : null]}>
          {store?.name ?? t.appName}
        </Text>
      </View>
      <View style={{ flex: 1 }}>{body}</View>
      {!job && !done && (
        <View style={styles.tabBar}>
          {(["scan", "packages", "settings"] as Tab[]).map((name) => {
            const active = tab === name && !detailId;
            return (
              <Pressable
                key={name}
                style={styles.tabButton}
                onPress={() => {
                  setDetailId(null);
                  setTab(name);
                }}
              >
                <Text
                  style={{
                    fontWeight: active ? "800" : "500",
                    color: active ? (accent ?? colors.text) : colors.muted,
                    fontSize: 15,
                  }}
                >
                  {t.tabs[name]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingTop: Platform.OS === "ios" ? 58 : 34,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === "ios" ? 26 : 12,
    paddingTop: 8,
  },
  tabButton: { flex: 1, alignItems: "center", paddingVertical: 8 },
});
