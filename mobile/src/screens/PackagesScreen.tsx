import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api, NetworkError } from "../api/client";
import type { PackageListResponse, PackageSummary } from "../api/types";
import { CARRIER_LABELS } from "../carriers";
import type { AppMessages } from "../i18n";
import { Chip, Field, ShelfChip, StatusBadge, colors } from "../ui";

type Filter = "all" | "awaiting" | "overdue";

function ageDays(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

/**
 * "The shelf" — rows lead with the shelf block, overdue parcels turn the
 * row into an instruction ("day 9 of 7 — return to the carrier").
 */
export function PackagesScreen({
  t,
  accent,
  onOpen,
}: {
  t: AppMessages;
  accent?: string;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("awaiting");
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (filter === "awaiting") params.set("status", "AWAITING_PICKUP");
      if (filter === "overdue") params.set("overdue", "1");
      const res = await api<PackageListResponse>(`/packages?${params.toString()}`);
      if (res.ok) {
        setPackages(res.packages);
        setTotal(res.total);
        setDeadlineDays(res.deadlineDays);
        setOffline(false);
      }
    } catch (e) {
      if (e instanceof NetworkError) setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [q, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, paddingBottom: 0, gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 }}>
          {t.tabs.packages}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14 }}>{t.packages.countLabel(total)}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["awaiting", "overdue", "all"] as Filter[]).map((f) => (
          <Chip
            key={f}
            title={t.packages[f]}
            active={filter === f}
            accent={accent}
            danger={f === "overdue"}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>
      <Field
        placeholder={t.packages.search}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => void load()}
        returnKeyType="search"
      />
      {offline && <Text style={{ color: colors.warn }}>{t.login.offline}</Text>}
      <FlatList
        data={packages}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void load()}
            tintColor={colors.muted}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          loading ? null : (
            <Text style={{ color: colors.muted, textAlign: "center", marginTop: 24 }}>
              {t.packages.empty}
            </Text>
          )
        }
        renderItem={({ item }) => {
          const days = ageDays(item.createdAt);
          const overdue = item.status === "AWAITING_PICKUP" && days > deadlineDays;
          const title =
            item.customerName?.trim() ||
            `${CARRIER_LABELS[item.carrier] ?? item.carrier} · …${item.trackingNumber.slice(-6)}`;
          return (
            <Pressable
              onPress={() => onOpen(item.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                backgroundColor: overdue ? colors.dangerBg : colors.card,
                borderColor: overdue ? colors.dangerBorder : colors.border,
              }}
            >
              <ShelfChip code={item.shelfLocation} accent={accent} danger={overdue} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}
                  numberOfLines={1}
                >
                  {title}
                  {overdue ? ` · ${t.packages.dayOf(days, deadlineDays)}` : ""}
                </Text>
                {overdue ? (
                  <Text style={{ color: colors.danger, fontSize: 12 }} numberOfLines={1}>
                    {t.packages.returnTo(CARRIER_LABELS[item.carrier] ?? item.carrier)}
                  </Text>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                      {CARRIER_LABELS[item.carrier] ?? item.carrier}
                      {item.status === "AWAITING_PICKUP"
                        ? ` · ${t.packages.dayN(days)}`
                        : ""}
                    </Text>
                    {item.status !== "AWAITING_PICKUP" && (
                      <StatusBadge status={item.status} label={t.status[item.status]} />
                    )}
                  </View>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.faint} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}
