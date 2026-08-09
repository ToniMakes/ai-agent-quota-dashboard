import type { QuotaSnapshot, ResetEvent } from "./types.js";

export type PublicQuotaSnapshot = Omit<
  QuotaSnapshot,
  "accountIdHash" | "rawSourceRef"
>;

export type PublicResetEvent = Omit<ResetEvent, "id">;

export type QuotaExport = {
  schemaVersion: 1;
  exportKind: "normalized_quota";
  generatedAt: string;
  privacy: {
    accountIdentifiers: "excluded";
    rawSourceRefs: "excluded";
  };
  snapshots: PublicQuotaSnapshot[];
  resetEvents: PublicResetEvent[];
};

type CsvColumn = {
  header: string;
  read: (snapshot: PublicQuotaSnapshot) => unknown;
};

const snapshotCsvColumns: CsvColumn[] = [
  { header: "provider", read: (snapshot) => snapshot.provider },
  { header: "agent", read: (snapshot) => snapshot.agent },
  { header: "window_type", read: (snapshot) => snapshot.windowType },
  { header: "unit", read: (snapshot) => snapshot.unit },
  { header: "plan_label", read: (snapshot) => snapshot.planLabel },
  { header: "used", read: (snapshot) => snapshot.used },
  { header: "remaining", read: (snapshot) => snapshot.remaining },
  { header: "total", read: (snapshot) => snapshot.total },
  { header: "used_percent", read: (snapshot) => snapshot.usedPercent },
  { header: "remaining_percent", read: (snapshot) => snapshot.remainingPercent },
  { header: "reset_at", read: (snapshot) => snapshot.resetAt },
  { header: "observed_at", read: (snapshot) => snapshot.observedAt },
  { header: "expires_at", read: (snapshot) => snapshot.expiresAt },
  { header: "source", read: (snapshot) => snapshot.source },
  { header: "confidence", read: (snapshot) => snapshot.confidence },
  { header: "stale", read: (snapshot) => snapshot.stale }
];

export function buildQuotaExport(input: {
  generatedAt: string;
  resetEvents: readonly ResetEvent[];
  snapshots: readonly QuotaSnapshot[];
}): QuotaExport {
  return {
    schemaVersion: 1,
    exportKind: "normalized_quota",
    generatedAt: input.generatedAt,
    privacy: {
      accountIdentifiers: "excluded",
      rawSourceRefs: "excluded"
    },
    snapshots: input.snapshots.map(sanitizeQuotaSnapshot),
    resetEvents: input.resetEvents.map(sanitizeResetEvent)
  };
}

export function quotaSnapshotsToCsv(snapshots: readonly QuotaSnapshot[]): string {
  const rows = [
    snapshotCsvColumns.map((column) => column.header),
    ...snapshots.map((snapshot) => {
      const sanitized = sanitizeQuotaSnapshot(snapshot);
      return snapshotCsvColumns.map((column) => formatCsvCell(column.read(sanitized)));
    })
  ];

  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}

export function sanitizeQuotaSnapshot(snapshot: QuotaSnapshot): PublicQuotaSnapshot {
  const sanitized: PublicQuotaSnapshot = {
    provider: snapshot.provider,
    agent: snapshot.agent,
    windowType: snapshot.windowType,
    unit: snapshot.unit,
    observedAt: snapshot.observedAt,
    source: snapshot.source,
    confidence: snapshot.confidence,
    stale: snapshot.stale
  };

  if (snapshot.planLabel !== undefined) sanitized.planLabel = snapshot.planLabel;
  if (snapshot.used !== undefined) sanitized.used = snapshot.used;
  if (snapshot.remaining !== undefined) sanitized.remaining = snapshot.remaining;
  if (snapshot.total !== undefined) sanitized.total = snapshot.total;
  if (snapshot.usedPercent !== undefined) sanitized.usedPercent = snapshot.usedPercent;
  if (snapshot.remainingPercent !== undefined) {
    sanitized.remainingPercent = snapshot.remainingPercent;
  }
  if (snapshot.resetAt !== undefined) sanitized.resetAt = snapshot.resetAt;
  if (snapshot.expiresAt !== undefined) sanitized.expiresAt = snapshot.expiresAt;

  return sanitized;
}

function sanitizeResetEvent(event: ResetEvent): PublicResetEvent {
  const sanitized: PublicResetEvent = {
    provider: event.provider,
    agent: event.agent,
    windowType: event.windowType,
    eventType: event.eventType,
    observedAt: event.observedAt,
    source: event.source,
    confidence: event.confidence,
    note: event.note
  };

  if (event.previousResetAt !== undefined) {
    sanitized.previousResetAt = event.previousResetAt;
  }
  if (event.newResetAt !== undefined) sanitized.newResetAt = event.newResetAt;
  if (event.previousRemainingPercent !== undefined) {
    sanitized.previousRemainingPercent = event.previousRemainingPercent;
  }
  if (event.newRemainingPercent !== undefined) {
    sanitized.newRemainingPercent = event.newRemainingPercent;
  }

  return sanitized;
}

function formatCsvCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  const text = typeof value === "boolean" ? String(value) : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}
