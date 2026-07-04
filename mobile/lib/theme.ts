export const colors = {
  bg: "#0b0e1a",
  card: "#151a2e",
  cardBorder: "#232a45",
  text: "#e8eaf6",
  textDim: "#8b93b8",
  purple: "#8b5cf6",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  teal: "#14b8a6",
};

export const nodeColors: Record<string, string> = {
  Decision: colors.blue,
  Assumption: colors.yellow,
  Evidence: colors.green,
  Outcome: "#a855f7",
  Preference: colors.teal,
};

export const stanceColors: Record<string, string> = {
  approve: colors.green,
  accept: colors.green,
  reject: colors.red,
  uncertain: colors.yellow,
};
