import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { parseCodexQuotaSnapshots } from "../adapters/codex/parse-quota-snapshot.js";
import { defaultCodexManualSnapshotPath } from "../config/paths.js";
import type {
  ConfidenceLevel,
  DoctorStatus,
  QuotaSnapshot,
  SourceKind
} from "../core/types.js";
import { isSnapshotExpired } from "../core/quota-state.js";

const maxSnapshotBytes = 256 * 1024;

export type CodexSnapshotReadiness =
  | "ready"
  | "not_recorded"
  | "expired"
  | "needs_attention";

export type CodexSnapshotSetupCheck = {
  id: string;
  label: string;
  status: DoctorStatus;
  message: string;
  detail?: string;
  action?: string;
};

export type CodexSnapshotSetupStatus = {
  snapshotPath: string;
  snapshotExists: boolean;
  latestHasQuota: boolean;
  latestObservedAt?: string;
  latestAgeSeconds?: number;
  latestRemainingPercent?: number;
  latestUsedPercent?: number;
  latestResetAt?: string;
  latestExpiresAt?: string;
  latestSource?: SourceKind;
  latestConfidence?: ConfidenceLevel;
  readiness: CodexSnapshotReadiness;
  readinessLabel: string;
  nextAction: string;
  checks: CodexSnapshotSetupCheck[];
  writeCommand: string;
  helpCommand: string;
  savedFields: string[];
  notSavedFields: string[];
};

export type CodexSnapshotSetupStatusOptions = {
  now?: Date;
  snapshotPath?: string;
};

export async function getCodexSnapshotSetupStatus(
  options: CodexSnapshotSetupStatusOptions = {}
): Promise<CodexSnapshotSetupStatus> {
  const now = options.now ?? new Date();
  const snapshotPath = options.snapshotPath ?? defaultCodexManualSnapshotPath();
  const latest = await readLatestCodexSnapshot(snapshotPath, now);
  const latestAgeSeconds = latest.snapshot?.observedAt
    ? secondsSince(latest.snapshot.observedAt, now)
    : undefined;
  const writeCommand =
    "node dist/index.js codex snapshot --remaining-percent <0-100> --reset-at <iso-time>";
  const status: CodexSnapshotSetupStatus = {
    snapshotPath,
    snapshotExists: existsSync(snapshotPath),
    latestHasQuota: Boolean(latest.snapshot),
    readiness: "not_recorded",
    readinessLabel: "No Codex snapshot yet",
    nextAction: writeCommand,
    checks: [],
    writeCommand,
    helpCommand: "node dist/index.js codex snapshot --help",
    savedFields: [
      "remaining_percent",
      "used_percent",
      "reset_at",
      "observed_at",
      "plan_label"
    ],
    notSavedFields: [
      "prompts",
      "responses",
      "source code",
      "cookies",
      "session tokens",
      "account identifiers"
    ]
  };

  if (latest.snapshot) {
    status.latestObservedAt = latest.snapshot.observedAt;
    status.latestSource = latest.snapshot.source;
    status.latestConfidence = latest.snapshot.confidence;

    if (typeof latest.snapshot.remainingPercent === "number") {
      status.latestRemainingPercent = latest.snapshot.remainingPercent;
    }

    if (typeof latest.snapshot.usedPercent === "number") {
      status.latestUsedPercent = latest.snapshot.usedPercent;
    }

    if (latest.snapshot.resetAt) {
      status.latestResetAt = latest.snapshot.resetAt;
    }

    if (latest.snapshot.expiresAt) {
      status.latestExpiresAt = latest.snapshot.expiresAt;
    }
  }

  if (latestAgeSeconds !== undefined) {
    status.latestAgeSeconds = latestAgeSeconds;
  }

  const snapshotExpired = latest.snapshot
    ? isCodexSnapshotExpired(latest.snapshot, now)
    : false;
  const readinessInput: Parameters<typeof resolveReadiness>[0] = {
    snapshotExpired,
    status
  };

  if (latest.issue) {
    readinessInput.latestIssue = latest.issue;
  }

  const readiness = resolveReadiness(readinessInput);

  status.readiness = readiness.readiness;
  status.readinessLabel = readiness.readinessLabel;
  status.nextAction = readiness.nextAction;
  const setupChecksInput: Parameters<typeof buildSetupChecks>[0] = {
    snapshotExpired,
    status
  };

  if (latest.issue) {
    setupChecksInput.latestIssue = latest.issue;
  }

  status.checks = buildSetupChecks(setupChecksInput);

  return status;
}

function resolveReadiness(input: {
  latestIssue?: string;
  snapshotExpired: boolean;
  status: CodexSnapshotSetupStatus;
}): {
  readiness: CodexSnapshotReadiness;
  readinessLabel: string;
  nextAction: string;
} {
  if (!input.status.snapshotExists) {
    return {
      readiness: "not_recorded",
      readinessLabel: "No Codex snapshot yet",
      nextAction: input.status.writeCommand
    };
  }

  if (input.latestIssue || !input.status.latestHasQuota) {
    return {
      readiness: "needs_attention",
      readinessLabel: "Codex snapshot not usable",
      nextAction: input.status.writeCommand
    };
  }

  if (input.snapshotExpired) {
    return {
      readiness: "expired",
      readinessLabel: "Codex snapshot expired",
      nextAction: input.status.writeCommand
    };
  }

  return {
    readiness: "ready",
    readinessLabel: "Ready for manual Codex quota data",
    nextAction: "Refresh the dashboard to load the latest Codex snapshot."
  };
}

