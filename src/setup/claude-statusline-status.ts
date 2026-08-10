import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  defaultClaudeSettingsPath,
  defaultClaudeStatuslineHistoryPath,
  defaultClaudeStatuslineLatestPath,
  defaultClaudeStatuslineShimPath
} from "../config/paths.js";
import { isRecord } from "../adapters/parse-utils.js";
import type { DoctorCheck, DoctorStatus, QuotaWindowType } from "../core/types.js";

const freshStatuslineSnapshotSeconds = 6 * 60 * 60;

export type ClaudeStatuslineReadiness =
  | "ready"
  | "needs_setup"
  | "waiting_for_data"
  | "needs_attention";

export type ClaudeStatuslineSetupCheck = {
  id: string;
  label: string;
  status: DoctorStatus;
  message: string;
  detail?: string;
  action?: string;
};

export type ClaudeStatuslineSetupStatus = {
  settingsPath: string;
  settingsExists: boolean;
  statusLineConfigured: boolean;
  statusLineCommand?: string;
  statusLineManagedByApp: boolean;
  shimPath: string;
  shimExists: boolean;
  latestPath: string;
  latestExists: boolean;
  latestObservedAt?: string;
  latestAgeSeconds?: number;
  latestHasRateLimits: boolean;
  latestWindowTypes: QuotaWindowType[];
  historyPath: string;
  historyExists: boolean;
  readiness: ClaudeStatuslineReadiness;
  readinessLabel: string;
  nextAction: string;
  checks: ClaudeStatuslineSetupCheck[];
  previewCommand: string;
  selfTestCommand: string;
  writeCommand: string;
  forceWriteCommand: string;
  savedFields: string[];
  notSavedFields: string[];
};

export type ClaudeStatuslineSetupStatusOptions = {
  settingsPath?: string;
  shimPath?: string;
  latestPath?: string;
  historyPath?: string;
  now?: Date;
};

export async function getClaudeStatuslineSetupStatus(
  options: ClaudeStatuslineSetupStatusOptions = {}
): Promise<ClaudeStatuslineSetupStatus> {
  const now = options.now ?? new Date();
  const settingsPath = options.settingsPath ?? defaultClaudeSettingsPath();
  const shimPath = options.shimPath ?? defaultClaudeStatuslineShimPath();
  const latestPath = options.latestPath ?? defaultClaudeStatuslineLatestPath();
  const historyPath = options.historyPath ?? defaultClaudeStatuslineHistoryPath();
  const settings = await readSettings(settingsPath);
  const statusLine = settings && isRecord(settings.statusLine)
    ? settings.statusLine
    : undefined;
  const statusLineCommand =
    typeof statusLine?.command === "string" ? statusLine.command : undefined;
  const latest = await readLatestSnapshot(latestPath);
  const latestAgeSeconds = latest.observedAt
    ? secondsSince(latest.observedAt, now)
    : undefined;
  const latestFresh =
    latestAgeSeconds !== undefined &&
    latestAgeSeconds <= freshStatuslineSnapshotSeconds;

  const status: ClaudeStatuslineSetupStatus = {
    settingsPath,
    settingsExists: existsSync(settingsPath),
    statusLineConfigured: Boolean(statusLine),
    statusLineManagedByApp: statusLineCommand
      ? statusLineCommand.includes("claude-statusline")
      : false,
    shimPath,
    shimExists: existsSync(shimPath),
    latestPath,
    latestExists: existsSync(latestPath),
    latestHasRateLimits: latest.hasRateLimits,
    latestWindowTypes: latest.windowTypes,
    historyPath,
    historyExists: existsSync(historyPath),
    readiness: "needs_setup",
    readinessLabel: "Setup required",
    nextAction: "Run the install command, then open Claude Code.",
    checks: [],
    previewCommand: "node dist/index.js setup claude-statusline",
    selfTestCommand: "node dist/index.js claude-statusline-sink --self-test",
    writeCommand: "node dist/index.js setup claude-statusline --write",
    forceWriteCommand:
      "node dist/index.js setup claude-statusline --write --force",
    savedFields: [
      "rate_limits.five_hour.used_percentage",
      "rate_limits.five_hour.resets_at",
      "rate_limits.seven_day.used_percentage",
      "rate_limits.seven_day.resets_at"
    ],
    notSavedFields: [
      "prompts",
      "responses",
      "source code",
      "transcript paths",
      "workspace paths",
      "session identifiers"
    ]
  };

  if (statusLineCommand) {
    status.statusLineCommand = statusLineCommand;
  }

  if (latest.observedAt) {
    status.latestObservedAt = latest.observedAt;
  }

  if (latestAgeSeconds !== undefined) {
    status.latestAgeSeconds = latestAgeSeconds;
  }

  const readinessInput: Parameters<typeof resolveReadiness>[0] = {
    latestFresh,
    status
  };
  if (latest.issue !== undefined) {
    readinessInput.latestIssue = latest.issue;
  }
  const readiness = resolveReadiness(readinessInput);

  const setupChecksInput: Parameters<typeof buildSetupChecks>[0] = {
    latest,
    latestFresh,
    status
  };
  if (latestAgeSeconds !== undefined) {
    setupChecksInput.latestAgeSeconds = latestAgeSeconds;
  }

  status.readiness = readiness.readiness;
  status.readinessLabel = readiness.readinessLabel;
  status.nextAction = readiness.nextAction;
  status.checks = buildSetupChecks(setupChecksInput);

  return status;
}

