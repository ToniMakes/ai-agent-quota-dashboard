import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCliExport,
  parseCliExportOptions
} from "./export-command.js";
import type { QuotaSnapshot, ResetEvent } from "../core/types.js";

const snapshot: QuotaSnapshot = {
  provider: "openai",
  agent: "codex",
  accountIdHash: "account-hash",
  planLabel: "Plus",
  windowType: "weekly",
  unit: "percent",
  remainingPercent: 72,
  resetAt: "2026-08-16T03:00:00.000Z",
  observedAt: "2026-08-09T03:00:00.000Z",
  source: "local_quota_snapshot",
  confidence: "high",
  stale: false,
  rawSourceRef: "C:\\Users\\hitomi\\.codex\\quota.json"
};

const resetEvent: ResetEvent = {
  id: 1,
  provider: "openai",
  agent: "codex",
  windowType: "weekly",
  eventType: "reset_anchor_changed",
  previousResetAt: "2026-08-15T03:00:00.000Z",
  newResetAt: "2026-08-16T03:00:00.000Z",
  observedAt: "2026-08-09T03:00:00.000Z",
  source: "local_quota_snapshot",
  confidence: "high",
  note: "Observed reset anchor moved."
};

describe("CLI export command", () => {
  it("defaults to JSON and refreshes before export", () => {
    assert.deepEqual(parseCliExportOptions(["export"]), {
      format: "json",
      refresh: true
    });
  });

  it("accepts CSV output without refreshing", () => {
    assert.deepEqual(parseCliExportOptions(["export", "--csv", "--no-refresh"]), {
      format: "csv",
      refresh: false
    });
    assert.deepEqual(
      parseCliExportOptions(["export", "--format=csv", "--no-refresh"]),
      {
        format: "csv",
        refresh: false
      }
    );
  });

  it("rejects conflicting or unsupported formats", () => {
    assert.throws(
      () => parseCliExportOptions(["export", "--json", "--csv"]),
      /Use only one export format/
    );
    assert.throws(
      () => parseCliExportOptions(["export", "--format", "xml"]),
      /Unsupported export format/
    );
    assert.throws(
      () => parseCliExportOptions(["export", "--format"]),
      /--format requires a value/
    );
  });

  it("formats private-field-safe JSON output", () => {
    const exported = formatCliExport({
      format: "json",
      generatedAt: "2026-08-09T04:00:00.000Z",
      snapshots: [snapshot],
      resetEvents: [resetEvent]
    });
    const parsed = JSON.parse(exported);

    assert.equal(parsed.exportKind, "normalized_quota");
    assert.equal(parsed.snapshots[0].remainingPercent, 72);
    assert.equal(parsed.resetEvents[0].eventType, "reset_anchor_changed");
    assert.doesNotMatch(exported, /account-hash/);
    assert.doesNotMatch(exported, /"rawSourceRef"/);
    assert.doesNotMatch(exported, /C:\\\\Users/);
  });

  it("formats private-field-safe CSV output", () => {
    const exported = formatCliExport({
      format: "csv",
      generatedAt: "2026-08-09T04:00:00.000Z",
      snapshots: [snapshot],
      resetEvents: [resetEvent]
    });

    assert.match(exported, /^provider,agent,window_type/);
    assert.match(exported, /openai,codex,weekly/);
    assert.doesNotMatch(exported, /account-hash/);
    assert.doesNotMatch(exported, /rawSourceRef/);
    assert.doesNotMatch(exported, /C:\\\\Users/);
  });
});
