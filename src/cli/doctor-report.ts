import {
  sanitizeAgentQuotaSnapshot,
  type PublicAgentQuotaSnapshot
} from "../core/export-data.js";
import {
  buildRealDataReadiness,
  hasBlockingDiagnosticFailures,
  type RealDataReadiness,
  type RealDataReadinessCheck
} from "../core/real-data-readiness.js";
import type {
  AgentEmptyState,
  AgentSummary,
  DoctorCheck,
  DoctorStatus,
  QuotaSnapshot,
  QuotaSnapshotView,
  QuotaStatus,
  RefreshResult
} from "../core/types.js";

export type DoctorReportInput = {
  agents: readonly AgentSummary[];
  checks: readonly DoctorCheck[];
  configErrors: readonly string[];
  configPath: string;
  dbPath: string;
  demoMode: boolean;
  generatedAt: string;
  refreshResult: RefreshResult;
};

export type DoctorReportFormatOptions = {
  includeRealDataReadiness?: boolean;
};

export type DoctorFailureOptions = {
  requireRealData?: boolean;
};

export type DoctorJsonReport = {
  schemaVersion: 1;
  reportKind: "doctor";
  generatedAt: string;
  mode: "demo" | "local";
  privacy: {
    accountIdentifiers: "excluded";
    localPaths: "redacted";
    rawContent: "excluded";
    rawSourceRefs: "excluded";
  };
  storage: {
    configPath: "<local-path>";
    dbPath: "<local-path>";
  };
  configErrors: string[];
  refresh: Omit<RefreshResult, "errors"> & {
    errors: string[];
  };
  realDataReadiness: RealDataReadiness;
  agents: DoctorJsonAgent[];
  checks: DoctorJsonCheck[];
};

export type DoctorJsonAgent = {
  provider: string;
  agent: string;
  displayName: string;
  shortName: string;
  status: QuotaStatus;
  doctorStatus: DoctorStatus;
  emptyState?: AgentEmptyState;
  primarySnapshot?: PublicAgentQuotaSnapshot;
  snapshots: PublicAgentQuotaSnapshot[];
  lastObservedAt?: string;
};

export type DoctorJsonCheck = {
  id: string;
  provider: string;
  agent: string;
  label: string;
  status: DoctorStatus;
  message: string;
  detail?: string;
  observedAt: string;
};