function buildSetupChecks(input: {
  latestIssue?: string;
  snapshotExpired: boolean;
  status: CodexSnapshotSetupStatus;
}): CodexSnapshotSetupCheck[] {
  return [
    buildSnapshotFileCheck(input.status),
    buildSnapshotParseCheck(input),
    buildSnapshotFreshnessCheck(input)
  ];
}

function buildSnapshotFileCheck(
  status: CodexSnapshotSetupStatus
): CodexSnapshotSetupCheck {
  if (!status.snapshotExists) {
    return {
      id: "manual-snapshot-file",
      label: "Snapshot file",
      status: "warn",
      message: "Not recorded",
      detail: status.snapshotPath,
      action: status.writeCommand
    };
  }

  return {
    id: "manual-snapshot-file",
    label: "Snapshot file",
    status: "pass",
    message: "Found",
    detail: status.snapshotPath
  };
}

function buildSnapshotParseCheck(input: {
  latestIssue?: string;
  status: CodexSnapshotSetupStatus;
}): CodexSnapshotSetupCheck {
  if (!input.status.snapshotExists) {
    return {
      id: "manual-snapshot-parse",
      label: "Snapshot content",
      status: "info",
      message: "Waiting for snapshot file",
      action: input.status.writeCommand
    };
  }

  if (input.latestIssue) {
    return {
      id: "manual-snapshot-parse",
      label: "Snapshot content",
      status: "warn",
      message: "Could not read quota",
      detail: input.latestIssue,
      action: input.status.writeCommand
    };
  }

  if (!input.status.latestHasQuota) {
    return {
      id: "manual-snapshot-parse",
      label: "Snapshot content",
      status: "warn",
      message: "No supported Codex quota fields",
      detail: input.status.snapshotPath,
      action: input.status.writeCommand
    };
  }

  return {
    id: "manual-snapshot-parse",
    label: "Snapshot content",
    status: "pass",
    message: "Quota fields parsed",
    detail: formatLatestSnapshotDetail(input.status)
  };
}

function buildSnapshotFreshnessCheck(input: {
  snapshotExpired: boolean;
  status: CodexSnapshotSetupStatus;
}): CodexSnapshotSetupCheck {
  if (!input.status.latestHasQuota) {
    return {
      id: "manual-snapshot-freshness",
      label: "Freshness",
      status: "info",
      message: "Waiting for a usable snapshot",
      action: input.status.writeCommand
    };
  }

  if (input.snapshotExpired) {
    const check: CodexSnapshotSetupCheck = {
      id: "manual-snapshot-freshness",
      label: "Freshness",
      status: "warn",
      message: "Expired at reported reset time",
      action: input.status.writeCommand
    };
    const detail = input.status.latestExpiresAt ?? input.status.latestResetAt;

    if (detail) {
      check.detail = detail;
    }

    return check;
  }

  const check: CodexSnapshotSetupCheck = {
    id: "manual-snapshot-freshness",
    label: "Freshness",
    status: "pass",
    message: "Usable until reported reset"
  };
  const detail = input.status.latestExpiresAt ?? input.status.latestResetAt;

  if (detail) {
    check.detail = detail;
  }

  return check;
}

type LatestCodexSnapshotStatus = {
  issue?: string;
  snapshot?: QuotaSnapshot;
};

async function readLatestCodexSnapshot(
  path: string,
  now: Date
): Promise<LatestCodexSnapshotStatus> {
  try {
    const fileStats = await stat(path);

    if (!fileStats.isFile()) {
      return {
        issue: "Snapshot path is not a file."
      };
    }

    if (fileStats.size > maxSnapshotBytes) {
      return {
        issue: "Snapshot file is too large."
      };
    }

    const raw = await readFile(path, "utf8");
    const snapshots = parseCodexQuotaSnapshots(raw, {
      observedAt: now,
      rawSourceRef: path
    }).sort((left, right) => {
      return Date.parse(right.observedAt) - Date.parse(left.observedAt);
    });

    const snapshot = snapshots[0];

    return snapshot ? { snapshot } : {};
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        issue: "Snapshot JSON could not be parsed."
      };
    }

    return {};
  }
}

function formatLatestSnapshotDetail(status: CodexSnapshotSetupStatus): string {
  const parts = [
    typeof status.latestRemainingPercent === "number"
      ? `remaining ${status.latestRemainingPercent}%`
      : undefined,
    status.latestResetAt ? `reset ${status.latestResetAt}` : undefined,
    status.latestObservedAt ? `observed ${status.latestObservedAt}` : undefined,
    status.latestSource ? `source ${status.latestSource}` : undefined
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : status.snapshotPath;
}

function secondsSince(value: string, now: Date): number | undefined {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.round((now.getTime() - parsed) / 1000));
}

function isCodexSnapshotExpired(snapshot: QuotaSnapshot, now: Date): boolean {
  if (isSnapshotExpired(snapshot, now)) {
    return true;
  }

  return snapshot.resetAt ? Date.parse(snapshot.resetAt) <= now.getTime() : false;
}
