import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDoctorReport,
  hasDoctorFailures,
  type DoctorReportInput
} from "./doctor-report.js";
import type { AgentSummary, DoctorCheck } from "../core/types.js";

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
            {
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
            }
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
  });

  it("marks only blocking doctor issues as failures", () => {
    assert.equal(hasDoctorFailures(baseInput), false);
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
});
