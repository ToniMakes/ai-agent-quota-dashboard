import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentAdapter, AdapterScanContext } from "../contracts.js";
import { inspectPath, uniquePaths } from "../path-utils.js";
import type { DoctorCheck, QuotaSnapshot } from "../../core/types.js";
import { parsePlanUsageHistory } from "./parse-plan-usage-history.js";

export type ClaudeDesktopAdapterOptions = {
  configuredDataPaths?: string[];
  demoMode: boolean;
};

export function createClaudeDesktopAdapter(
  options: ClaudeDesktopAdapterOptions
): AgentAdapter {
  const defaultDataPaths = resolveClaudeDesktopDataPaths(
    options.configuredDataPaths
  );

  return {
    manifest: {
      provider: "anthropic",
      agent: "claude-desktop",
      displayName: "Claude Desktop",
      shortName: "Claude Desktop",
      description: "Claude Desktop local plan-usage-history.json.",
      defaultDataPaths,
      supportedWindows: ["session_5h", "weekly"]
    },
    async scan(context: AdapterScanContext) {
      const checks: DoctorCheck[] = [];
      const inspections = await Promise.all(defaultDataPaths.map(inspectPath));
      const readableRoots = inspections.filter((inspection) => inspection.readable);
      const snapshots = options.demoMode
        ? createDemoClaudeDesktopSnapshots(context.now)
        : await readClaudeDesktopQuotaSnapshots(
            readableRoots.map((inspection) => inspection.path),
            context
          );

      for (const inspection of inspections) {
        checks.push({
          id: `claude-desktop:path:${inspection.path}`,
          provider: "anthropic",
          agent: "claude-desktop",
          label: "Data path",
          status: inspection.readable ? "pass" : "info",
          message: inspection.readable ? "Readable" : "Not found",
          detail: inspection.path,
          observedAt: context.now.toISOString()
        });
      }

      checks.push({
        id: "claude-desktop:quota-source",
        provider: "anthropic",
        agent: "claude-desktop",
        label: "Quota source",
        status: options.demoMode ? "info" : snapshots.length > 0 ? "pass" : "warn",
        message: options.demoMode
          ? "Demo quota snapshots enabled"
          : snapshots.length > 0
              ? `Parsed ${snapshots.length} plan usage history snapshot(s)`
              : readableRoots.length > 0
                ? "No supported Claude Desktop usage history samples found"
                : "No readable Claude Desktop data path found",
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

export function getDefaultClaudeDesktopDataPaths(): string[] {
  return uniquePaths([
    process.env.APPDATA
      ? join(process.env.APPDATA, "Claude", "plan-usage-history.json")
      : undefined
  ]);
}

export function resolveClaudeDesktopDataPaths(
  configuredDataPaths: string[] = []
): string[] {
  return uniquePaths([
    ...getDefaultClaudeDesktopDataPaths(),
    ...configuredDataPaths
  ]);
}

async function readClaudeDesktopQuotaSnapshots(
  paths: string[],
  context: AdapterScanContext
): Promise<QuotaSnapshot[]> {
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        const content = await readFile(path, "utf8");
        return parsePlanUsageHistory(content, {
          observedAt: context.now,
          rawSourceRef: path
        });
      } catch {
        return [];
      }
    })
  );

  return results.flat();
}

function createDemoClaudeDesktopSnapshots(now: Date): QuotaSnapshot[] {
  return [
    {
      provider: "anthropic",
      agent: "claude-desktop",
      planLabel: "Demo 5h quota",
      windowType: "session_5h",
      unit: "percent",
      used: 22,
      remaining: 78,
      total: 100,
      usedPercent: 22,
      remainingPercent: 78,
      observedAt: now.toISOString(),
      source: "demo",
      confidence: "unknown",
      stale: false,
      rawSourceRef: "demo-mode"
    },
    {
      provider: "anthropic",
      agent: "claude-desktop",
      planLabel: "Demo weekly quota",
      windowType: "weekly",
      unit: "percent",
      used: 41,
      remaining: 59,
      total: 100,
      usedPercent: 41,
      remainingPercent: 59,
      observedAt: now.toISOString(),
      source: "demo",
      confidence: "unknown",
      stale: false,
      rawSourceRef: "demo-mode"
    }
  ];
}
