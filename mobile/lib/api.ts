import Constants from "expo-constants";

// When Metro runs in tunnel mode (exp.direct), the phone can't reach the Mac's
// LAN IP — use the backend's public tunnel instead.
const BACKEND_TUNNEL_URL = "https://mirrorverse-backend.loca.lt";

function resolveBaseUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri ? hostUri.split(":")[0] : "localhost";
  if (host.endsWith("exp.direct")) return BACKEND_TUNNEL_URL;
  return `http://${host}:8000`;
}

export const BASE_URL = resolveBaseUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      // localtunnel shows a browser interstitial unless this header is present
      "bypass-tunnel-reminder": "1",
    },
    ...init,
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  return res.json();
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}
export interface DecisionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface DecisionSummary {
  decision_id: string;
  title: string;
  status: "pending" | "simulated";
  tags: string[];
  created_at: string;
}
export interface AgentOutput {
  agent_name: string;
  stance: string;
  reasoning: string;
  confidence: number;
  assumptions_challenged: string[];
}
export interface SimulationResult {
  final_recommendation: string;
  confidence: number;
  key_risks: string[];
  key_disagreements: string[];
  missing_information: string[];
  agent_summaries: AgentOutput[];
}

export const api = {
  listDecisions: () => request<DecisionSummary[]>("/decisions"),
  getDecision: (id: string) =>
    request<{ title: string; status: string; graph: DecisionGraph }>(`/decision/${id}`),
  createDecision: (payload: {
    title: string;
    description: string;
    tags: string[];
    context?: string;
  }) =>
    request<{ decision_id: string; graph: DecisionGraph }>("/create-decision", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  runSimulation: (decision_id: string) =>
    request<{ status: string }>("/run-simulation", {
      method: "POST",
      body: JSON.stringify({ decision_id }),
    }),
  getSimulation: (id: string) =>
    request<{ status: string; result: SimulationResult | null }>(`/simulation/${id}`),
  getMirofishGraph: (id: string) =>
    request<{ status: string; entities: any }>(`/mirofish-graph/${id}`),
  getMemories: (userId = "default") =>
    request<{ memories: { results: { memory: string; categories: string[] }[] } }>(
      `/memory/${userId}`
    ),
};
