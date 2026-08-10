import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentSummary, DoctorCheck, QuotaSnapshotView } from "../core/types.js";
import type { CodexSnapshotSetupStatus } from "../setup/codex-snapshot-status.js";
import type { ClaudeStatuslineSetupStatus } from "../setup/claude-statusline-status.js";
import type { DoctorReportInput } from "./doctor-report.js";
import {
  formatTrialPreflightReport,
  isTrialPreflightReady,
  type TrialPreflightInput
} from "./trial-preflight.js";

const baseCheck: DoctorCheck = {
  id: "codex:quota-source",
  provider: "openai",
  agent: "codex",
  label: "Quota source",
  status: "warn",
  message: "No supported Codex quota snapshot files found",
  observedAt: "2026-08-09T00:00:00.000Z"
};

const baseAgent: AgentSummary = {
  provider: "openai",
  agent: "codex",
  displayName: "Codex",
  shortName: "Codex",
  status: "unknown",
  doctorStatus: "warn",
  snapshots: [],
  emptyState: {
    reason: "no_supported_source",
    title: "No supported quota source",
    detail: "No supported quota/statusline snapshot was found.",
    action: "Record a visible Codex /status value."
  }
};

const baseInput: DoctorReportInput = {
  agents: [baseAgent],
  checks: [baseCheck],
  configErrors: [],
  configPath: "C:\\Users\\hitomi\\.ai-agent-quota-dashboard\\config.json",
  dbPath: "C:\\Users\\hitomi\\.ai-agent-quota-dashboard\\quota.db",
  demoMode: false,
  generatedAt: "2026-08-09T00:00:00.000Z",
  refreshResult: {
    observedAt: "2026-08-09T00:00:00.000Z",
    snapshotsSaved: 0,
    usageEventsSaved: 0,
    doctorChecksSaved: 1,
    resetEventsSaved: 0,
    adapterCount: 1,
    errors: []
  }
};

describe("trial preflight", () => {
  it("formats the shortest next actions for missing real data", () => {
    const input: TrialPreflightInput = {
      ...baseInput,
      claudeStatus: claudeStatus({
        readiness: "waiting_for_data",
        readinessLabel: "Waiting for Claude Code data",
        nextAction: "Open Claude Code once."
      }),
      codexStatus: codexStatus({
        readiness: "not_recorded",
        readinessLabel: "No Codex snapshot yet",
        nextAction: "node dist/index.js codex snapshot --remaining-percent <0-100> --reset-at <iso-time>"
      })
    };
    const report = formatTrialPreflightReport(input);

    assert.equal(isTrialPreflightReady(input), false);
    assert.match(report, /Overall: not ready/);
    assert.match(report, /Codex: needs setup \(No Codex snapshot yet\)/);
    assert.match(report, /Claude Code: waiting \(Waiting for Claude Code data\)/);
    assert.match(report, /Record a visible Codex/);
    assert.match(report, /npm run trial:ready/);
    assert.doesNotMatch(report, /setup claude-statusline --write/);
  });

  it("reports ready when strict readiness and diagnostics pass", () => {
    const snapshot = quotaSnapshot();
    const readyAgent: AgentSummary = {
      ...baseAgent,
      status: "healthy",
      doctorStatus: "pass",
      primarySnapshot: snapshot,
      snapshots: [snapshot],
      lastObservedAt: snapshot.observedAt
    };
    const input: TrialPreflightInput = {
      ...baseInput,
      agents: [readyAgent],
      checks: [
        {
          ...baseCheck,
          status: "pass",
          message: "Parsed 1 quota snapshot(s)"
        }
      ],
      claudeStatus: claudeStatus({
        readiness: "ready",
        readinessLabel: "Ready for real Claude Code quota data",
        nextAction: "Refresh the dashboard to load the latest statusline quota."
      }),
      codexStatus: codexStatus({
        readiness: "ready",
        readinessLabel: "Ready for manual Codex quota data",
        nextAction: "Refresh the dashboard to load the latest Codex snapshot."
      }),
      refreshResult: {
        ...baseInput.refreshResult,
        snapshotsSaved: 1
      }
    };
    const report = formatTrialPreflightReport(input);

    assert.equal(isTrialPreflightReady(input), true);
    assert.match(report, /Overall: ready/);
    assert.match(report, /Codex: ready/);
    assert.doesNotMatch(report, /Next useful commands/);
  });
});

function quotaSnapshot(): QuotaSnapshotView {
  return {
    provider: "openai",
    agent: "codex",
    windowType: "weekly",
    unit: "percent",
    remainingPercent: 72,
    resetAt: "2026-08-15T13:00:00.000Z",
    observedAt: "2026-08-09T00:00:00.000Z",
    source: "manual",
    confidence: "medium",
    stale: false,
    freshness: {
      label: "fresh",
      reason: "fresh",
      status: "fresh"
    }
  };
}

function codexStatus(
  overrides: Pick<
    CodexSnapshotSetupStatus,
    "nextAction" | "readiness" | "readinessLabel"
  >
): CodexSnapshotSetupStatus {
  return {
    snapshotPath: "C:\\Users\\hitomi\\.ai-agent-quota-dashboard\\codex\\codex-quota-snapshot.json",
    snapshotExists: overrides.readiness === "ready",
    latestHasQuota: overrides.readiness === "ready",
    readiness: overrides.readiness,
    readinessLabel: overrides.readinessLabel,
    nextAction: overrides.nextAction,
    checks: [],
    writeCommand:
      "node dist/index.js codex snapshot --remaining-percent <0-100> --reset-at <iso-time>",
    helpCommand: "node dist/index.js codex snapshot --help",
    savedFields: [],
    notSavedFields: []
  };
}

function claudeStatus(
  overrides: Pick<
    ClaudeStatuslineSetupStatus,
    "nextAction" | "readiness" | "readinessLabel"
  >
): ClaudeStatuslineSetupStatus {
  return {
    settingsPath: "C:\\Users\\hitomi\\.claude\\settings.json",
    settingsExists: overrides.readiness !== "needs_setup",
    statusLineConfigured: overrides.readiness !== "needs_setup",
    statusLineManagedByApp: overrides.readiness !== "needs_setup",
    shimPath: "C:\\Users\\hitomi\\.ai-agent-quota-dashboard\\claude\\statusline.cjs",
    shimExists: overrides.readiness !== "needs_setup",
    latestPath: "C:\\Users\\hitomi\\.ai-agent-quota-dashboard\\claude\\latest.json",
    latestExists: overrides.readiness === "ready",
    latestHasRateLimits: overrides.readiness === "ready",
    latestWindowTypes: overrides.readiness === "ready" ? ["session_5h", "weekly"] : [],
    historyPath: "C:\\Users\\hitomi\\.ai-agent-quota-dashboard\\claude\\history.jsonl",
    historyExists: overrides.readiness === "ready",
    readiness: overrides.readiness,
    readinessLabel: overrides.readinessLabel,
    nextAction: overrides.nextAction,
    checks: [],
    previewCommand: "node dist/index.js setup claude-statusline",
    selfTestCommand: "node dist/index.js claude-statusline-sink --self-test",
    writeCommand: "node dist/index.js setup claude-statusline --write",
    forceWriteCommand: "node dist/index.js setup claude-statusline --write --force",
    savedFields: [],
    notSavedFields: []
  };
}
