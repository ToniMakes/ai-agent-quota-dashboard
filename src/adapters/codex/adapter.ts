import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentAdapter, AdapterScanContext } from "../contracts.js";
import { findReadableCandidateFiles } from "../local-candidates.js";
import { inspectPath, uniquePaths } from "../path-utils.js";
import { defaultCodexSnapshotDir } from "../../config/paths.js";
import type { DoctorCheck, QuotaSnapshot } from "../../core/types.js";
import { parseCodexQuotaSnapshots } from "./parse-quota-snapshot.js";

export type CodexAdapterOptions = {
  configuredDataPaths?: string[];
  demoMode: boolean;
};

export function createCodexAdapter(options: CodexAdapterOptions): AgentAdapter {
  const defaultDataPaths = resolveCodexDataPaths(options.configuredDataPaths);

  return {
    manifest: {
      provider: "openai",
      agent: "codex",
      displayName: "Codex",
      shortName: "Codex",
      description: "OpenAI Codex local session and quota snapshots.",
      defaultDataPaths,
      supportedWindows: ["weekly"]
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
  const candidates = await findReadableCandidateFiles(roots, {
    namePattern: /(?:quota|status|usage[-_]?limits?|limits?).*\.(?:jsonl?|txt)$/i
  });

  return candidates.flatMap((candidate) =>
    parseCodexQuotaSnapshots(candidate.content, {
      observedAt: context.now,
      rawSourceRef: candidate.path
    })
  );
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
