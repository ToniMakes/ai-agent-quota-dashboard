export type ProviderId = "openai" | "anthropic" | string;

export type AgentId = "codex" | "claude-code" | string;

export type QuotaWindowType =
  | "session_5h"
  | "daily"
  | "weekly"
  | "monthly"
  | "billing_cycle"
  | "credits";

export type QuotaUnit =
  | "tokens"
  | "messages"
  | "credits"
  | "usd"
  | "percent"
  | "requests";

export type SourceKind =
  | "official_api"
  | "official_cli"
  | "official_statusline"
  | "local_quota_snapshot"
  | "local_usage_log"
  | "estimated"
  | "manual"
  | "demo"
  | "unavailable";

export type ConfidenceLevel =
  | "official"
  | "high"
  | "medium"
  | "estimated"
  | "unknown";

export type QuotaStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "stale"
  | "unknown";

export type ResetEventType = "reset_anchor_changed" | "quota_replenished";

export type DoctorStatus = "pass" | "warn" | "fail" | "info";

export type QuotaSnapshot = {
  provider: ProviderId;
  agent: AgentId;
  accountIdHash?: string;
  planLabel?: string;
  windowType: QuotaWindowType;
  unit: QuotaUnit;
  used?: number;
  remaining?: number;
  total?: number;
  usedPercent?: number;
  remainingPercent?: number;
  resetAt?: string;
  observedAt: string;
  expiresAt?: string;
  source: SourceKind;
  confidence: ConfidenceLevel;
  stale: boolean;
  rawSourceRef?: string;
};

export type UsageEvent = {
  provider: ProviderId;
  agent: AgentId;
  sessionId?: string;
  projectPathHash?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  costUsdEstimate?: number;
  observedAt: string;
  sourceFile?: string;
  source: Extract<SourceKind, "official_api" | "official_cli" | "local_usage_log">;
};

export type AgentManifest = {
  provider: ProviderId;
  agent: AgentId;
  displayName: string;
  shortName: string;
  description: string;
  defaultDataPaths: string[];
  supportedWindows: QuotaWindowType[];
};

export type DoctorCheck = {
  id: string;
  provider: ProviderId;
  agent: AgentId;
  label: string;
  status: DoctorStatus;
  message: string;
  detail?: string;
  observedAt: string;
};

export type AgentSummary = {
  provider: ProviderId;
  agent: AgentId;
  displayName: string;
  shortName: string;
  status: QuotaStatus;
  emptyState?: AgentEmptyState;
  primarySnapshot?: QuotaSnapshot;
  snapshots: QuotaSnapshot[];
  doctorStatus: DoctorStatus;
  lastObservedAt?: string;
};

export type AgentEmptyStateReason =
  | "adapter_error"
  | "no_readable_paths"
  | "no_supported_source"
  | "no_quota_data";

export type AgentEmptyState = {
  reason: AgentEmptyStateReason;
  title: string;
  detail: string;
  action: string;
};

export type RefreshResult = {
  observedAt: string;
  snapshotsSaved: number;
  usageEventsSaved: number;
  doctorChecksSaved: number;
  resetEventsSaved: number;
  adapterCount: number;
  errors: string[];
};

export type RefreshRun = RefreshResult & {
  id: number;
};

export type ResetEvent = {
  id?: number;
  provider: ProviderId;
  agent: AgentId;
  windowType: QuotaWindowType;
  eventType: ResetEventType;
  previousResetAt?: string;
  newResetAt?: string;
  previousRemainingPercent?: number;
  newRemainingPercent?: number;
  observedAt: string;
  source: SourceKind;
  confidence: ConfidenceLevel;
  note: string;
};
