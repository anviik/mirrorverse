import React, { useCallback } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useStore } from "../lib/store";
import { colors } from "../lib/theme";

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { decisions, loadingDecisions, refreshDecisions, results } = useStore();

  useFocusEffect(
    useCallback(() => {
      refreshDecisions();
    }, [])
  );

  const simulated = decisions.filter((d) => d.status === "simulated");

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Mirrorverse</Text>
      <Text style={styles.sub}>Simulate your decisions before you live them</Text>

      {simulated.length > 0 && (
        <View style={styles.insightBanner}>
          <Text style={styles.insightText}>
            🧠 {simulated.length} decision{simulated.length > 1 ? "s" : ""} simulated —
            tap one to review the panel's verdict
          </Text>
        </View>
      )}

      <FlatList
        data={decisions}
        keyExtractor={(d) => d.decision_id}
        refreshControl={
          <RefreshControl
            refreshing={loadingDecisions}
            onRefresh={refreshDecisions}
            tintColor={colors.purple}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No decisions yet.{"\n"}Tap + to simulate your first one.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              item.status === "simulated"
                ? navigation.navigate("Results", { decisionId: item.decision_id })
                : navigation.navigate("Graph", { decisionId: item.decision_id })
            }
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardTags}>{(item.tags || []).join(" · ")}</Text>
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    item.status === "simulated" ? colors.green + "22" : colors.yellow + "22",
                },
              ]}
            >
              <Text
                style={{
                  color: item.status === "simulated" ? colors.green : colors.yellow,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {item.status}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <Pressable style={styles.fab} onPress={() => navigation.navigate("Create")}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 64 },
  h1: { color: colors.text, fontSize: 32, fontWeight: "800" },
  sub: { color: colors.textDim, marginTop: 4, marginBottom: 16 },
  insightBanner: {
    backgroundColor: colors.purple + "22",
    borderColor: colors.purple,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  insightText: { color: colors.text, fontSize: 13 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 80, lineHeight: 22 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  cardTags: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 10 },
  fab: {
    position: "absolute",
    right: 24,
    bottom: 32,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.purple,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: { color: "#fff", fontSize: 30, marginTop: -2 },
});
