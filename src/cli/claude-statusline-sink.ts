import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  defaultClaudeStatuslineHistoryPath,
  defaultClaudeStatuslineLatestPath
} from "../config/paths.js";
import type { QuotaSnapshot } from "../core/types.js";
import { parseClaudeCodeStatusline } from "../adapters/claude-code/parse-statusline.js";
import { isRecord } from "../adapters/parse-utils.js";

export type ClaudeStatuslineSinkOptions = {
  input: string;
  now?: Date;
  historyPath?: string;
  latestPath?: string;
};

export type ClaudeStatuslineSinkResult = {
  snapshots: QuotaSnapshot[];
  statusText: string;
  wroteSnapshot: boolean;
};

export type ClaudeStatuslineSinkSelfTestResult = {
  ok: boolean;
  message: string;
  statusText: string;
  windows: string[];
};

type SanitizedClaudeStatuslineRecord = {
  type: "claude_code_statusline_rate_limits";
  observed_at: string;
  rate_limits: Record<string, unknown>;
};

export async function runClaudeStatuslineSink(
  options: ClaudeStatuslineSinkOptions
): Promise<ClaudeStatuslineSinkResult> {
  const now = options.now ?? new Date();
  const snapshots = parseClaudeCodeStatusline(options.input, {
    observedAt: now,
    rawSourceRef: options.latestPath ?? defaultClaudeStatuslineLatestPath()
  });
  const statusText = formatClaudeStatusline(snapshots);

  if (snapshots.length === 0) {
    return {
      snapshots,
      statusText,
      wroteSnapshot: false
    };
  }

  const sanitizedRecord = buildSanitizedClaudeStatuslineRecord(
    options.input,
    now
  );

  if (!sanitizedRecord) {
    return {
      snapshots,
      statusText,
      wroteSnapshot: false
    };
  }

  const latestPath = options.latestPath ?? defaultClaudeStatuslineLatestPath();
  const historyPath = options.historyPath ?? defaultClaudeStatuslineHistoryPath();
  const serialized = `${JSON.stringify(sanitizedRecord)}\n`;

  await mkdir(dirname(latestPath), { recursive: true });
  await writeFile(latestPath, JSON.stringify(sanitizedRecord, null, 2));
  await appendFile(historyPath, serialized);

  return {
    snapshots,
    statusText,
    wroteSnapshot: true
  };
}

export async function runClaudeStatuslineSinkSelfTest(
  now = new Date()
): Promise<ClaudeStatuslineSinkSelfTestResult> {
  const directory = await mkdtemp(join(tmpdir(), "aiqd-claude-statusline-"));
  const latestPath = join(directory, "latest.json");
  const historyPath = join(directory, "history.jsonl");

  try {
    const result = await runClaudeStatuslineSink({
      input: buildClaudeStatuslineSelfTestInput(now),
      now,
      latestPath,
      historyPath
    });
    const latest = await readFile(latestPath, "utf8");
    const history = await readFile(historyPath, "utf8");
    const windows = result.snapshots.map((snapshot) => snapshot.windowType);
    const ok =
      result.wroteSnapshot &&
      windows.includes("session_5h") &&
      windows.includes("weekly") &&
      latest.includes("rate_limits") &&
      history.includes("rate_limits") &&
      !latest.includes("self-test-do-not-store") &&
      !history.includes("self-test-do-not-store");

    return {
      ok,
      message: ok
        ? "Claude statusline sink self-test passed. No real Claude Code data was read."
        : "Claude statusline sink self-test failed.",
      statusText: result.statusText,
      windows
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

export function buildClaudeStatuslineSelfTestInput(now = new Date()): string {
  return JSON.stringify({
    session_id: "self-test-do-not-store",
    transcript_path: "self-test-do-not-store",
    workspace: {
      current_dir: "self-test-do-not-store"
    },
    rate_limits: {
      five_hour: {
        used_percentage: 12,
        remaining_percentage: 88,
        resets_at: secondsFromNow(now, 3 * 60 * 60)
      },
      seven_day: {
        used_percentage: 34,
        remaining_percentage: 66,
        resets_at: secondsFromNow(now, 4 * 24 * 60 * 60)
      }
    }
  });
}

export function buildSanitizedClaudeStatuslineRecord(
  input: string,
  now = new Date()
): SanitizedClaudeStatuslineRecord | undefined {
  let payload: unknown;

  try {
    payload = JSON.parse(input);
  } catch {
    return undefined;
  }

  if (!isRecord(payload) || !isRecord(payload.rate_limits)) {
    return undefined;
  }

  return {
    type: "claude_code_statusline_rate_limits",
    observed_at: now.toISOString(),
    rate_limits: sanitizeRateLimits(payload.rate_limits)
  };
}

export function formatClaudeStatusline(snapshots: QuotaSnapshot[]): string {
  if (snapshots.length === 0) {
    return "Claude quota: waiting for rate limit data";
  }

  const parts = snapshots.map((snapshot) => {
    const label =
      snapshot.windowType === "session_5h"
        ? "5h"
        : snapshot.windowType === "weekly"
          ? "7d"
          : snapshot.windowType;
    const used =
      typeof snapshot.usedPercent === "number"
        ? `${Math.round(snapshot.usedPercent)}% used`
        : "usage unknown";
    const reset = snapshot.resetAt
      ? `reset ${formatRelative(snapshot.resetAt)}`
      : "reset unknown";

    return `${label} ${used}, ${reset}`;
  });

  return `Claude quota: ${parts.join(" | ")}`;
}

function sanitizeRateLimits(
  rateLimits: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const key of ["five_hour", "seven_day", "daily"]) {
    const value = rateLimits[key];

    if (!isRecord(value)) {
      continue;
    }

    const windowRecord: Record<string, unknown> = {};

    for (const field of [
      "used_percentage",
      "remaining_percentage",
      "resets_at",
      "reset_at"
    ]) {
      if (
        typeof value[field] === "number" ||
        typeof value[field] === "string"
      ) {
        windowRecord[field] = value[field];
      }
    }

    if (Object.keys(windowRecord).length > 0) {
      sanitized[key] = windowRecord;
    }
  }

  return sanitized;
}

function formatRelative(value: string): string {
  const deltaSeconds = Math.round((Date.parse(value) - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const units: Array<[string, number]> = [
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60]
  ];

  for (const [unit, seconds] of units) {
    if (absoluteSeconds >= seconds) {
      const amount = Math.round(deltaSeconds / seconds);
      return amount >= 0 ? `in ${amount}${unit}` : `${Math.abs(amount)}${unit} ago`;
    }
  }

  return deltaSeconds >= 0 ? "soon" : "just now";
}

function secondsFromNow(now: Date, deltaSeconds: number): number {
  return Math.round(now.getTime() / 1000) + deltaSeconds;
}
