import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useNavigation, useRoute } from "@react-navigation/native";
import { api, DecisionGraph } from "../lib/api";
import { colors, nodeColors } from "../lib/theme";

type Mode = "decision" | "mirofish";

export default function GraphScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const decisionId: string = route.params.decisionId;

  const [graph, setGraph] = useState<DecisionGraph | null>(null);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("decision");
  const [mirofish, setMirofish] = useState<any>(null);
  const [mirofishStatus, setMirofishStatus] = useState<string>("loading");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.getDecision(decisionId).then((d) => {
      setGraph(d.graph);
      setTitle(d.title);
    });
    api
      .getMirofishGraph(decisionId)
      .then((r) => {
        setMirofishStatus(r.status);
        if (r.status === "ready") setMirofish(r.entities);
      })
      .catch(() => setMirofishStatus("failed"));
  }, [decisionId]);

  const runSimulation = async () => {
    setStarting(true);
    try {
      await api.runSimulation(decisionId);
      navigation.navigate("Results", { decisionId });
    } finally {
      setStarting(false);
    }
  };

  const html = useMemo(() => {
    if (mode === "decision" && graph) return flowHtml(decisionToFlow(graph));
    if (mode === "mirofish" && mirofish) return flowHtml(mirofishToFlow(mirofish));
    return null;
  }, [mode, graph, mirofish]);

  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>

      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggle, mode === "decision" && styles.toggleActive]}
          onPress={() => setMode("decision")}
        >
          <Text style={styles.toggleText}>Decision Graph</Text>
        </Pressable>
        <Pressable
          style={[styles.toggle, mode === "mirofish" && styles.toggleActive]}
          onPress={() => setMode("mirofish")}
        >
          <Text style={styles.toggleText}>
            Deep Graph {mirofishStatus !== "ready" ? `(${mirofishStatus})` : ""}
          </Text>
        </Pressable>
      </View>

      <View style={styles.webviewBox}>
        {html ? (
          <WebView
            source={{ html }}
            style={{ backgroundColor: colors.bg }}
            originWhitelist={["*"]}
            javaScriptEnabled
          />
        ) : (
          <View style={styles.center}>
            {mode === "mirofish" && mirofishStatus !== "ready" ? (
              <Text style={styles.dim}>
                {mirofishStatus === "building" || mirofishStatus === "starting"
                  ? "MiroFish is building the deep knowledge graph…"
                  : "Deep graph not available yet — run a simulation first."}
              </Text>
            ) : (
              <ActivityIndicator color={colors.purple} />
            )}
          </View>
        )}
      </View>

      <View style={styles.legend}>
        {Object.entries(nodeColors).map(([k, c]) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: c }]} />
            <Text style={styles.legendText}>{k}</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.runBtn} onPress={runSimulation} disabled={starting}>
        {starting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.runText}>⚡ Run Simulation</Text>
        )}
      </Pressable>
    </View>
  );
}

function decisionToFlow(graph: DecisionGraph) {
  const byType: Record<string, number> = {};
  const cols: Record<string, number> = {
    Preference: 0, Evidence: 1, Assumption: 2, Decision: 3, Outcome: 4,
  };
  const nodes = graph.nodes.map((n) => {
    const col = cols[n.type] ?? 2;
    const row = (byType[n.type] = (byType[n.type] ?? 0) + 1);
    return {
      id: n.id,
      position: { x: col * 230, y: row * 90 + (col === 3 ? 180 : 0) },
      data: { label: n.label },
      style: nodeStyle(nodeColors[n.type] ?? "#64748b"),
    };
  });
  const edges = graph.edges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    label: e.type,
    animated: e.type === "CONTRADICTS",
    style: { stroke: e.type === "CONTRADICTS" ? "#ef4444" : "#475569" },
    labelStyle: { fill: "#8b93b8", fontSize: 9 },
    labelBgStyle: { fill: "#0b0e1a" },
  }));
  return { nodes, edges };
}

