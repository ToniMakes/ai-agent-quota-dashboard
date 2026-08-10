import type {
  AgentEmptyState,
  AgentManifest,
  DoctorCheck,
  DoctorStatus,
  QuotaSnapshot,
  QuotaSnapshotView,
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

export function describeSnapshotFreshness(
  snapshot: QuotaSnapshot,
  now = new Date()
): QuotaSnapshotView["freshness"] {
  if (snapshot.stale) {
    return {
      status: "stale",
      reason: "source_marked_stale",
      label: "marked stale by source"
    };
  }

  if (isSnapshotExpired(snapshot, now)) {
    return {
      status: "stale",
      reason: "expired",
      label: "expired observation"
    };
  }

  return {
    status: "fresh",
    reason: "fresh",
    label: "fresh"
  };
}

export function withSnapshotFreshness(
  snapshot: QuotaSnapshot,
  now = new Date()
): QuotaSnapshotView {
  return {
    ...snapshot,
    freshness: describeSnapshotFreshness(snapshot, now)
  };
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

export function choosePrimarySnapshot<TSnapshot extends QuotaSnapshot>(
  snapshots: TSnapshot[],
  now = new Date()
): TSnapshot | undefined {
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
      action:
        manifest.agent === "codex"
          ? supportedSourceAction(manifest.agent)
          : `Add a scan root with: node dist/index.js config path add ${manifest.agent} <path>`
    };
  }

  if (quotaSource?.message.includes("No supported")) {
    const statuslineEmptyState = describeClaudeStatuslineEmptyState(
      manifest,
      checks
    );

    if (statuslineEmptyState) {
      return statuslineEmptyState;
    }

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

function describeClaudeStatuslineEmptyState(
  manifest: AgentManifest,
  checks: DoctorCheck[]
): AgentEmptyState | undefined {
  if (manifest.agent !== "claude-code") {
    return undefined;
  }

  const commandCheck = checks.find(
    (check) => check.id === "claude-code:statusline:statusline-command"
  );
  const shimCheck = checks.find(
    (check) => check.id === "claude-code:statusline:shim"
  );
  const latestCheck = checks.find(
    (check) => check.id === "claude-code:statusline:latest-snapshot"
  );

  if (
    commandCheck?.status !== "pass" ||
    shimCheck?.status !== "pass" ||
    latestCheck?.status === "pass"
  ) {
    return undefined;
  }

  return {
    reason: "waiting_for_statusline_data",
    title: "Waiting for Claude Code data",
    detail: claudeStatuslineWaitingDetail(latestCheck),
    action:
      "Open Claude Code, let the statusline render once, then run node dist/index.js doctor"
  };
}

function claudeStatuslineWaitingDetail(
  latestCheck: DoctorCheck | undefined
): string {
  if (latestCheck?.message.includes("Snapshot has no supported rate_limits")) {
    return "Claude Code is calling the statusline sink, but the latest payload did not include supported rate_limits fields.";
  }

  if (latestCheck?.message.includes("Latest snapshot could not be used")) {
    return "Claude Code is calling the statusline sink, but the latest sanitized snapshot could not be parsed.";
  }

  return "Claude Code is configured to call the AIQD statusline sink, but no supported rate_limits snapshot has been received yet.";
}

function supportedSourceAction(agent: string): string {
  if (agent === "claude-code") {
    return "Set up Claude Code statusline: node dist/index.js setup claude-statusline --write";
  }

  if (agent === "codex") {
    return "Use Codex once and refresh; if no local CLI rate_limits are found, record a visible fallback with node dist/index.js codex snapshot --remaining-percent <0-100> --reset-at <iso-time>";
  }

  return "Add a supported local quota source, then refresh.";
}
