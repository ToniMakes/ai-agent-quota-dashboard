import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { choosePrimarySnapshot, resolveQuotaStatus } from "./quota-state.js";
import type { QuotaSnapshot } from "./types.js";

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

  it("chooses the most constrained snapshot as primary", () => {
    const primary = choosePrimarySnapshot([
      { ...baseSnapshot, windowType: "weekly", remainingPercent: 80 },
      { ...baseSnapshot, windowType: "daily", remainingPercent: 8 }
    ]);

    assert.equal(primary?.windowType, "daily");
  });
});
