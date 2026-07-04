import { create } from "zustand";
import { api, DecisionSummary, SimulationResult } from "./api";

interface AppState {
  decisions: DecisionSummary[];
  loadingDecisions: boolean;
  results: Record<string, SimulationResult>;
  refreshDecisions: () => Promise<void>;
  fetchResult: (decisionId: string) => Promise<SimulationResult | null>;
}

export const useStore = create<AppState>((set, get) => ({
  decisions: [],
  loadingDecisions: false,
  results: {},

  refreshDecisions: async () => {
    set({ loadingDecisions: true });
    try {
      const decisions = await api.listDecisions();
      set({ decisions });
    } catch {
      // backend unreachable — keep stale list
    } finally {
      set({ loadingDecisions: false });
    }
  },

  fetchResult: async (decisionId: string) => {
    try {
      const { status, result } = await api.getSimulation(decisionId);
      if (status === "done" && result) {
        set({ results: { ...get().results, [decisionId]: result } });
        return result;
      }
    } catch {}
    return null;
  },
}));
