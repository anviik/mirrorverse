import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api } from "../lib/api";
import { colors } from "../lib/theme";

const TAGS = ["career", "finance", "personal", "relationships", "projects"];

export default function CreateDecisionScreen() {
  const navigation = useNavigation<any>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [context, setContext] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Missing info", "Title and description are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createDecision({
        title: title.trim(),
        description: description.trim(),
        tags,
        context: context.trim() || undefined,
      });
      navigation.replace("Graph", { decisionId: res.decision_id });
    } catch (e: any) {
      Alert.alert("Failed to create decision", String(e.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.label}>Decision title</Text>
      <TextInput
        style={styles.input}
        placeholder="Should I take the NYC job offer?"
        placeholderTextColor={colors.textDim}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Describe the decision</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="What are you weighing? Stakes, tradeoffs, constraints..."
        placeholderTextColor={colors.textDim}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>Categories</Text>
      <View style={styles.tagRow}>
        {TAGS.map((t) => (
          <Pressable
            key={t}
            style={[styles.tag, tags.includes(t) && styles.tagActive]}
            onPress={() => toggleTag(t)}
          >
            <Text
              style={{
                color: tags.includes(t) ? "#fff" : colors.textDim,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Extra context (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Anything else the agents should know about you or the situation"
        placeholderTextColor={colors.textDim}
        value={context}
        onChangeText={setContext}
        multiline
      />

      <Pressable style={styles.submit} onPress={submit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Build Decision Graph →</Text>
        )}
      </Pressable>
      {submitting && (
        <Text style={styles.hint}>Claude is structuring your decision into a graph…</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  label: { color: colors.text, fontWeight: "700", marginBottom: 8, marginTop: 18 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    padding: 14,
    fontSize: 15,
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  tagActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  submit: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 28,
    marginBottom: 8,
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  hint: { color: colors.textDim, textAlign: "center", marginBottom: 40 },
});
