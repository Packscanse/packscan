import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { api, NetworkError } from "../api/client";
import type { PackageListResponse, PackageSummary } from "../api/types";
import { CARRIER_LABELS } from "../carriers";
import type { AppMessages } from "../i18n";
import { Card, Chip, Field, StatusBadge, colors } from "../ui";

type Filter = "all" | "awaiting" | "overdue";

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
  const [filter, setFilter] = useState<Filter>("all");
  const [packages, setPackages] = useState<PackageSummary[]>([]);
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
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 }}>
      <Field
        placeholder={t.packages.search}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => void load()}
        returnKeyType="search"
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["all", "awaiting", "overdue"] as Filter[]).map((f) => (
          <Chip
            key={f}
            title={t.packages[f === "all" ? "all" : f === "awaiting" ? "awaiting" : "overdue"]}
            active={filter === f}
            accent={accent}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>
      {offline && <Text style={{ color: colors.warn }}>{t.login.offline}</Text>}
      <FlatList
        data={packages}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          loading ? null : (
            <Text style={{ color: colors.muted, textAlign: "center", marginTop: 24 }}>
              {t.packages.empty}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item.id)}>
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Courier",
                    fontWeight: "700",
                    color: colors.text,
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {item.trackingNumber}
                </Text>
                <StatusBadge status={item.status} label={t.status[item.status]} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: colors.muted, flexShrink: 1 }} numberOfLines={1}>
                  {CARRIER_LABELS[item.carrier] ?? item.carrier}
                  {item.customerName ? ` · ${item.customerName}` : ""}
                </Text>
                {item.shelfLocation ? (
                  <Text style={{ fontWeight: "800", color: colors.text }}>
                    {item.shelfLocation}
                  </Text>
                ) : null}
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}
