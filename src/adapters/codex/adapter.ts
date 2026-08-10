import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { AgentAdapter, AdapterScanContext } from "../contracts.js";
import { findReadableCandidateFiles } from "../local-candidates.js";
import { inspectPath, uniquePaths } from "../path-utils.js";
import {
  defaultCodexManualSnapshotPath,
  defaultCodexSnapshotDir
} from "../../config/paths.js";
import type { DoctorCheck, QuotaSnapshot } from "../../core/types.js";
import { parseCodexQuotaSnapshots } from "./parse-quota-snapshot.js";

export type CodexAdapterOptions = {
  configuredDataPaths?: string[];
  demoMode: boolean;
  includeDefaultDataPaths?: boolean;
};

type CodexCandidateFile = {
  path: string;
  content: string;
};

type CodexSessionLogCandidate = {
  path: string;
  mtimeMs: number;
  size: number;
};

const maxCodexSessionDepth = 5;
const maxCodexSessionLogs = 24;
const maxCodexSessionTailBytes = 512 * 1024;

export function createCodexAdapter(options: CodexAdapterOptions): AgentAdapter {
  const defaultDataPaths =
    options.includeDefaultDataPaths === false
      ? uniquePaths(options.configuredDataPaths ?? [])
      : resolveCodexDataPaths(options.configuredDataPaths);

  return {
    manifest: {
      provider: "openai",
      agent: "codex",
      displayName: "Codex",
      shortName: "Codex",
      description: "OpenAI Codex local session and quota snapshots.",
      defaultDataPaths,
      supportedWindows: ["session_5h", "weekly"]
    },
    async scan(context: AdapterScanContext) {
      const checks: DoctorCheck[] = [];
      const inspections = await Promise.all(defaultDataPaths.map(inspectPath));
      const readableRoots = inspections.filter((inspection) => inspection.readable);
      const snapshots = options.demoMode
        ? [createDemoCodexSnapshot(context.now)]
        : await readCodexQuotaSnapshots(
            readableRoots.map((inspection) => inspection.path),
            context
          );

      for (const inspection of inspections) {
        checks.push({
          id: `codex:path:${inspection.path}`,
          provider: "openai",
          agent: "codex",
          label: "Data path",
          status: inspection.readable ? "pass" : "info",
          message: inspection.readable ? "Readable" : "Not found",
          detail: inspection.path,
          observedAt: context.now.toISOString()
        });
      }

      checks.push({
        id: "codex:quota-source",
        provider: "openai",
        agent: "codex",
        label: "Quota source",
        status: options.demoMode ? "info" : snapshots.length > 0 ? "pass" : "warn",
        message: options.demoMode
          ? "Demo quota snapshot enabled"
          : snapshots.length > 0
              ? `Parsed ${snapshots.length} quota snapshot(s)`
              : readableRoots.length > 0
                ? "No supported Codex quota snapshot files found"
                : "No readable Codex data path found",
          observedAt: context.now.toISOString()
        });

      return {
        snapshots,
        usageEvents: [],
        doctorChecks: checks
      };
    }
  };
}

export function getDefaultCodexDataPaths(): string[] {
  return uniquePaths([
    defaultCodexManualSnapshotPath(),
    defaultCodexSnapshotDir(),
    process.env.CODEX_HOME,
    join(homedir(), ".codex"),
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "OpenAI", "Codex")
      : undefined,
    process.env.APPDATA ? join(process.env.APPDATA, "Codex") : undefined
  ]);
}

export function resolveCodexDataPaths(configuredDataPaths: string[] = []): string[] {
  return uniquePaths([...getDefaultCodexDataPaths(), ...configuredDataPaths]);
}

async function readCodexQuotaSnapshots(
  roots: string[],
  context: AdapterScanContext
): Promise<QuotaSnapshot[]> {
  const structuredCandidates = await findReadableCandidateFiles(roots, {
    namePattern:
      /(?:quota|snapshot|status|usage[-_]?limits?|limits?).*\.(?:jsonl?|txt)$/i
  });
  const sessionCandidates = await findCodexSessionLogCandidates(roots);
  const candidates = dedupeCandidates([
    ...structuredCandidates,
    ...sessionCandidates
  ]);

  return bestSnapshotPerWindow(
    candidates.flatMap((candidate) =>
      parseCodexQuotaSnapshots(candidate.content, {
        observedAt: context.now,
        rawSourceRef: candidate.path
      })
    ),
    context.now
  );
}

async function findCodexSessionLogCandidates(
  roots: string[]
): Promise<CodexCandidateFile[]> {
  const logs: CodexSessionLogCandidate[] = [];

  for (const root of roots) {
    await collectCodexSessionLogs(root, 0, logs);
  }

  return Promise.all(
    logs
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, maxCodexSessionLogs)
      .map(async (candidate) => ({
        path: candidate.path,
        content: await readFileTail(candidate.path, candidate.size)
      }))
  );
}

