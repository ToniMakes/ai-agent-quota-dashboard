import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  defaultClaudeSettingsPath,
  defaultClaudeStatuslineHistoryPath,
  defaultClaudeStatuslineLatestPath,
  defaultClaudeStatuslineShimPath
} from "../config/paths.js";
import { isRecord } from "../adapters/parse-utils.js";

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
  latestHasRateLimits: boolean;
  historyPath: string;
  historyExists: boolean;
  previewCommand: string;
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
};

export async function getClaudeStatuslineSetupStatus(
  options: ClaudeStatuslineSetupStatusOptions = {}
): Promise<ClaudeStatuslineSetupStatus> {
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
    historyPath,
    historyExists: existsSync(historyPath),
    previewCommand: "node dist/index.js setup claude-statusline",
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

  return status;
}

async function readSettings(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function readLatestSnapshot(path: string): Promise<{
  hasRateLimits: boolean;
  observedAt?: string;
}> {
  try {
    const fileStats = await stat(path);

    if (!fileStats.isFile() || fileStats.size > 256 * 1024) {
      return { hasRateLimits: false };
    }

    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      return { hasRateLimits: false };
    }

    const result = {
      hasRateLimits: isRecord(parsed.rate_limits)
    };

    if (typeof parsed.observed_at === "string") {
      return {
        ...result,
        observedAt: parsed.observed_at
      };
    }

    return result;
  } catch {
    return { hasRateLimits: false };
  }
}