export function claudeStatuslineChecksToDoctorChecks(
  status: ClaudeStatuslineSetupStatus,
  observedAt = new Date()
): DoctorCheck[] {
  return status.checks.map((check) => {
    const doctorCheck = {
      id: `claude-code:statusline:${check.id}`,
      provider: "anthropic",
      agent: "claude-code",
      label: check.label,
      status: check.status,
      message: check.message,
      observedAt: observedAt.toISOString()
    };

    if (check.detail || check.action) {
      return {
        ...doctorCheck,
        detail: [check.detail, check.action].filter(Boolean).join(" Next: ")
      };
    }

    return doctorCheck;
  });
}

function resolveReadiness(input: {
  latestFresh: boolean;
  latestIssue?: string;
  status: ClaudeStatuslineSetupStatus;
}): {
  readiness: ClaudeStatuslineReadiness;
  readinessLabel: string;
  nextAction: string;
} {
  if (!input.status.statusLineManagedByApp || !input.status.shimExists) {
    return {
      readiness: "needs_setup",
      readinessLabel: "Setup required",
      nextAction: input.status.writeCommand
    };
  }

  if (!input.status.latestExists || !input.status.latestHasRateLimits) {
    return {
      readiness: "waiting_for_data",
      readinessLabel: "Waiting for Claude Code data",
      nextAction:
        "Open Claude Code, let the statusline render once, then refresh this dashboard."
    };
  }

  if (input.latestIssue || !input.latestFresh) {
    return {
      readiness: "needs_attention",
      readinessLabel: "Statusline data needs attention",
      nextAction:
        "Open Claude Code to refresh the statusline snapshot, then run doctor again."
    };
  }

  return {
    readiness: "ready",
    readinessLabel: "Ready for real Claude Code quota data",
    nextAction: "Refresh the dashboard to load the latest statusline quota."
  };
}

function buildSetupChecks(input: {
  latest: LatestSnapshotStatus;
  latestAgeSeconds?: number;
  latestFresh: boolean;
  status: ClaudeStatuslineSetupStatus;
}): ClaudeStatuslineSetupCheck[] {
  return [
    buildSettingsCheck(input.status),
    buildStatusLineCommandCheck(input.status),
    buildShimCheck(input.status),
    buildLatestSnapshotCheck(input)
  ];
}

function buildSettingsCheck(
  status: ClaudeStatuslineSetupStatus
): ClaudeStatuslineSetupCheck {
  if (!status.settingsExists) {
    return {
      id: "settings-file",
      label: "Claude settings",
      status: "warn",
      message: "Settings file not found",
      detail: status.settingsPath,
      action: status.writeCommand
    };
  }

  return {
    id: "settings-file",
    label: "Claude settings",
    status: "pass",
    message: "Settings file found",
    detail: status.settingsPath
  };
}

function buildStatusLineCommandCheck(
  status: ClaudeStatuslineSetupStatus
): ClaudeStatuslineSetupCheck {
  if (status.statusLineManagedByApp) {
    const check: ClaudeStatuslineSetupCheck = {
      id: "statusline-command",
      label: "Statusline command",
      status: "pass",
      message: "Managed by AIQD"
    };

    if (status.statusLineCommand !== undefined) {
      check.detail = status.statusLineCommand;
    }

    return check;
  }

  if (status.statusLineConfigured) {
    const check: ClaudeStatuslineSetupCheck = {
      id: "statusline-command",
      label: "Statusline command",
      status: "warn",
      message: "Configured by another command",
      action: status.forceWriteCommand
    };

    if (status.statusLineCommand !== undefined) {
      check.detail = status.statusLineCommand;
    }

    return check;
  }

  return {
    id: "statusline-command",
    label: "Statusline command",
    status: "warn",
    message: "Not configured",
    action: status.writeCommand
  };
}

function buildShimCheck(
  status: ClaudeStatuslineSetupStatus
): ClaudeStatuslineSetupCheck {
  if (status.shimExists) {
    return {
      id: "shim",
      label: "AIQD shim",
      status: "pass",
      message: "Shim file found",
      detail: status.shimPath
    };
  }

  return {
    id: "shim",
    label: "AIQD shim",
    status: "warn",
    message: "Shim file not found",
    detail: status.shimPath,
    action: status.previewCommand
  };
}

