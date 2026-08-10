import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDoctorJsonReport,
  formatDoctorReport,
  hasDoctorFailures,
  type DoctorReportInput
} from "./doctor-report.js";
import { buildRealDataReadiness } from "../core/real-data-readiness.js";
import type { AgentSummary, DoctorCheck } from "../core/types.js";
import { withSnapshotFreshness } from "../core/quota-state.js";

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
    action:
      "Codex currently requires an explicit structured quota/status/usage-limits snapshot."
  }
};

const baseCheck: DoctorCheck = {
  id: "codex:quota-source",
  provider: "openai",
  agent: "codex",
  label: "Quota source",
  status: "warn",
  message: "No supported Codex quota snapshot files found",
  observedAt: "2026-08-09T00:00:00.000Z"
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

describe("doctor report", () => {
  it("formats empty-state guidance and warning checks", () => {
    const report = formatDoctorReport(baseInput);

    assert.match(report, /AI Agent Quota Doctor/);
    assert.match(report, /Mode: local/);
    assert.match(report, /Codex \(codex\)/);
    assert.match(report, /State: No supported quota source/);
    assert.match(report, /Next: Codex currently requires/);
    assert.match(
      report,
      /\[warn\] Quota source: No supported Codex quota snapshot files found/
    );
  });

  it("formats quota snapshots when data is available", () => {
    const { emptyState: _emptyState, ...agentWithoutEmptyState } = baseAgent;

    const report = formatDoctorReport({
      ...baseInput,
      agents: [
        {
          ...agentWithoutEmptyState,
          status: "healthy",
          doctorStatus: "pass",
          snapshots: [
            withSnapshotFreshness({
              provider: "openai",
              agent: "codex",
              windowType: "weekly",
              unit: "percent",
              remainingPercent: 72,
              resetAt: "2026-08-15T13:00:00.000Z",
              observedAt: "2026-08-09T00:00:00.000Z",
              source: "demo",
              confidence: "unknown",
              stale: false
            })
          ]
        }
      ],
      checks: [
        {
          ...baseCheck,
          status: "pass",
          message: "Parsed 1 quota snapshot(s)"
        }
      ],
      demoMode: true,
      refreshResult: {
        ...baseInput.refreshResult,
        snapshotsSaved: 1
      }
    });

    assert.match(report, /Mode: demo/);
    assert.match(report, /Weekly: 72% remaining/);
    assert.match(report, /resets 2026-08-15T13:00:00.000Z/);
    assert.match(report, /demo\/unknown/);
    assert.match(report, /fresh/);
  });

  it("marks only blocking doctor issues as failures", () => {
    assert.equal(hasDoctorFailures(baseInput), false);
    assert.equal(
      hasDoctorFailures(baseInput, { requireRealData: true }),
      true
    );
    assert.equal(
      hasDoctorFailures({
        ...baseInput,
        checks: [{ ...baseCheck, status: "fail" }]
      }),
      true
    );
    assert.equal(
      hasDoctorFailures({
        ...baseInput,
        configErrors: ["Unsupported config schemaVersion; expected 1."]
      }),
      true
    );
  });

  it("reports strict real-data readiness for missing quota snapshots", () => {
    const readiness = buildRealDataReadiness(baseInput);
    const report = formatDoctorReport(baseInput, {
      includeRealDataReadiness: true
    });

    assert.equal(readiness.ok, false);
    assert.equal(readiness.checks[0]?.status, "fail");
    assert.match(readiness.checks[0]?.message ?? "", /no quota snapshot/);
    assert.match(report, /Real-data readiness:/);
    assert.match(report, /Overall: not ready/);
    assert.match(report, /\[fail\] Codex/);
  });

  it("passes strict real-data readiness with fresh non-demo quota snapshots", () => {
    const snapshot = withSnapshotFreshness({
      provider: "openai",
      agent: "codex",
      windowType: "weekly",
      unit: "percent",
      remainingPercent: 72,
      resetAt: "2026-08-15T13:00:00.000Z",
      observedAt: "2026-08-09T00:00:00.000Z",
      source: "manual",
      confidence: "medium",
      stale: false
    });
    const { emptyState: _emptyState, ...agentWithoutEmptyState } = baseAgent;
    const readyInput: DoctorReportInput = {
      ...baseInput,
      agents: [
        {
          ...agentWithoutEmptyState,
          status: "healthy",
          doctorStatus: "pass",
          primarySnapshot: snapshot,
          snapshots: [snapshot],
          lastObservedAt: snapshot.observedAt
        }
      ],
      checks: [
        {
          ...baseCheck,
          status: "pass",
          message: "Parsed 1 quota snapshot(s)"
        }
      ],
      refreshResult: {
        ...baseInput.refreshResult,
        snapshotsSaved: 1
      }
    };
    const readiness = buildRealDataReadiness(readyInput);
    const report = formatDoctorReport(readyInput, {
      includeRealDataReadiness: true
    });

    assert.equal(readiness.ok, true);
    assert.equal(hasDoctorFailures(readyInput, { requireRealData: true }), false);
    assert.match(report, /Overall: ready/);
    assert.match(report, /\[pass\] Codex: Weekly quota from manual/);
  });

  it("builds a shareable JSON report with private fields redacted", () => {
    const report = buildDoctorJsonReport({
      ...baseInput,
      agents: [
        {
          ...baseAgent,
          snapshots: [
            withSnapshotFreshness({
              provider: "openai",
              agent: "codex",
              accountIdHash: "account-hash",
              windowType: "weekly",
              unit: "percent",
              remainingPercent: 72,
              observedAt: "2026-08-09T00:00:00.000Z",
              source: "local_quota_snapshot",
              confidence: "high",
              stale: false,
              rawSourceRef: "C:\\Users\\hitomi\\.codex\\quota.json"
            })
          ]
        }
      ],
      checks: [
        {
          ...baseCheck,
          id: "codex:path:C:\\Users\\hitomi\\.codex",
          detail: "C:\\Users\\hitomi\\.codex"
        }
      ],
      refreshResult: {
        ...baseInput.refreshResult,
        errors: ["Codex: failed to read C:\\Users\\hitomi\\.codex\\quota.json"]
      }
    });
    const serialized = JSON.stringify(report);

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.reportKind, "doctor");
    assert.equal(report.privacy.localPaths, "redacted");
    assert.equal(report.realDataReadiness.ok, false);
    assert.equal(report.storage.configPath, "<local-path>");
    assert.equal(report.checks[0]?.detail, "<local-path>");
    assert.equal(report.checks[0]?.id, "codex:path:<local-path>");
    assert.equal(
      report.refresh.errors[0],
      "Codex: failed to read <local-path>"
    );
    assert.equal(report.agents[0]?.snapshots[0]?.remainingPercent, 72);
    assert.equal(report.agents[0]?.snapshots[0]?.freshness.reason, "fresh");
    assert.doesNotMatch(serialized, /account-hash/);
    assert.doesNotMatch(serialized, /"rawSourceRef"/);
    assert.doesNotMatch(serialized, /C:\\\\Users/);
  });
});
