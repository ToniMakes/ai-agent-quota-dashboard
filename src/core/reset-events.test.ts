import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectResetEvent } from "./reset-events.js";
import type { QuotaSnapshot } from "./types.js";

const previous: QuotaSnapshot = {
  provider: "openai",
  agent: "codex",
  windowType: "weekly",
  unit: "percent",
  remainingPercent: 32,
  resetAt: "2026-08-15T03:00:00.000Z",
  observedAt: "2026-08-09T00:00:00.000Z",
  source: "official_cli",
  confidence: "official",
  stale: false
};

describe("detectResetEvent", () => {
  it("detects reset anchor changes", () => {
    const event = detectResetEvent(previous, {
      ...previous,
      remainingPercent: 100,
      resetAt: "2026-08-16T03:00:00.000Z",
      observedAt: "2026-08-10T00:00:00.000Z"
    });

    assert.equal(event?.eventType, "reset_anchor_changed");
    assert.equal(event?.previousResetAt, "2026-08-15T03:00:00.000Z");
    assert.equal(event?.newResetAt, "2026-08-16T03:00:00.000Z");
    assert.equal(event?.previousRemainingPercent, 32);
    assert.equal(event?.newRemainingPercent, 100);
  });

  it("detects sharp replenishment even when resetAt is unchanged", () => {
    const event = detectResetEvent(previous, {
      ...previous,
      remainingPercent: 96,
      observedAt: "2026-08-10T00:00:00.000Z"
    });

    assert.equal(event?.eventType, "quota_replenished");
  });

  it("ignores demo snapshots", () => {
    const event = detectResetEvent(previous, {
      ...previous,
      remainingPercent: 100,
      resetAt: "2026-08-16T03:00:00.000Z",
      source: "demo",
      confidence: "unknown"
    });

    assert.equal(event, undefined);
  });
});
