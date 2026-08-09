import type { ConfidenceLevel, SourceKind } from "./types.js";

const sourceRank: Record<SourceKind, number> = {
  official_api: 100,
  official_cli: 95,
  official_statusline: 90,
  local_quota_snapshot: 75,
  local_usage_log: 60,
  estimated: 40,
  manual: 30,
  demo: 10,
  unavailable: 0
};

const confidenceRank: Record<ConfidenceLevel, number> = {
  official: 100,
  high: 80,
  medium: 60,
  estimated: 35,
  unknown: 0
};

export function compareSources(left: SourceKind, right: SourceKind): number {
  return sourceRank[left] - sourceRank[right];
}

export function compareConfidence(
  left: ConfidenceLevel,
  right: ConfidenceLevel
): number {
  return confidenceRank[left] - confidenceRank[right];
}

export function describeSource(source: SourceKind): string {
  switch (source) {
    case "official_api":
      return "Official API";
    case "official_cli":
      return "Official CLI";
    case "official_statusline":
      return "Official statusline";
    case "local_quota_snapshot":
      return "Local quota snapshot";
    case "local_usage_log":
      return "Local usage log";
    case "estimated":
      return "Estimated";
    case "manual":
      return "Manual";
    case "demo":
      return "Demo";
    case "unavailable":
      return "Unavailable";
  }
}
