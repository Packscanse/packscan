import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api, NetworkError } from "./src/api/client";
import type { HandoverContext, HandoverInput, ScanInput, ScanResult } from "./src/api/types";
import { AuthProvider, useAuth } from "./src/auth";
import { DEFAULT_LOCALE, getMessages } from "./src/i18n";
import { DoneScreen, colors, onDarkAccent } from "./src/ui";
import { HandoverScreen } from "./src/screens/HandoverScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { PackageDetailScreen } from "./src/screens/PackageDetailScreen";
import { PackagesScreen } from "./src/screens/PackagesScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

type Tab = "scan" | "packages" | "settings";

const TAB_ICONS: Record<Tab, React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  scan: "line-scan",
  packages: "view-agenda",
  settings: "account",
};

/**
 * Verification pushed over whatever triggered it: a scan that turned out to
 * be a pickup (resubmit the scan with verification attached) or the pickup
 * button on a package (dedicated pickup endpoint).
 */
type HandoverJob =
  | { origin: "scan"; input: ScanInput; handover: HandoverContext; companions: HandoverContext[] }
  | { origin: "detail"; handover: HandoverContext; companions: HandoverContext[] };

function Root() {
  const { ready, user, store } = useAuth();
  const t = getMessages(user?.locale ?? DEFAULT_LOCALE);
  const accent = store?.brandColor ?? undefined;

  const [tab, setTab] = useState<Tab>("scan");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [job, setJob] = useState<HandoverJob | null>(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; meta: string[] } | null>(null);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!user) {
    return (
      <>
        <StatusBar style="light" />
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
        const shelfLine = job.handover.shelfLocation
          ? t.done.shelfFreed(job.handover.shelfLocation)
          : t.done.carrierNoted;
        const alsoLine =
          job.companions.length > 0
            ? [t.done.alsoOnShelf(job.companions.map((c) => c.shelfLocation ?? "—").join(", "))]
            : [];
        setDone({
          title: t.done.handedOver,
          meta: [job.handover.trackingNumber, shelfLine, ...alsoLine],
        });
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
      <DoneScreen
        accent={accent}
        title={done.title}
        meta={done.meta}
        nextLabel={t.done.nextCustomer}
        onNext={() => {
          setDone(null);
          setTab("scan");
          setDetailId(null);
        }}
      />
    );
  } else if (job) {
    body = (
      <HandoverScreen
        t={t}
        accent={accent}
        handover={job.handover}
        companions={job.companions}
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
        onPickup={(handover, companions) => setJob({ origin: "detail", handover, companions })}
      />
    );
  } else if (tab === "scan") {
    body = (
      <ScanScreen
        t={t}
        accent={accent}
        userId={user.id}
        onHandover={(input, handover, companions) =>
          setJob({ origin: "scan", input, handover, companions })
        }
        onViewPackage={(id) => setDetailId(id)}
      />
    );
  } else if (tab === "packages") {
    body = <PackagesScreen t={t} accent={accent} onOpen={(id) => setDetailId(id)} />;
  } else {
    body = <SettingsScreen t={t} />;
  }

  const firstName = user.name.split(" ")[0];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.wordmark}>{t.appName}</Text>
        <Text style={styles.headerMeta} numberOfLines={1}>
          {store ? `${store.name} · ${firstName}` : firstName}
        </Text>
      </View>
      <View style={{ flex: 1 }}>{body}</View>
      {!job && !done && (
        <View style={styles.tabBar}>
          {(["scan", "packages", "settings"] as Tab[]).map((name) => {
            const active = tab === name && !detailId;
            const tint = active ? onDarkAccent(accent ?? colors.text) : colors.muted;
            return (
              <Pressable
                key={name}
                style={styles.tabButton}
                onPress={() => {
                  setDetailId(null);
                  setTab(name);
                }}
              >
                <MaterialCommunityIcons name={TAB_ICONS[name]} size={22} color={tint} />
                <Text
                  style={{ fontWeight: active ? "700" : "500", color: tint, fontSize: 12 }}
                >
                  {name === "settings" ? firstName : t.tabs[name]}
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
    paddingHorizontal: 20,
    backgroundColor: colors.bg,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  wordmark: { fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  headerMeta: { fontSize: 12, color: colors.muted, flexShrink: 1 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.sheet,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === "ios" ? 26 : 12,
    paddingTop: 8,
  },
  tabButton: { flex: 1, alignItems: "center", paddingVertical: 6, gap: 3 },
});
