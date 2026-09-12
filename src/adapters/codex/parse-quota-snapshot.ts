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
  CodexResetCredit,
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

export function parseCodexResetCredits(
  text: string,
  options: ParseCodexQuotaSnapshotOptions
): CodexResetCredit[] {
  return parseJsonDocuments(text).flatMap((document) => {
    if (!isRecord(document)) {
      return [];
    }

    return extractCodexResetCreditContainers(document).flatMap((container) =>
      normalizeCodexResetCreditContainer(container, document, options)
    );
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

  candidates.push(...extractRateLimitCandidatesFromContainer(document));

  const result = readRecord(document, ["result"]);

  if (result) {
    candidates.push(...extractRateLimitCandidatesFromContainer(result, document));
  }

  const params = readRecord(document, ["params"]);

  if (params) {
    candidates.push(...extractRateLimitCandidatesFromContainer(params, document));
  }

  const payload = readRecord(document, ["payload"]);

  if (payload) {
    candidates.push(...extractRateLimitCandidatesFromContainer(payload, document));
  }

  return candidates;
}

function extractRateLimitCandidatesFromContainer(
  container: Record<string, unknown>,
  document: Record<string, unknown> = container
): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const rateLimits = readRecord(container, ["rate_limits", "rateLimits"]);

  if (rateLimits) {
    candidates.push(...extractCodexRateLimitCandidates(rateLimits, document));
  }

  const rateLimitsByLimitId = readRecord(container, [
    "rate_limits_by_limit_id",
    "rateLimitsByLimitId"
  ]);

  if (rateLimitsByLimitId) {
    for (const value of Object.values(rateLimitsByLimitId)) {
      if (!isRecord(value)) {
        continue;
      }

      candidates.push(...extractCodexRateLimitCandidates(value, document));
    }
  }

  return candidates;
}

function extractCodexResetCreditContainers(
  document: Record<string, unknown>
): Record<string, unknown>[] {
  const containers: Record<string, unknown>[] = [];

  for (const container of [
    document,
    readRecord(document, ["result"]),
    readRecord(document, ["params"]),
    readRecord(document, ["payload"])
  ]) {
    if (!container) {
      continue;
    }

    const resetCredits = readRecord(container, [
      "rateLimitResetCredits",
      "rate_limit_reset_credits",
      "resetCredits",
      "reset_credits"
    ]);

    if (resetCredits) {
      containers.push(resetCredits);
    }
  }

  return containers;
}

function normalizeCodexResetCreditContainer(
  container: Record<string, unknown>,
  document: Record<string, unknown>,
  options: ParseCodexQuotaSnapshotOptions
): CodexResetCredit[] {
  const observedAt =
    readResetAt(document, ["timestamp", "observed_at", "observedAt"]) ??
    options.observedAt.toISOString();
  const credits = Array.isArray(container.credits) ? container.credits : [];

  return credits.flatMap((credit) => {
    if (!isRecord(credit)) {
      return [];
    }

    const status = readString(credit, ["status"])?.trim().toLowerCase();
    const resetType = readString(credit, ["resetType", "reset_type"]);
    const expiresAt = readResetAt(credit, ["expiresAt", "expires_at"]);

    if (
      status !== "available" ||
      !isCodexRateLimitResetType(resetType) ||
      !expiresAt
    ) {
      return [];
    }

    const source = readCodexResetCreditSource(container);
    const resetCredit: CodexResetCredit = {
      provider: "openai",
      agent: "codex",
      resetType: "codexRateLimits",
      title: readString(credit, ["title"]) ?? "Full reset",
      status: "available",
      expiresAt,
      observedAt,
      source,
      confidence: confidenceForSource(source)
    };
    const grantedAt = readResetAt(credit, ["grantedAt", "granted_at"]);

    if (grantedAt) {
      resetCredit.grantedAt = grantedAt;
    }

    return [resetCredit];
  });
}

function isCodexRateLimitResetType(value: string | undefined): boolean {
  return value?.trim().toLowerCase().replaceAll("_", "") === "codexratelimits";
}

function readCodexResetCreditSource(
  container: Record<string, unknown>
): SourceKind {
  return (
    mapSourceKind(readString(container, ["source", "source_kind", "sourceKind"])) ??
    "official_cli"
  );
}

function extractCodexRateLimitCandidates(
  rateLimits: Record<string, unknown>,
  document: Record<string, unknown>
): Record<string, unknown>[] {
  const observedAt = readString(document, ["timestamp", "observed_at", "observedAt"]);
  const limitId = readString(rateLimits, ["limit_id", "limitId"]);
  const limitName = readString(rateLimits, ["limit_name", "limitName"]);
  const planType = readString(rateLimits, ["plan_type", "planType"]);

  if (!isGlobalCodexRateLimit(limitId)) {
    return [];
  }

  return [
    ["primary", readRecord(rateLimits, ["primary"])],
    ["secondary", readRecord(rateLimits, ["secondary"])]
  ].flatMap(([name, window]) => {
    if (!isRecord(window)) {
      return [];
    }

    const windowType = codexRateLimitWindowType(window);

    if (!windowType) {
      return [];
    }

    return [
      {
        ...window,
        observed_at: observedAt,
        plan_label:
          [limitName ?? limitId, planType].filter(Boolean).join(" ") ||
          undefined,
        expires_at: readResetAt(window),
        source: "official_cli",
        unit: "percent",
        window_type: windowType,
        window_name: name
      }
    ];
  });
}

function isGlobalCodexRateLimit(limitId: string | undefined): boolean {
  const normalized = limitId?.trim().toLowerCase();

  return !normalized || normalized === "codex";
}

function codexRateLimitWindowType(
  window: Record<string, unknown>
): QuotaWindowType | undefined {
  const explicitWindow = mapWindowType(
    readString(window, ["window_type", "windowType", "window"])
  );

  if (explicitWindow) {
    return explicitWindow;
  }

  const windowMinutes = readNumber(window, [
    "window_minutes",
    "windowMinutes",
    "window_duration_mins",
    "windowDurationMins"
  ]);

  switch (windowMinutes) {
    case 300:
      return "session_5h";
    case 1_440:
      return "daily";
    case 10_080:
      return "weekly";
    case 43_200:
      return "monthly";
    default:
      return undefined;
  }
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
