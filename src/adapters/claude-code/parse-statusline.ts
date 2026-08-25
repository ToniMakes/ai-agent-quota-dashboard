import { parseJsonDocuments } from "../json-documents.js";
import {
  clampPercent,
  isRecord,
  readNumber,
  readRecord,
  readResetAt
} from "../parse-utils.js";
import { claudeStatuslineFreshnessMs } from "../../config/policy.js";
import type { QuotaSnapshot, QuotaWindowType } from "../../core/types.js";

export type ParseClaudeCodeStatuslineOptions = {
  observedAt: Date;
  rawSourceRef?: string;
};

const statuslineSnapshotMaxAgeMs = claudeStatuslineFreshnessMs;

const claudeRateLimitWindows: Array<{
  key: string;
  windowType: QuotaWindowType;
}> = [
  { key: "five_hour", windowType: "session_5h" },
  { key: "seven_day", windowType: "weekly" },
  { key: "daily", windowType: "daily" }
];

export function parseClaudeCodeStatusline(
  text: string,
  options: ParseClaudeCodeStatuslineOptions
): QuotaSnapshot[] {
  return parseJsonDocuments(text).flatMap((document) => {
    if (!isRecord(document)) {
      return [];
    }

    return parseClaudeCodeStatuslinePayload(document, options);
  });
}

export function parseClaudeCodeStatuslinePayload(
  payload: Record<string, unknown>,
  options: ParseClaudeCodeStatuslineOptions
): QuotaSnapshot[] {
  const rateLimits = readRecord(payload, ["rate_limits", "rateLimits"]);
  const observedAt =
    readResetAt(payload, ["observed_at", "observedAt", "timestamp"]) ??
    options.observedAt.toISOString();

  if (!rateLimits) {
    return [];
  }

  return claudeRateLimitWindows.flatMap(({ key, windowType }) => {
    const windowPayload = readRecord(rateLimits, [key]);

    if (!windowPayload) {
      return [];
    }

    const usedPercent = clampPercent(
      readNumber(windowPayload, ["used_percentage", "usedPercentage"])
    );
    const remainingPercent = clampPercent(
      readNumber(windowPayload, [
        "remaining_percentage",
        "remainingPercentage"
      ]) ?? (typeof usedPercent === "number" ? 100 - usedPercent : undefined)
    );
    const resetAt = readResetAt(windowPayload);

    if (
      typeof usedPercent !== "number" &&
      typeof remainingPercent !== "number"
    ) {
      return [];
    }

    const snapshot: QuotaSnapshot = {
      provider: "anthropic",
      agent: "claude-code",
      planLabel: "Claude.ai rate limits",
      windowType,
      unit: "percent",
      observedAt,
      source: "official_statusline",
      confidence: "official",
      stale: false
    };

    if (typeof usedPercent === "number") {
      snapshot.used = usedPercent;
      snapshot.usedPercent = usedPercent;
    }

    if (typeof remainingPercent === "number") {
      snapshot.remaining = remainingPercent;
      snapshot.remainingPercent = remainingPercent;
    }

    if (resetAt) {
      snapshot.resetAt = resetAt;
    }

    const expiresAt = statuslineSnapshotExpiresAt(observedAt, resetAt);

    if (expiresAt) {
      snapshot.expiresAt = expiresAt;
    }

    if (options.rawSourceRef) {
      snapshot.rawSourceRef = options.rawSourceRef;
    }

    return [snapshot];
  });
}

function statuslineSnapshotExpiresAt(
  observedAt: string,
  resetAt: string | undefined
): string | undefined {
  const candidates: number[] = [];
  const observedAtMs = Date.parse(observedAt);

  if (!Number.isNaN(observedAtMs)) {
    candidates.push(observedAtMs + statuslineSnapshotMaxAgeMs);
  }

  if (resetAt) {
    const resetAtMs = Date.parse(resetAt);

    if (!Number.isNaN(resetAtMs)) {
      candidates.push(resetAtMs);
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  return new Date(Math.min(...candidates)).toISOString();
}
