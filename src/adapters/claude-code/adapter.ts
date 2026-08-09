import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentAdapter, AdapterScanContext } from "../contracts.js";
import { findReadableCandidateFiles } from "../local-candidates.js";
import { inspectPath, uniquePaths } from "../path-utils.js";
import { defaultClaudeStatuslineSnapshotDir } from "../../config/paths.js";
import type { DoctorCheck, QuotaSnapshot } from "../../core/types.js";
import { parseClaudeCodeStatusline } from "./parse-statusline.js";

export type ClaudeCodeAdapterOptions = {
  demoMode: boolean;
};

export function createClaudeCodeAdapter(
  options: ClaudeCodeAdapterOptions
): AgentAdapter {
  const defaultDataPaths = uniquePaths([
    process.env.CLAUDE_CONFIG_DIR,
    join(homedir(), ".claude"),
    process.env.AIQD_CLAUDE_STATUSLINE_DIR ??
      defaultClaudeStatuslineSnapshotDir(),
    process.env.APPDATA ? join(process.env.APPDATA, "Claude") : undefined,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Claude") : undefined
  ]);

  return {
    manifest: {
      provider: "anthropic",
      agent: "claude-code",
      displayName: "Claude Code",
      shortName: "Claude",
      description: "Claude Code local usage files and statusline rate limits.",
      defaultDataPaths,
      supportedWindows: ["daily", "weekly"]
    },
    async scan(context: AdapterScanContext) {
      const checks: DoctorCheck[] = [];
      const inspections = await Promise.all(defaultDataPaths.map(inspectPath));
      const readableRoots = inspections.filter((inspection) => inspection.readable);
      const snapshots = options.demoMode
        ? createDemoClaudeSnapshots(context.now)
        : await readClaudeCodeQuotaSnapshots(
            readableRoots.map((inspection) => inspection.path),
            context
          );

      for (const inspection of inspections) {
        checks.push({
          id: `claude-code:path:${inspection.path}`,
          provider: "anthropic",
          agent: "claude-code",
          label: "Data path",
          status: inspection.readable ? "pass" : "info",
          message: inspection.readable ? "Readable" : "Not found",
          detail: inspection.path,
          observedAt: context.now.toISOString()
        });
      }

      checks.push({
        id: "claude-code:quota-source",
        provider: "anthropic",
        agent: "claude-code",
        label: "Quota source",
        status: options.demoMode ? "info" : snapshots.length > 0 ? "pass" : "warn",
        message: options.demoMode
          ? "Demo quota snapshots enabled"
          : snapshots.length > 0
              ? `Parsed ${snapshots.length} statusline quota snapshot(s)`
              : readableRoots.length > 0
                ? "No supported Claude Code statusline files found"
                : "No readable Claude Code data path found",
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

async function readClaudeCodeQuotaSnapshots(
  roots: string[],
  context: AdapterScanContext
): Promise<QuotaSnapshot[]> {
  const candidates = await findReadableCandidateFiles(roots, {
    namePattern: /(?:statusline|rate[-_]?limits?|quota|limits?).*\.(?:jsonl?|txt)$/i
  });

  return candidates.flatMap((candidate) =>
    parseClaudeCodeStatusline(candidate.content, {
      observedAt: context.now,
      rawSourceRef: candidate.path
    })
  );
}

function createDemoClaudeSnapshots(now: Date): QuotaSnapshot[] {
  const dailyResetAt = new Date(now);
  dailyResetAt.setDate(dailyResetAt.getDate() + 1);
  dailyResetAt.setHours(5, 0, 0, 0);

  const weeklyResetAt = new Date(now);
  weeklyResetAt.setDate(weeklyResetAt.getDate() + 5);
  weeklyResetAt.setHours(5, 0, 0, 0);

  return [
    {
      provider: "anthropic",
      agent: "claude-code",
      planLabel: "Demo daily quota",
      windowType: "daily",
      unit: "percent",
      used: 59,
      remaining: 41,
      total: 100,
      usedPercent: 59,
      remainingPercent: 41,
      resetAt: dailyResetAt.toISOString(),
      observedAt: now.toISOString(),
      source: "demo",
      confidence: "unknown",
      stale: false,
      rawSourceRef: "demo-mode"
    },
    {
      provider: "anthropic",
      agent: "claude-code",
      planLabel: "Demo weekly quota",
      windowType: "weekly",
      unit: "percent",
      used: 34,
      remaining: 66,
      total: 100,
      usedPercent: 34,
      remainingPercent: 66,
      resetAt: weeklyResetAt.toISOString(),
      observedAt: now.toISOString(),
      source: "demo",
      confidence: "unknown",
      stale: false,
      rawSourceRef: "demo-mode"
    }
  ];
}
