import { parseJsonDocuments } from "../json-documents.js";
import {
  clampPercent,
  confidenceForSource,
  inferPercentFromTotals,
  isRecord,
  mapSourceKind,
  mapUnit,
  mapWindowType,
  readBoolean,
  readNumber,
  readRecord,
  readResetAt,
  readString
} from "../parse-utils.js";
import type {
  QuotaSnapshot,
  QuotaUnit,
  QuotaWindowType,
  SourceKind
} from "../../core/types.js";

export type ParseCodexQuotaSnapshotOptions = {
  observedAt: Date;
  rawSourceRef?: string;
};

export function parseCodexQuotaSnapshots(
  text: string,
  options: ParseCodexQuotaSnapshotOptions
): QuotaSnapshot[] {
  return parseJsonDocuments(text).flatMap((document) => {
    if (!isRecord(document)) {
      return [];
    }

    return extractCodexQuotaCandidates(document)
      .flatMap((candidate) => normalizeCodexQuotaCandidate(candidate, options));
  });
}

function extractCodexQuotaCandidates(document: Record<string, unknown>) {
  const candidates: Record<string, unknown>[] = [];
  const explicitSnapshot = readRecord(document, [
    "quota_snapshot",
    "quotaSnapshot",
    "quota",
    "usage_limit",
    "usageLimit",
    "usage_limits",
    "usageLimits"
  ]);

  if (explicitSnapshot) {
    candidates.push(explicitSnapshot);
  }

  const eventType = readString(document, ["type", "event", "kind"]);

  if (eventType && /quota|usage[_-]?limit/i.test(eventType)) {
    candidates.push(document);
  }

  const weekly = readRecord(document, ["weekly", "seven_day", "sevenDay"]);

  if (weekly) {
    candidates.push({ ...weekly, window_type: "weekly" });
  }

  return candidates;
}

function normalizeCodexQuotaCandidate(
  candidate: Record<string, unknown>,
  options: ParseCodexQuotaSnapshotOptions
): QuotaSnapshot[] {
  const nestedWeekly = readRecord(candidate, ["weekly", "seven_day", "sevenDay"]);

  if (nestedWeekly) {
    return normalizeCodexQuotaCandidate(
      { ...nestedWeekly, window_type: "weekly" },
      options
    );
  }

  const windowType = readCodexWindowType(candidate);

  if (!windowType) {
    return [];
  }

  const unit = readCodexUnit(candidate);
  const used = readNumber(candidate, ["used", "used_value", "usedValue"]);
  const remaining = readNumber(candidate, [
    "remaining",
    "remaining_value",
    "remainingValue"
  ]);
  const total = readNumber(candidate, ["total", "limit", "quota"]);
  const usedPercent = clampPercent(
    readNumber(candidate, [
      "used_percent",
      "usedPercent",
      "used_percentage",
      "usedPercentage"
    ]) ?? inferPercentFromTotals(used, total)
  );
  const remainingPercent = clampPercent(
    readNumber(candidate, [
      "remaining_percent",
      "remainingPercent",
      "remaining_percentage",
      "remainingPercentage"
    ]) ??
      inferPercentFromTotals(remaining, total) ??
      (typeof usedPercent === "number" ? 100 - usedPercent : undefined)
  );

  if (
    typeof used !== "number" &&
    typeof remaining !== "number" &&
    typeof usedPercent !== "number" &&
    typeof remainingPercent !== "number"
  ) {
    return [];
  }

  const source = readCodexSource(candidate);
  const snapshot: QuotaSnapshot = {
    provider: "openai",
    agent: "codex",
    windowType,
    unit,
    observedAt:
      readResetAt(candidate, ["observed_at", "observedAt", "timestamp"]) ??
      options.observedAt.toISOString(),
    source,
    confidence: confidenceForSource(source),
    stale: readBoolean(candidate, ["stale"]) ?? false
  };

  const planLabel = readString(candidate, ["plan_label", "planLabel", "plan"]);
  if (planLabel) snapshot.planLabel = planLabel;

  if (typeof used === "number") snapshot.used = used;
  if (typeof remaining === "number") snapshot.remaining = remaining;
  if (typeof total === "number") snapshot.total = total;
  if (typeof usedPercent === "number") snapshot.usedPercent = usedPercent;
  if (typeof remainingPercent === "number") {
    snapshot.remainingPercent = remainingPercent;
  }

  const resetAt = readResetAt(candidate);
  if (resetAt) snapshot.resetAt = resetAt;

  const expiresAt = readResetAt(candidate, ["expires_at", "expiresAt"]);
  if (expiresAt) snapshot.expiresAt = expiresAt;

  if (options.rawSourceRef) {
    snapshot.rawSourceRef = options.rawSourceRef;
  }

  return [snapshot];
}

function readCodexWindowType(
  candidate: Record<string, unknown>
): QuotaWindowType | undefined {
  return mapWindowType(
    readString(candidate, [
      "window_type",
      "windowType",
      "window",
      "period",
      "limit_window",
      "limitWindow"
    ])
  );
}

function readCodexUnit(candidate: Record<string, unknown>): QuotaUnit {
  return (
    mapUnit(readString(candidate, ["unit", "quota_unit", "quotaUnit"])) ??
    "percent"
  );
}

function readCodexSource(candidate: Record<string, unknown>): SourceKind {
  return (
    mapSourceKind(
      readString(candidate, ["source", "source_kind", "sourceKind"])
    ) ?? "local_quota_snapshot"
  );
}
