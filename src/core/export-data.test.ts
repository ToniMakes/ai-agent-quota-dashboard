import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildQuotaExport,
  quotaSnapshotsToCsv,
  sanitizeQuotaSnapshot
} from "./export-data.js";
import type { QuotaSnapshot, ResetEvent } from "./types.js";

const snapshot: QuotaSnapshot = {
  provider: "openai",
  agent: "codex",
  accountIdHash: "account-hash",
  planLabel: "Plus, weekly",
  windowType: "weekly",
  unit: "percent",
  used: 28,
  remaining: 72,
  total: 100,
  usedPercent: 28,
  remainingPercent: 72,
  resetAt: "2026-08-16T03:00:00.000Z",
  observedAt: "2026-08-09T03:00:00.000Z",
  source: "official_cli",
  confidence: "official",
  stale: false,
  rawSourceRef: "C:\\Users\\hitomi\\.codex\\quota.json"
};

const resetEvent: ResetEvent = {
  id: 7,
  provider: "openai",
  agent: "codex",
  windowType: "weekly",
  eventType: "reset_anchor_changed",
  previousResetAt: "2026-08-15T03:00:00.000Z",
  newResetAt: "2026-08-16T03:00:00.000Z",
  previousRemainingPercent: 18,
  newRemainingPercent: 100,
  observedAt: "2026-08-09T03:00:00.000Z",
  source: "official_cli",
  confidence: "official",
  note: "Observed reset anchor moved."
};

describe("quota export", () => {
  it("excludes local source refs and account identifiers from JSON exports", () => {
    const exported = buildQuotaExport({
      generatedAt: "2026-08-09T04:00:00.000Z",
      snapshots: [snapshot],
      resetEvents: [resetEvent]
    });
    const serialized = JSON.stringify(exported);

    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.privacy.accountIdentifiers, "excluded");
    assert.equal(exported.snapshots[0]?.provider, "openai");
    assert.equal(exported.resetEvents[0]?.eventType, "reset_anchor_changed");
    assert.equal(Object.hasOwn(exported.snapshots[0] ?? {}, "rawSourceRef"), false);
    assert.equal(Object.hasOwn(exported.snapshots[0] ?? {}, "accountIdHash"), false);
    assert.equal(Object.hasOwn(exported.resetEvents[0] ?? {}, "id"), false);
    assert.equal(serialized.includes("C:\\Users"), false);
    assert.equal(serialized.includes("account-hash"), false);
  });

  it("serializes normalized snapshots as CSV", () => {
    const csv = quotaSnapshotsToCsv([snapshot]);
    const lines = csv.trimEnd().split("\n");

    assert.equal(
      lines[0],
      "provider,agent,window_type,unit,plan_label,used,remaining,total,used_percent,remaining_percent,reset_at,observed_at,expires_at,source,confidence,stale"
    );
    assert.equal(
      lines[1],
      'openai,codex,weekly,percent,"Plus, weekly",28,72,100,28,72,2026-08-16T03:00:00.000Z,2026-08-09T03:00:00.000Z,,official_cli,official,false'
    );
    assert.equal(csv.includes("rawSourceRef"), false);
    assert.equal(csv.includes("account-hash"), false);
  });

  it("sanitizes snapshots without changing quota fields", () => {
    const sanitized = sanitizeQuotaSnapshot(snapshot);

    assert.deepEqual(sanitized, {
      provider: "openai",
      agent: "codex",
      planLabel: "Plus, weekly",
      windowType: "weekly",
      unit: "percent",
      used: 28,
      remaining: 72,
      total: 100,
      usedPercent: 28,
      remainingPercent: 72,
      resetAt: "2026-08-16T03:00:00.000Z",
      observedAt: "2026-08-09T03:00:00.000Z",
      source: "official_cli",
      confidence: "official",
      stale: false
    });
  });
});
