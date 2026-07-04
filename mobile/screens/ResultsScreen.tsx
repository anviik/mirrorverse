import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { api, SimulationResult, AgentOutput } from "../lib/api";
import { colors, stanceColors } from "../lib/theme";

const AGENT_EMOJI: Record<string, string> = {
  "Risk Analyst": "⚠️",
  "Career Optimizer": "📈",
  "Financial Modeler": "💰",
  "Future Self": "🔮",
  Contrarian: "😈",
  "Reality Checker": "🔍",
  "Emotional Wellbeing": "💚",
};

export default function ResultsScreen() {
  const route = useRoute<any>();
  const decisionId: string = route.params.decisionId;
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [status, setStatus] = useState("running");
  const timer = useRef<any>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await api.getSimulation(decisionId);
        setStatus(r.status);
        if (r.status === "done" && r.result) {
          setResult(r.result);
          clearInterval(timer.current);
        } else if (r.status.startsWith("failed")) {
          clearInterval(timer.current);
        }
      } catch {}
    };
    poll();
    timer.current = setInterval(poll, 5000);
    return () => clearInterval(timer.current);
  }, [decisionId]);

  if (!result) {
    return (
      <View style={[styles.container, styles.center]}>
        {status.startsWith("failed") ? (
          <>
            <Text style={styles.failTitle}>Simulation failed</Text>
            <Text style={styles.dim}>{status}</Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingTitle}>7 agents debating…</Text>
            <Text style={styles.dim}>
              Risk Analyst, Career Optimizer, Financial Modeler, Future Self,
              Contrarian, Reality Checker and Emotional Wellbeing are arguing
              about your decision across 2 rounds.
            </Text>
          </>
        )}
      </View>
    );
  }

  const rec = result.final_recommendation;
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={[styles.verdict, { borderColor: stanceColors[rec] ?? colors.yellow }]}>
        <Text style={[styles.verdictText, { color: stanceColors[rec] ?? colors.yellow }]}>
          {rec.toUpperCase()}
        </Text>
        <Text style={styles.confidence}>
          {(result.confidence * 100).toFixed(0)}% confidence
        </Text>
      </View>

      <Section title="🤖 Agent Panel">
        {result.agent_summaries.map((a) => (
          <AgentCard key={a.agent_name} agent={a} />
        ))}
      </Section>

      <Section title="⚠️ Key Risks">
        {result.key_risks.map((r, i) => (
          <Bullet key={i} text={r} color={colors.red} />
        ))}
      </Section>

      <Section title="⚔️ Agent Disagreements">
        {result.key_disagreements.map((d, i) => (
          <Bullet key={i} text={d} color={colors.yellow} />
        ))}
      </Section>

      <Section title="❓ Missing Information">
        {result.missing_information.map((m, i) => (
          <Bullet key={i} text={m} color={colors.blue} />
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ text, color }: { text: string; color: string }) {
  return (
    <View style={styles.bullet}>
      <View style={[styles.bulletDot, { backgroundColor: color }]} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function AgentCard({ agent }: { agent: AgentOutput }) {
  const [open, setOpen] = useState(false);
  const color = stanceColors[agent.stance] ?? colors.yellow;
  return (
    <Pressable style={styles.agentCard} onPress={() => setOpen(!open)}>
      <View style={styles.agentHeader}>
        <Text style={styles.agentName}>
          {AGENT_EMOJI[agent.agent_name] ?? "🤖"} {agent.agent_name}
        </Text>
        <View style={[styles.stanceBadge, { backgroundColor: color + "22" }]}>
          <Text style={{ color, fontSize: 12, fontWeight: "700" }}>
            {agent.stance} · {(agent.confidence * 100).toFixed(0)}%
          </Text>
        </View>
      </View>
      {open && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.reasoning}>{agent.reasoning}</Text>
          {agent.assumptions_challenged.length > 0 && (
            <>
              <Text style={styles.challengedTitle}>Assumptions challenged:</Text>
              {agent.assumptions_challenged.map((a, i) => (
                <Text key={i} style={styles.challenged}>• {a}</Text>
              ))}
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", padding: 32 },
  loadingTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginTop: 20 },
  failTitle: { color: colors.red, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  dim: { color: colors.textDim, textAlign: "center", marginTop: 10, lineHeight: 20 },
  verdict: {
    borderWidth: 2, borderRadius: 18, padding: 24, alignItems: "center",
    backgroundColor: colors.card,
  },
  verdictText: { fontSize: 32, fontWeight: "900", letterSpacing: 2 },
  confidence: { color: colors.textDim, marginTop: 6, fontSize: 15 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 10 },
  agentCard: {
    backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1,
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  agentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  agentName: { color: colors.text, fontWeight: "700", fontSize: 14, flex: 1 },
  stanceBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  reasoning: { color: colors.textDim, lineHeight: 20, fontSize: 13 },
  challengedTitle: { color: colors.text, fontWeight: "700", marginTop: 10, fontSize: 12 },
  challenged: { color: colors.textDim, fontSize: 12, lineHeight: 18, marginTop: 4 },
  bullet: { flexDirection: "row", marginBottom: 8, alignItems: "flex-start" },
  bulletDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: 10 },
  bulletText: { color: colors.textDim, flex: 1, lineHeight: 20, fontSize: 13 },
});
