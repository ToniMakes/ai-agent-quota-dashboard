import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  choosePrimarySnapshot,
  describeSnapshotFreshness,
  describeEmptyQuotaState,
  resolveQuotaStatus,
  withSnapshotFreshness
} from "./quota-state.js";
import type { AgentManifest, DoctorCheck, QuotaSnapshot } from "./types.js";

const baseSnapshot: QuotaSnapshot = {
  provider: "openai",
  agent: "codex",
  windowType: "weekly",
  unit: "percent",
  remainingPercent: 70,
  observedAt: "2026-08-09T00:00:00.000Z",
  source: "official_cli",
  confidence: "official",
  stale: false
};

const manifest: AgentManifest = {
  provider: "openai",
  agent: "codex",
  displayName: "Codex",
  shortName: "Codex",
  description: "OpenAI Codex local session and quota snapshots.",
  defaultDataPaths: [],
  supportedWindows: ["weekly"]
};

const baseCheck: DoctorCheck = {
  id: "codex:quota-source",
  provider: "openai",
  agent: "codex",
  label: "Quota source",
  status: "warn",
  message: "No readable Codex data path found",
  observedAt: "2026-08-09T00:00:00.000Z"
};

const claudeManifest: AgentManifest = {
  provider: "anthropic",
  agent: "claude-code",
  displayName: "Claude Code",
  shortName: "Claude",
  description: "Claude Code local usage files and statusline rate limits.",
  defaultDataPaths: [],
  supportedWindows: ["session_5h", "weekly"]
};

describe("quota state", () => {
  it("marks low remaining quota as warning", () => {
    assert.equal(
      resolveQuotaStatus({ ...baseSnapshot, remainingPercent: 20 }),
      "warning"
    );
  });

  it("marks critical quota at ten percent or less", () => {
    assert.equal(
      resolveQuotaStatus({ ...baseSnapshot, remainingPercent: 10 }),
      "critical"
    );
  });

  it("marks expired quota snapshots as stale", () => {
    assert.equal(
      resolveQuotaStatus(
        {
          ...baseSnapshot,
          expiresAt: "2026-08-09T00:30:00.000Z"
        },
        new Date("2026-08-09T01:00:00.000Z")
      ),
      "stale"
    );
  });

  it("describes source-marked stale snapshots", () => {
    const freshness = describeSnapshotFreshness({
      ...baseSnapshot,
      stale: true
    });

    assert.deepEqual(freshness, {
      status: "stale",
      reason: "source_marked_stale",
      label: "marked stale by source"
    });
  });

  it("describes expired snapshots", () => {
    const freshness = describeSnapshotFreshness(
      {
        ...baseSnapshot,
        expiresAt: "2026-08-09T00:30:00.000Z"
      },
      new Date("2026-08-09T01:00:00.000Z")
    );

    assert.deepEqual(freshness, {
      status: "stale",
      reason: "expired",
      label: "expired observation"
    });
  });

  it("attaches freshness to agent-facing snapshots", () => {
    const snapshot = withSnapshotFreshness(baseSnapshot);

    assert.equal(snapshot.freshness.status, "fresh");
    assert.equal(snapshot.freshness.reason, "fresh");
  });

  it("chooses the most constrained snapshot as primary", () => {
    const primary = choosePrimarySnapshot([
      { ...baseSnapshot, windowType: "weekly", remainingPercent: 80 },
      { ...baseSnapshot, windowType: "daily", remainingPercent: 8 }
    ]);

    assert.equal(primary?.windowType, "daily");
  });

  it("does not describe an empty state when quota snapshots exist", () => {
    assert.equal(
      describeEmptyQuotaState(manifest, [baseSnapshot], [baseCheck]),
      undefined
    );
  });

  it("describes missing readable data paths", () => {
    const emptyState = describeEmptyQuotaState(manifest, [], [baseCheck]);

    assert.equal(emptyState?.reason, "no_readable_paths");
    assert.equal(emptyState?.title, "No readable data path");
    assert.match(emptyState?.action ?? "", /codex snapshot/);
  });

  it("describes readable paths without supported quota source", () => {
    const emptyState = describeEmptyQuotaState(manifest, [], [
      {
        ...baseCheck,
        message: "No supported Codex quota snapshot files found"
      }
    ]);

    assert.equal(emptyState?.reason, "no_supported_source");
    assert.equal(emptyState?.title, "No supported quota source");
  });

  it("describes Claude Code waiting for first statusline data after setup", () => {
    const emptyState = describeEmptyQuotaState(claudeManifest, [], [
      {
        id: "claude-code:statusline:statusline-command",
        provider: "anthropic",
        agent: "claude-code",
        label: "Statusline command",
        status: "pass",
        message: "Managed by AIQD",
        observedAt: "2026-08-09T00:00:00.000Z"
      },
      {
        id: "claude-code:statusline:shim",
        provider: "anthropic",
        agent: "claude-code",
        label: "AIQD shim",
        status: "pass",
        message: "Shim file found",
        observedAt: "2026-08-09T00:00:00.000Z"
      },
      {
        id: "claude-code:statusline:latest-snapshot",
        provider: "anthropic",
        agent: "claude-code",
        label: "Latest snapshot",
        status: "warn",
        message: "No statusline snapshot received yet",
        observedAt: "2026-08-09T00:00:00.000Z"
      },
      {
        id: "claude-code:quota-source",
        provider: "anthropic",
        agent: "claude-code",
        label: "Quota source",
        status: "warn",
        message: "No supported Claude Code statusline files found",
        observedAt: "2026-08-09T00:00:00.000Z"
      }
    ]);

    assert.equal(emptyState?.reason, "waiting_for_statusline_data");
    assert.equal(emptyState?.title, "Waiting for Claude Code data");
    assert.match(emptyState?.detail ?? "", /configured to call/);
    assert.match(emptyState?.action ?? "", /Open Claude Code/);
    assert.doesNotMatch(emptyState?.action ?? "", /setup claude-statusline --write/);
  });

  it("prefers adapter errors over source guidance", () => {
    const emptyState = describeEmptyQuotaState(manifest, [], [
      baseCheck,
      {
        ...baseCheck,
        id: "codex:adapter-error",
        label: "Adapter",
        status: "fail",
        message: "Adapter scan failed",
        detail: "Permission denied"
      }
    ]);

    assert.equal(emptyState?.reason, "adapter_error");
    assert.equal(emptyState?.detail, "Permission denied");
  });
});
