import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRealDataReadiness,
  hasBlockingDiagnosticFailures,
  type RealDataReadinessInput
} from "./real-data-readiness.js";
import type { AgentSummary, DoctorCheck } from "./types.js";
import { withSnapshotFreshness } from "./quota-state.js";

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
    action: "Use Codex once and refresh; use the manual fallback only if needed."
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

const baseInput: RealDataReadinessInput = {
  agents: [baseAgent],
  checks: [baseCheck],
  configErrors: [],
  demoMode: false,
  refreshResult: {
    errors: []
  }
};

describe("real-data readiness", () => {
  it("fails when an agent has no quota snapshot", () => {
    const readiness = buildRealDataReadiness(baseInput);

    assert.equal(readiness.ok, false);
    assert.equal(readiness.checks[0]?.status, "fail");
    assert.match(readiness.checks[0]?.message ?? "", /no quota snapshot/);
    assert.match(readiness.checks[0]?.action ?? "", /Codex/);
  });

  it("passes when every agent has a fresh non-demo quota snapshot", () => {
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
    const readiness = buildRealDataReadiness({
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
      ]
    });

    assert.equal(readiness.ok, true);
    assert.equal(readiness.checks[0]?.status, "pass");
    assert.match(readiness.checks[0]?.message ?? "", /Weekly quota from manual/);
  });

  it("fails demo and stale snapshots for strict trials", () => {
    const demoSnapshot = withSnapshotFreshness({
      provider: "openai",
      agent: "codex",
      windowType: "weekly",
      unit: "percent",
      remainingPercent: 72,
      observedAt: "2026-08-09T00:00:00.000Z",
      source: "demo",
      confidence: "unknown",
      stale: false
    });
    const staleSnapshot = withSnapshotFreshness({
      provider: "openai",
      agent: "codex",
      windowType: "weekly",
      unit: "percent",
      remainingPercent: 72,
      observedAt: "2026-08-09T00:00:00.000Z",
      source: "manual",
      confidence: "medium",
      stale: true,
    });
    const { emptyState: _emptyState, ...agentWithoutEmptyState } = baseAgent;

    assert.match(
      buildRealDataReadiness({
        ...baseInput,
        demoMode: true,
        agents: [
          {
            ...agentWithoutEmptyState,
            primarySnapshot: demoSnapshot,
            snapshots: [demoSnapshot]
          }
        ]
      }).checks.map((check) => check.message).join("\n"),
      /Demo mode is enabled/
    );
    assert.match(
      buildRealDataReadiness({
        ...baseInput,
        agents: [
          {
            ...agentWithoutEmptyState,
            primarySnapshot: staleSnapshot,
            snapshots: [staleSnapshot]
          }
        ]
      }).checks[0]?.message ?? "",
      /stale/
    );
  });

  it("passes an anthropic provider group when only one of two Claude sources is fresh", () => {
    const freshSnapshot = withSnapshotFreshness({
      provider: "anthropic",
      agent: "claude-desktop",
      windowType: "session_5h",
      unit: "percent",
      remainingPercent: 65,
      observedAt: "2026-08-13T00:00:00.000Z",
      source: "local_quota_snapshot",
      confidence: "high",
      stale: false
    });

    const readiness = buildRealDataReadiness({
      ...baseInput,
      agents: [
        {
          provider: "anthropic",
          agent: "claude-code",
          displayName: "Claude Code",
          shortName: "Claude Code",
          status: "unknown",
          doctorStatus: "warn",
          snapshots: [],
          emptyState: {
            reason: "waiting_for_statusline_data",
            title: "Waiting for Claude Code data",
            detail: "No supported rate_limits snapshot has been received yet.",
            action: "Open Claude Code once, then refresh."
          }
        },
        {
          provider: "anthropic",
          agent: "claude-desktop",
          displayName: "Claude Desktop",
          shortName: "Claude Desktop",
          status: "healthy",
          doctorStatus: "pass",
          primarySnapshot: freshSnapshot,
          snapshots: [freshSnapshot],
          lastObservedAt: freshSnapshot.observedAt
        }
      ],
      checks: []
    });

    assert.equal(readiness.ok, true);
    assert.equal(
      readiness.checks.find((check) => check.agent === "claude-code")?.status,
      "fail"
    );
    assert.equal(
      readiness.checks.find((check) => check.agent === "claude-desktop")?.status,
      "pass"
    );
  });

  it("treats blocking diagnostic failures as not ready", () => {
    assert.equal(hasBlockingDiagnosticFailures(baseInput), false);
    assert.equal(
      hasBlockingDiagnosticFailures({
        ...baseInput,
        checks: [{ ...baseCheck, status: "fail" }]
      }),
      true
    );
    assert.equal(
      hasBlockingDiagnosticFailures({
        ...baseInput,
        refreshResult: { errors: ["adapter failed"] }
      }),
      true
    );
  });
});