async function collectCodexSessionLogs(
  path: string,
  depth: number,
  logs: CodexSessionLogCandidate[]
): Promise<void> {
  if (depth > maxCodexSessionDepth) {
    return;
  }

  let pathStats;

  try {
    pathStats = await stat(path);
  } catch {
    return;
  }

  if (pathStats.isFile()) {
    if (isCodexSessionLogName(basename(path))) {
      logs.push({
        path,
        mtimeMs: pathStats.mtimeMs,
        size: pathStats.size
      });
    }

    return;
  }

  if (!pathStats.isDirectory()) {
    return;
  }

  let entries;

  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(path, entry.name);

    if (entry.isDirectory()) {
      await collectCodexSessionLogs(fullPath, depth + 1, logs);
      continue;
    }

    if (!entry.isFile() || !isCodexSessionLogName(entry.name)) {
      continue;
    }

    try {
      const fileStats = await stat(fullPath);
      logs.push({
        path: fullPath,
        mtimeMs: fileStats.mtimeMs,
        size: fileStats.size
      });
    } catch {
      continue;
    }
  }
}

function isCodexSessionLogName(name: string): boolean {
  return /^rollout-.+\.jsonl$/i.test(name);
}

async function readFileTail(path: string, size: number): Promise<string> {
  const bytesToRead = Math.min(size, maxCodexSessionTailBytes);
  const position = Math.max(0, size - bytesToRead);
  const buffer = Buffer.alloc(bytesToRead);
  const file = await open(path, "r");

  try {
    const result = await file.read(buffer, 0, bytesToRead, position);
    return buffer.subarray(0, result.bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}

function dedupeCandidates(candidates: CodexCandidateFile[]): CodexCandidateFile[] {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    if (seen.has(candidate.path)) {
      return false;
    }

    seen.add(candidate.path);
    return true;
  });
}

function bestSnapshotPerWindow(
  snapshots: QuotaSnapshot[],
  now: Date
): QuotaSnapshot[] {
  const freshSnapshots = snapshots.filter(
    (snapshot) => !isExpiredByReset(snapshot, now)
  );
  const candidates = freshSnapshots.length > 0 ? freshSnapshots : snapshots;
  const best = new Map<string, QuotaSnapshot>();

  for (const snapshot of candidates) {
    const key = `${snapshot.provider}:${snapshot.agent}:${snapshot.windowType}`;
    const previous = best.get(key);

    if (!previous || compareSnapshotPriority(snapshot, previous) > 0) {
      best.set(key, snapshot);
    }
  }

  return [...best.values()].sort((left, right) => {
    const windowDelta =
      windowPriority(left.windowType) - windowPriority(right.windowType);

    if (windowDelta !== 0) {
      return windowDelta;
    }

    return Date.parse(right.observedAt) - Date.parse(left.observedAt);
  });
}

function compareSnapshotPriority(left: QuotaSnapshot, right: QuotaSnapshot): number {
  const sourceDelta = sourcePriority(left.source) - sourcePriority(right.source);

  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  return Date.parse(left.observedAt) - Date.parse(right.observedAt);
}

function isExpiredByReset(snapshot: QuotaSnapshot, now: Date): boolean {
  const expiresAt = snapshot.expiresAt ?? snapshot.resetAt;
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : undefined;

  return typeof expiresAtMs === "number" && expiresAtMs <= now.getTime();
}

function sourcePriority(source: string): number {
  switch (source) {
    case "official_api":
    case "official_cli":
      return 3;
    case "local_quota_snapshot":
    case "local_usage_log":
      return 2;
    case "manual":
      return 1;
    default:
      return 0;
  }
}

function windowPriority(windowType: string): number {
  switch (windowType) {
    case "session_5h":
      return 1;
    case "daily":
      return 2;
    case "weekly":
      return 3;
    case "monthly":
      return 4;
    default:
      return 5;
  }
}

function createDemoCodexSnapshot(now: Date): QuotaSnapshot {
  const resetAt = new Date(now);
  resetAt.setDate(resetAt.getDate() + 3);
  resetAt.setHours(9, 0, 0, 0);

  return {
    provider: "openai",
    agent: "codex",
    planLabel: "Demo weekly quota",
    windowType: "weekly",
    unit: "percent",
    used: 28,
    remaining: 72,
    total: 100,
    usedPercent: 28,
    remainingPercent: 72,
    resetAt: resetAt.toISOString(),
    observedAt: now.toISOString(),
    source: "demo",
    confidence: "unknown",
    stale: false,
    rawSourceRef: "demo-mode"
  };
}
