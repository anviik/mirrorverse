import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { colors } from "../lib/theme";

interface Insight {
  icon: string;
  kind: string;
  text: string;
  color: string;
}

export default function InsightsScreen() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { decisions, fetchResult } = useStore();

  const load = useCallback(async () => {
    setRefreshing(true);
    const items: Insight[] = [];
    try {
      // Behavioral patterns and preferences from Mem0
      const mem = await api.getMemories();
      (mem.memories?.results ?? []).slice(0, 8).forEach((m) =>
        items.push({
          icon: "🧠",
          kind: "Pattern",
          text: m.memory,
          color: colors.purple,
        })
      );
    } catch {}
    // Warnings + contradictions from simulated decisions
    for (const d of decisions.filter((x) => x.status === "simulated").slice(0, 5)) {
      const r = await fetchResult(d.decision_id);
      if (!r) continue;
      r.key_risks.slice(0, 2).forEach((risk) =>
        items.push({ icon: "⚠️", kind: `Risk · ${d.title}`, text: risk, color: colors.red })
      );
      r.key_disagreements.slice(0, 1).forEach((dis) =>
        items.push({
          icon: "⚔️",
          kind: `Contradiction · ${d.title}`,
          text: dis,
          color: colors.yellow,
        })
      );
    }
    setInsights(items);
    setRefreshing(false);
  }, [decisions]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 20, paddingTop: 64 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.purple} />
      }
    >
      <Text style={styles.h1}>Insights</Text>
      <Text style={styles.sub}>What the AI has noticed across your decisions</Text>

      {insights.length === 0 && !refreshing && (
        <Text style={styles.empty}>
          No insights yet. Create and simulate decisions to build your profile.
        </Text>
      )}

      {insights.map((ins, i) => (
        <View key={i} style={[styles.card, { borderLeftColor: ins.color }]}>
          <Text style={styles.kind}>
            {ins.icon} {ins.kind}
          </Text>
          <Text style={styles.text}>{ins.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 32, fontWeight: "800" },
  sub: { color: colors.textDim, marginTop: 4, marginBottom: 20 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 60, lineHeight: 22 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  kind: { color: colors.text, fontWeight: "700", fontSize: 12, marginBottom: 6 },
  text: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
});