function mirofishToFlow(entities: any) {
  const list: any[] = entities?.entities ?? [];
  const uuidToName: Record<string, string> = {};
  list.forEach((e) => {
    if (e.uuid) uuidToName[e.uuid] = e.name;
  });
  const palette = ["#8b5cf6", "#3b82f6", "#22c55e", "#eab308", "#14b8a6", "#f97316", "#ec4899"];
  const typeColor: Record<string, string> = {};
  let ci = 0;
  const cols = Math.ceil(Math.sqrt(list.length || 1));
  const nodes = list.map((e, i) => {
    const label = (e.labels || []).find((l: string) => l !== "Entity") ?? "Entity";
    if (!typeColor[label]) typeColor[label] = palette[ci++ % palette.length];
    return {
      id: e.uuid ?? e.name,
      position: { x: (i % cols) * 240, y: Math.floor(i / cols) * 140 },
      data: { label: `${e.name}\n[${label}]` },
      style: nodeStyle(typeColor[label]),
    };
  });
  const edges: any[] = [];
  list.forEach((e) => {
    (e.related_edges || []).forEach((r: any, i: number) => {
      if (r.direction !== "outgoing") return;
      const target = r.target_node_uuid;
      if (!target || !uuidToName[target]) return;
      edges.push({
        id: `${e.uuid}-${i}`,
        source: e.uuid ?? e.name,
        target,
        label: r.edge_name,
        style: { stroke: "#475569" },
        labelStyle: { fill: "#8b93b8", fontSize: 9 },
        labelBgStyle: { fill: "#0b0e1a" },
      });
    });
  });
  return { nodes, edges };
}

function nodeStyle(color: string) {
  return {
    background: "#151a2e",
    color: "#e8eaf6",
    border: `2px solid ${color}`,
    borderRadius: 10,
    fontSize: 11,
    padding: 8,
    width: 180,
    whiteSpace: "pre-wrap",
  };
}

function flowHtml(flow: { nodes: any[]; edges: any[] }): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/reactflow@11.11.4/dist/umd/index.js"></script>
<link rel="stylesheet" href="https://unpkg.com/reactflow@11.11.4/dist/style.css" />
<style>
  html, body, #root { margin:0; height:100%; background:#0b0e1a; }
  .react-flow__attribution { display:none; }
</style>
</head>
<body>
<div id="root"></div>
<script>
  const { ReactFlow, Background, Controls } = window.ReactFlow;
  const nodes = ${JSON.stringify(flow.nodes)};
  const edges = ${JSON.stringify(flow.edges)};
  const e = React.createElement;
  ReactDOM.createRoot(document.getElementById("root")).render(
    e(ReactFlow, { defaultNodes: nodes, defaultEdges: edges, fitView: true, minZoom: 0.1 },
      e(Background, { color: "#232a45" }),
      e(Controls, {})
    )
  );
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 8 },
  title: {
    color: colors.text, fontSize: 16, fontWeight: "700",
    paddingHorizontal: 16, marginBottom: 8,
  },
  toggleRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  toggle: {
    flex: 1, backgroundColor: colors.card, borderColor: colors.cardBorder,
    borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center",
  },
  toggleActive: { borderColor: colors.purple, backgroundColor: colors.purple + "22" },
  toggleText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  webviewBox: {
    flex: 1, marginHorizontal: 12, borderRadius: 14, overflow: "hidden",
    borderColor: colors.cardBorder, borderWidth: 1,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dim: { color: colors.textDim, textAlign: "center", lineHeight: 20 },
  legend: {
    flexDirection: "row", flexWrap: "wrap", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10, justifyContent: "center",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.textDim, fontSize: 11 },
  runBtn: {
    backgroundColor: colors.purple, margin: 16, marginTop: 4,
    borderRadius: 14, padding: 16, alignItems: "center",
  },
  runText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