export function formatDoctorReport(
  input: DoctorReportInput,
  options: DoctorReportFormatOptions = {}
): string {
  const lines = [
    "AI Agent Quota Doctor",
    "",
    `Generated: ${input.generatedAt}`,
    `Mode: ${input.demoMode ? "demo" : "local"}`,
    `SQLite store: ${input.dbPath}`,
    `Config file: ${input.configPath}`,
    ""
  ];

  if (input.configErrors.length > 0) {
    lines.push("Config warnings:");
    lines.push(...input.configErrors.map((error) => `  - ${error}`));
    lines.push("");
  }

  lines.push(formatRefreshResult(input.refreshResult));
  lines.push("");

  if (options.includeRealDataReadiness) {
    lines.push(formatRealDataReadiness(input));
    lines.push("");
  }

  for (const agent of input.agents) {
    lines.push(...formatAgent(agent, input.checks));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function buildDoctorJsonReport(input: DoctorReportInput): DoctorJsonReport {
  return {
    schemaVersion: 1,
    reportKind: "doctor",
    generatedAt: input.generatedAt,
    mode: input.demoMode ? "demo" : "local",
    privacy: {
      accountIdentifiers: "excluded",
      localPaths: "redacted",
      rawContent: "excluded",
      rawSourceRefs: "excluded"
    },
    storage: {
      configPath: "<local-path>",
      dbPath: "<local-path>"
    },
    configErrors: input.configErrors.map(redactLocalPaths),
    refresh: {
      observedAt: input.refreshResult.observedAt,
      snapshotsSaved: input.refreshResult.snapshotsSaved,
      usageEventsSaved: input.refreshResult.usageEventsSaved,
      doctorChecksSaved: input.refreshResult.doctorChecksSaved,
      resetEventsSaved: input.refreshResult.resetEventsSaved,
      adapterCount: input.refreshResult.adapterCount,
      errors: input.refreshResult.errors.map(redactLocalPaths)
    },
    realDataReadiness: sanitizeRealDataReadiness(buildRealDataReadiness(input)),
    agents: input.agents.map(sanitizeAgent),
    checks: input.checks.map(sanitizeDoctorCheck)
  };
}

export function hasDoctorFailures(
  input: DoctorReportInput,
  options: DoctorFailureOptions = {}
): boolean {
  if (hasBlockingDiagnosticFailures(input)) {
    return true;
  }

  if (options.requireRealData && !buildRealDataReadiness(input).ok) {
    return true;
  }

  return false;
}

function sanitizeRealDataReadiness(readiness: RealDataReadiness): RealDataReadiness {
  return {
    ok: readiness.ok,
    checks: readiness.checks.map((check) => {
      const sanitized: RealDataReadinessCheck = {
        provider: check.provider,
        agent: check.agent,
        displayName: check.displayName,
        status: check.status,
        message: redactLocalPaths(check.message)
      };

      if (check.action) {
        sanitized.action = redactLocalPaths(check.action);
      }

      return sanitized;
    })
  };
}

function sanitizeAgent(agent: AgentSummary): DoctorJsonAgent {
  const sanitized: DoctorJsonAgent = {
    provider: agent.provider,
    agent: agent.agent,
    displayName: agent.displayName,
    shortName: agent.shortName,
    status: agent.status,
    doctorStatus: agent.doctorStatus,
    snapshots: agent.snapshots.map(sanitizeAgentQuotaSnapshot)
  };

  if (agent.emptyState) sanitized.emptyState = agent.emptyState;
  if (agent.primarySnapshot) {
    sanitized.primarySnapshot = sanitizeAgentQuotaSnapshot(agent.primarySnapshot);
  }
  if (agent.lastObservedAt) sanitized.lastObservedAt = agent.lastObservedAt;

  return sanitized;
}

function sanitizeDoctorCheck(check: DoctorCheck): DoctorJsonCheck {
  const sanitized: DoctorJsonCheck = {
    id: redactLocalPaths(check.id),
    provider: check.provider,
    agent: check.agent,
    label: check.label,
    status: check.status,
    message: redactLocalPaths(check.message),
    observedAt: check.observedAt
  };

  if (check.detail) sanitized.detail = redactLocalPaths(check.detail);

  return sanitized;
}

function redactLocalPaths(value: string): string {
  return value
    .replace(/[A-Za-z]:\\[^\s)"]+/g, "<local-path>")
    .replace(/\/(?:Users|home)\/[^\s)"]+/g, "<local-path>")
    .replace(/~\/[^\s)"]+/g, "<local-path>");
}

function formatRefreshResult(result: RefreshResult): string {
  const lines = [
    "Refresh:",
    `  Observed: ${result.observedAt}`,
    `  Saved: ${result.snapshotsSaved} snapshots / ${result.usageEventsSaved} usage events / ${result.doctorChecksSaved} doctor checks / ${result.resetEventsSaved} reset events`,
    `  Adapters: ${result.adapterCount}`
  ];

  if (result.errors.length > 0) {
    lines.push("  Errors:");
    lines.push(...result.errors.map((error) => `    - ${error}`));
  }

  return lines.join("\n");
}

function formatRealDataReadiness(input: DoctorReportInput): string {
  const readiness = buildRealDataReadiness(input);
  const lines = [
    "Real-data readiness:",
    `  Overall: ${readiness.ok ? "ready" : "not ready"}`
  ];

  for (const check of readiness.checks) {
    lines.push(`  - [${check.status}] ${check.displayName}: ${check.message}`);

    if (check.action) {
      lines.push(`    Next: ${check.action}`);
    }
  }

  return lines.join("\n");
}

function formatAgent(
  agent: AgentSummary,
  checks: readonly DoctorCheck[]
): string[] {
  const lines = [
    `${agent.displayName} (${agent.agent})`,
    `  Status: ${agent.status} / doctor ${agent.doctorStatus}`
  ];

  if (agent.snapshots.length > 0) {
    lines.push("  Quota:");
    lines.push(...agent.snapshots.map((snapshot) => `    - ${formatSnapshot(snapshot)}`));
  } else if (agent.emptyState) {
    lines.push(`  State: ${agent.emptyState.title}`);
    lines.push(`  Detail: ${agent.emptyState.detail}`);
    lines.push(`  Next: ${agent.emptyState.action}`);
  } else {
    lines.push("  State: No quota data yet");
  }

  const agentChecks = checks.filter(
    (check) => check.provider === agent.provider && check.agent === agent.agent
  );

  if (agentChecks.length > 0) {
    lines.push("  Checks:");
    lines.push(
      ...agentChecks.map((check) => {
        const detail = check.detail ? ` (${check.detail})` : "";
        return `    - [${check.status}] ${check.label}: ${check.message}${detail}`;
      })
    );
  }

  return lines;
}

function formatSnapshot(snapshot: QuotaSnapshotView | QuotaSnapshot): string {
  const freshness =
    "freshness" in snapshot
      ? snapshot.freshness.label
      : snapshot.stale
        ? "marked stale by source"
        : "fresh";
  const parts = [
    `${windowLabel(snapshot.windowType)}: ${formatRemaining(snapshot)}`,
    snapshot.resetAt ? `resets ${snapshot.resetAt}` : "reset unknown",
    `${snapshot.source}/${snapshot.confidence}`,
    freshness,
    `observed ${snapshot.observedAt}`
  ];

  return parts.join(" / ");
}

function formatRemaining(snapshot: QuotaSnapshot): string {
  if (typeof snapshot.remainingPercent === "number") {
    return `${Math.round(snapshot.remainingPercent)}% remaining`;
  }

  if (typeof snapshot.remaining === "number") {
    return `${snapshot.remaining} ${snapshot.unit} remaining`;
  }

  return `unknown ${snapshot.unit} remaining`;
}

function windowLabel(windowType: string): string {
  const labels: Record<string, string> = {
    billing_cycle: "Billing cycle",
    credits: "Credits",
    daily: "Daily",
    monthly: "Monthly",
    session_5h: "5h window",
    weekly: "Weekly"
  };

  return labels[windowType] ?? windowType;
}
