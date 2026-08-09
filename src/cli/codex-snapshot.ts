import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { defaultCodexManualSnapshotPath } from "../config/paths.js";

export type CodexManualSnapshotOptions = {
  observedAt?: string;
  outputPath: string;
  planLabel: string;
  remainingPercent?: number;
  resetAt: string;
  usedPercent?: number;
};

export type CodexManualSnapshotWriteResult = {
  outputPath: string;
  snapshot: CodexManualSnapshotDocument;
};

export type CodexManualSnapshotDocument = {
  type: "quota_snapshot";
  quota_snapshot: {
    agent: "codex";
    expires_at: string;
    observed_at: string;
    plan_label: string;
    provider: "openai";
    remaining_percent: number;
    reset_at: string;
    source: "manual";
    stale: false;
    unit: "percent";
    used_percent: number;
    window_type: "weekly";
  };
};

export function parseCodexManualSnapshotOptions(
  argv: string[],
  now = new Date()
): CodexManualSnapshotOptions {
  const remainingPercent = readPercentFlag(argv, "--remaining-percent");
  const usedPercent = readPercentFlag(argv, "--used-percent");
  const resetAt = parseRequiredDateFlag(argv, "--reset-at", "reset time");
  const observedAt = parseOptionalDateFlag(argv, "--observed-at");
  const effectiveObservedAt = observedAt ?? now.toISOString();
  const outputPath =
    readFlagValue(argv, "--output") ?? defaultCodexManualSnapshotPath();
  const planLabel =
    readFlagValue(argv, "--plan-label") ?? "Codex visible status";

  if (
    typeof remainingPercent !== "number" &&
    typeof usedPercent !== "number"
  ) {
    throw new Error("Provide --remaining-percent or --used-percent.");
  }

  if (
    typeof remainingPercent === "number" &&
    typeof usedPercent === "number" &&
    Math.abs(remainingPercent + usedPercent - 100) > 0.5
  ) {
    throw new Error(
      "--remaining-percent and --used-percent must add up to roughly 100."
    );
  }

  if (Date.parse(resetAt) <= Date.parse(effectiveObservedAt)) {
    throw new Error("--reset-at must be later than the observed time.");
  }

  const options: CodexManualSnapshotOptions = {
    outputPath,
    planLabel,
    remainingPercent:
      remainingPercent ?? roundPercent(100 - (usedPercent as number)),
    resetAt,
    usedPercent: usedPercent ?? roundPercent(100 - (remainingPercent as number))
  };

  if (observedAt) {
    options.observedAt = observedAt;
  }

  return options;
}

export function buildCodexManualSnapshot(
  options: CodexManualSnapshotOptions,
  now = new Date()
): CodexManualSnapshotDocument {
  const observedAt = options.observedAt ?? now.toISOString();
  const remainingPercent = roundPercent(options.remainingPercent ?? 0);
  const usedPercent = roundPercent(options.usedPercent ?? 100 - remainingPercent);

  return {
    type: "quota_snapshot",
    quota_snapshot: {
      agent: "codex",
      expires_at: options.resetAt,
      observed_at: observedAt,
      plan_label: options.planLabel,
      provider: "openai",
      remaining_percent: remainingPercent,
      reset_at: options.resetAt,
      source: "manual",
      stale: false,
      unit: "percent",
      used_percent: usedPercent,
      window_type: "weekly"
    }
  };
}

export async function writeCodexManualSnapshot(
  options: CodexManualSnapshotOptions,
  now = new Date()
): Promise<CodexManualSnapshotWriteResult> {
  const snapshot = buildCodexManualSnapshot(options, now);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  return {
    outputPath: options.outputPath,
    snapshot
  };
}

export function formatCodexManualSnapshotResult(
  result: CodexManualSnapshotWriteResult
): string {
  const snapshot = result.snapshot.quota_snapshot;

  return [
    "Codex manual quota snapshot saved.",
    `Path: ${result.outputPath}`,
    `Remaining: ${snapshot.remaining_percent}%`,
    `Reported reset: ${snapshot.reset_at}`,
    "Source label: manual"
  ].join("\n");
}

export function codexSnapshotHelpText(): string {
  return [
    "AI Agent Quota Codex Snapshot",
    "",
    "Usage:",
    "  ai-agent-quota codex snapshot --remaining-percent <0-100> --reset-at <iso-time>",
    "  ai-agent-quota codex snapshot --used-percent <0-100> --reset-at <iso-time>",
    "",
    "Use values you can see in Codex /status or Codex Settings > Usage.",
    "The command writes a structured manual snapshot into AIQD's local app data.",
    "",
    "Options:",
    "  --plan-label <label>     Optional display label",
    "  --observed-at <iso-time> Optional observed timestamp",
    "  --output <path>          Optional snapshot path"
  ].join("\n");
}

function parseRequiredDateFlag(
  argv: string[],
  flag: string,
  label: string
): string {
  const value = readFlagValue(argv, flag);

  if (!value) {
    throw new Error(`Missing ${flag} for ${label}.`);
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a valid date/time.`);
  }

  return new Date(parsed).toISOString();
}

function parseOptionalDateFlag(
  argv: string[],
  flag: string
): string | undefined {
  const value = readFlagValue(argv, flag);

  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a valid date/time.`);
  }

  return new Date(parsed).toISOString();
}

function readPercentFlag(argv: string[], flag: string): number | undefined {
  const raw = readFlagValue(argv, flag);

  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${flag} must be a number between 0 and 100.`);
  }

  return roundPercent(parsed);
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);

  if (index !== -1) {
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }

    return value;
  }

  const inline = argv.find((value) => value.startsWith(`${flag}=`));

  if (!inline) {
    return undefined;
  }

  const value = inline.slice(flag.length + 1);

  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}
