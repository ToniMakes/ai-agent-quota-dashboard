import { parseJsonDocuments } from "../json-documents.js";
import { clampPercent, isRecord, readNumber } from "../parse-utils.js";
import type { QuotaSnapshot, QuotaWindowType } from "../../core/types.js";

export type ParsePlanUsageHistoryOptions = {
  observedAt: Date;
  rawSourceRef?: string;
};

const planUsageHistorySnapshotMaxAgeMs = 40 * 60 * 1000;

const planUsageHistoryWindows: Array<{
  key: string;
  windowType: QuotaWindowType;
}> = [
  { key: "fh", windowType: "session_5h" },
  { key: "sd", windowType: "weekly" }
];

export function parsePlanUsageHistory(
  text: string,
  options: ParsePlanUsageHistoryOptions
): QuotaSnapshot[] {
  const [document] = parseJsonDocuments(text);

  if (!isRecord(document)) {
    return [];
  }

  const samples = document.samples;

  if (!Array.isArray(samples) || samples.length === 0) {
    return [];
  }

  const latestSample = samples.reduce<Record<string, unknown> | undefined>(
    (latest, candidate) => {
      if (!isRecord(candidate) || typeof candidate.t !== "number") {
        return latest;
      }

      if (!latest || typeof latest.t !== "number" || candidate.t > latest.t) {
        return candidate;
      }

      return latest;
    },
    undefined
  );

  if (!latestSample || typeof latestSample.t !== "number") {
    return [];
  }

  const usage = latestSample.u;

  if (!isRecord(usage)) {
    return [];
  }

  const observedAt = new Date(latestSample.t).toISOString();
  const expiresAt = new Date(
    latestSample.t + planUsageHistorySnapshotMaxAgeMs
  ).toISOString();

  return planUsageHistoryWindows.flatMap(({ key, windowType }) => {
    const usedPercent = clampPercent(readNumber(usage, [key]));

    if (typeof usedPercent !== "number") {
      return [];
    }

    const snapshot: QuotaSnapshot = {
      provider: "anthropic",
      agent: "claude-desktop",
      planLabel: "Claude Desktop usage history",
      windowType,
      unit: "percent",
      used: usedPercent,
      usedPercent,
      remaining: 100 - usedPercent,
      remainingPercent: 100 - usedPercent,
      observedAt,
      expiresAt,
      source: "local_quota_snapshot",
      confidence: "high",
      stale: false
    };

    if (options.rawSourceRef) {
      snapshot.rawSourceRef = options.rawSourceRef;
    }

    return [snapshot];
  });
}