function buildLatestSnapshotCheck(input: {
  latest: LatestSnapshotStatus;
  latestAgeSeconds?: number;
  latestFresh: boolean;
  status: ClaudeStatuslineSetupStatus;
}): ClaudeStatuslineSetupCheck {
  if (!input.status.latestExists) {
    return {
      id: "latest-snapshot",
      label: "Latest snapshot",
      status: "warn",
      message: "No statusline snapshot received yet",
      detail: input.status.latestPath,
      action:
        "Open Claude Code, let the statusline render once, then refresh this dashboard."
    };
  }

  if (input.latest.issue) {
    return {
      id: "latest-snapshot",
      label: "Latest snapshot",
      status: "warn",
      message: "Latest snapshot could not be used",
      detail: input.latest.issue,
      action: "Run doctor again after Claude Code refreshes the statusline."
    };
  }

  if (!input.status.latestHasRateLimits) {
    return {
      id: "latest-snapshot",
      label: "Latest snapshot",
      status: "warn",
      message: "Snapshot has no supported rate_limits",
      detail: input.status.latestPath,
      action:
        "Open Claude Code, let the statusline render once with rate_limits, then refresh this dashboard."
    };
  }

  if (!input.latestFresh) {
    return {
      id: "latest-snapshot",
      label: "Latest snapshot",
      status: "warn",
      message:
        input.latestAgeSeconds === undefined
          ? "Rate limits were received, but observed time is missing"
          : "Rate limits were received, but the snapshot is old",
      detail: formatLatestSnapshotDetail(input),
      action: "Open Claude Code to refresh the statusline snapshot."
    };
  }

  return {
    id: "latest-snapshot",
    label: "Latest snapshot",
    status: "pass",
    message: "Fresh rate limits received",
    detail: formatLatestSnapshotDetail(input)
  };
}

async function readSettings(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(stripJsonBom(raw));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

type LatestSnapshotStatus = {
  hasRateLimits: boolean;
  issue?: string;
  observedAt?: string;
  windowTypes: QuotaWindowType[];
};

async function readLatestSnapshot(path: string): Promise<LatestSnapshotStatus> {
  try {
    const fileStats = await stat(path);

    if (!fileStats.isFile() || fileStats.size > 256 * 1024) {
      return {
        hasRateLimits: false,
        issue: "Latest snapshot is missing, not a file, or too large.",
        windowTypes: []
      };
    }

    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(stripJsonBom(raw));

    if (!isRecord(parsed)) {
      return {
        hasRateLimits: false,
        issue: "Latest snapshot is not a JSON object.",
        windowTypes: []
      };
    }

    const rateLimits = isRecord(parsed.rate_limits) ? parsed.rate_limits : undefined;
    const windowTypes = rateLimits ? readRateLimitWindowTypes(rateLimits) : [];
    const result = {
      hasRateLimits: windowTypes.length > 0,
      windowTypes
    };

    if (typeof parsed.observed_at === "string") {
      return {
        ...result,
        observedAt: parsed.observed_at
      };
    }

    return result;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        hasRateLimits: false,
        issue: "Latest snapshot JSON could not be parsed.",
        windowTypes: []
      };
    }

    return { hasRateLimits: false, windowTypes: [] };
  }
}

function stripJsonBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function readRateLimitWindowTypes(
  rateLimits: Record<string, unknown>
): QuotaWindowType[] {
  const windows: QuotaWindowType[] = [];

  if (hasSupportedRateLimitPayload(rateLimits.five_hour)) {
    windows.push("session_5h");
  }

  if (hasSupportedRateLimitPayload(rateLimits.seven_day)) {
    windows.push("weekly");
  }

  if (hasSupportedRateLimitPayload(rateLimits.daily)) {
    windows.push("daily");
  }

  return windows;
}

function hasSupportedRateLimitPayload(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return [
    "used_percentage",
    "usedPercentage",
    "remaining_percentage",
    "remainingPercentage"
  ].some((field) => typeof value[field] === "number");
}

function secondsSince(value: string, now: Date): number | undefined {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.round((now.getTime() - parsed) / 1000));
}

function formatLatestSnapshotDetail(input: {
  latestAgeSeconds?: number;
  status: ClaudeStatuslineSetupStatus;
}): string {
  const parts = [
    input.status.latestObservedAt
      ? `Observed at ${input.status.latestObservedAt}`
      : undefined,
    input.latestAgeSeconds !== undefined
      ? `age ${formatDuration(input.latestAgeSeconds)}`
      : undefined,
    input.status.latestWindowTypes.length > 0
      ? `windows ${input.status.latestWindowTypes.join(", ")}`
      : undefined
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : input.status.latestPath;
}

function formatDuration(seconds: number): string {
  if (seconds >= 86_400) {
    return `${Math.round(seconds / 86_400)}d`;
  }

  if (seconds >= 3_600) {
    return `${Math.round(seconds / 3_600)}h`;
  }

  if (seconds >= 60) {
    return `${Math.round(seconds / 60)}m`;
  }

  return `${seconds}s`;
}
