import type {
  AgentEmptyState,
  AgentManifest,
  DoctorCheck,
  DoctorStatus,
  QuotaSnapshot,
  QuotaStatus
} from "./types.js";

const statusSeverity: Record<QuotaStatus, number> = {
  critical: 5,
  warning: 4,
  stale: 3,
  unknown: 2,
  healthy: 1
};

const doctorSeverity: Record<DoctorStatus, number> = {
  fail: 4,
  warn: 3,
  info: 2,
  pass: 1
};

export function isSnapshotExpired(
  snapshot: QuotaSnapshot,
  now = new Date()
): boolean {
  if (!snapshot.expiresAt) {
    return false;
  }

  return Date.parse(snapshot.expiresAt) <= now.getTime();
}

export function resolveQuotaStatus(
  snapshot: QuotaSnapshot | undefined,
  now = new Date()
): QuotaStatus {
  if (!snapshot) {
    return "unknown";
  }

  if (snapshot.stale || isSnapshotExpired(snapshot, now)) {
    return "stale";
  }

  if (typeof snapshot.remainingPercent !== "number") {
    return "unknown";
  }

  if (snapshot.remainingPercent <= 10) {
    return "critical";
  }

  if (snapshot.remainingPercent <= 20) {
    return "warning";
  }

  return "healthy";
}

export function choosePrimarySnapshot(
  snapshots: QuotaSnapshot[],
  now = new Date()
): QuotaSnapshot | undefined {
  return [...snapshots].sort((left, right) => {
    const leftStatus = resolveQuotaStatus(left, now);
    const rightStatus = resolveQuotaStatus(right, now);
    const severityDelta = statusSeverity[rightStatus] - statusSeverity[leftStatus];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    const leftRemaining = left.remainingPercent ?? Number.POSITIVE_INFINITY;
    const rightRemaining = right.remainingPercent ?? Number.POSITIVE_INFINITY;

    if (leftRemaining !== rightRemaining) {
      return leftRemaining - rightRemaining;
    }

    const leftReset = left.resetAt ? Date.parse(left.resetAt) : Number.POSITIVE_INFINITY;
    const rightReset = right.resetAt ? Date.parse(right.resetAt) : Number.POSITIVE_INFINITY;

    return leftReset - rightReset;
  })[0];
}

export function resolveDoctorStatus(checks: DoctorCheck[]): DoctorStatus {
  return checks.reduce<DoctorStatus>((current, check) => {
    return doctorSeverity[check.status] > doctorSeverity[current]
      ? check.status
      : current;
  }, "pass");
}

export function mostSevereStatus(
  snapshots: QuotaSnapshot[],
  now = new Date()
): QuotaStatus {
  const primary = choosePrimarySnapshot(snapshots, now);
  return resolveQuotaStatus(primary, now);
}

export function describeEmptyQuotaState(
  manifest: AgentManifest,
  snapshots: QuotaSnapshot[],
  checks: DoctorCheck[]
): AgentEmptyState | undefined {
  if (snapshots.length > 0) {
    return undefined;
  }

  const adapterError = checks.find(
    (check) => check.label === "Adapter" && check.status === "fail"
  );

  if (adapterError) {
    return {
      reason: "adapter_error",
      title: "Adapter scan failed",
      detail: adapterError.detail ?? adapterError.message,
      action: "Open Doctor for the failing adapter check."
    };
  }

  const quotaSource = checks.find((check) => check.label === "Quota source");

  if (quotaSource?.message.includes("No readable")) {
    return {
      reason: "no_readable_paths",
      title: "No readable data path",
      detail:
        "The dashboard checked the default and configured scan roots, but none were readable.",
      action: `Add a scan root with: node dist/index.js config path add ${manifest.agent} <path>`
    };
  }

  if (quotaSource?.message.includes("No supported")) {
    return {
      reason: "no_supported_source",
      title: "No supported quota source",
      detail:
        "At least one data path is readable, but no supported quota/statusline snapshot was found.",
      action: supportedSourceAction(manifest.agent)
    };
  }

  return {
    reason: "no_quota_data",
    title: "No quota data yet",
    detail: "The latest refresh did not produce a quota snapshot for this agent.",
    action: "Open Doctor for source checks and refresh history."
  };
}

function supportedSourceAction(agent: string): string {
  if (agent === "claude-code") {
    return "Set up Claude Code statusline: node dist/index.js setup claude-statusline --write";
  }

  if (agent === "codex") {
    return "Codex currently requires an explicit structured quota/status/usage-limits snapshot.";
  }

  return "Add a supported local quota source, then refresh.";
}
