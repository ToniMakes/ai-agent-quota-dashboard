import type {
  ConfidenceLevel,
  QuotaUnit,
  QuotaWindowType,
  SourceKind
} from "../core/types.js";

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRecord(
  record: JsonRecord,
  keys: string[]
): JsonRecord | undefined {
  for (const key of keys) {
    const value = record[key];

    if (isRecord(value)) {
      return value;
    }
  }

  return undefined;
}

export function readNumber(
  record: JsonRecord,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

export function readString(
  record: JsonRecord,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}

export function readBoolean(
  record: JsonRecord,
  keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

export function parseResetAt(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);

    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return undefined;
}

export function readResetAt(
  record: JsonRecord,
  keys = ["resetAt", "reset_at", "resetsAt", "resets_at"]
): string | undefined {
  for (const key of keys) {
    const resetAt = parseResetAt(record[key]);

    if (resetAt) {
      return resetAt;
    }
  }

  return undefined;
}

export function clampPercent(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(100, Math.max(0, value));
}

export function inferPercentFromTotals(
  value: number | undefined,
  total: number | undefined
): number | undefined {
  if (
    typeof value !== "number" ||
    typeof total !== "number" ||
    !Number.isFinite(value) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return undefined;
  }

  return clampPercent((value / total) * 100);
}

export function mapWindowType(value: string | undefined): QuotaWindowType | undefined {
  const normalized = value?.trim().toLowerCase().replaceAll("-", "_");

  switch (normalized) {
    case "5h":
    case "five_hour":
    case "five_hours":
    case "session_5h":
      return "session_5h";
    case "daily":
    case "day":
      return "daily";
    case "weekly":
    case "week":
    case "7d":
    case "seven_day":
    case "seven_days":
      return "weekly";
    case "monthly":
    case "month":
      return "monthly";
    case "billing_cycle":
    case "billing":
      return "billing_cycle";
    case "credits":
    case "credit":
      return "credits";
    default:
      return undefined;
  }
}

export function mapUnit(value: string | undefined): QuotaUnit | undefined {
  const normalized = value?.trim().toLowerCase().replaceAll("-", "_");

  switch (normalized) {
    case "token":
    case "tokens":
      return "tokens";
    case "message":
    case "messages":
      return "messages";
    case "credit":
    case "credits":
      return "credits";
    case "usd":
    case "dollar":
    case "dollars":
      return "usd";
    case "percent":
    case "percentage":
    case "%":
      return "percent";
    case "request":
    case "requests":
      return "requests";
    default:
      return undefined;
  }
}

export function mapSourceKind(value: string | undefined): SourceKind | undefined {
  const normalized = value?.trim().toLowerCase().replaceAll("-", "_");

  switch (normalized) {
    case "official_api":
      return "official_api";
    case "official_cli":
    case "cli_status":
      return "official_cli";
    case "official_statusline":
    case "statusline":
      return "official_statusline";
    case "local_quota_snapshot":
    case "quota_snapshot":
      return "local_quota_snapshot";
    case "local_usage_log":
    case "usage_log":
      return "local_usage_log";
    case "estimated":
      return "estimated";
    case "manual":
      return "manual";
    case "demo":
      return "demo";
    case "unavailable":
      return "unavailable";
    default:
      return undefined;
  }
}

export function confidenceForSource(source: SourceKind): ConfidenceLevel {
  switch (source) {
    case "official_api":
    case "official_cli":
    case "official_statusline":
      return "official";
    case "local_quota_snapshot":
      return "high";
    case "local_usage_log":
      return "medium";
    case "estimated":
      return "estimated";
    case "manual":
    case "demo":
    case "unavailable":
      return "unknown";
  }
}
