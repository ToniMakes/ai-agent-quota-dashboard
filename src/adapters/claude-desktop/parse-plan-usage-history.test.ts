import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parsePlanUsageHistory } from "./parse-plan-usage-history.js";

const fixturesDir = join(
  process.cwd(),
  "src",
  "adapters",
  "claude-desktop",
  "__fixtures__"
);
const observedAt = new Date("2026-08-13T00:00:00.000Z");

describe("parsePlanUsageHistory", () => {
  it("parses the latest sample into session and weekly snapshots", async () => {
    const fixture = await readFile(
      join(fixturesDir, "plan-usage-history-sample.json"),
      "utf8"
    );
    const snapshots = parsePlanUsageHistory(fixture, {
      observedAt,
      rawSourceRef: "fixture"
    });
    const latestSampleAt = new Date(1784441988388).toISOString();

    assert.equal(snapshots.length, 2);
    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.windowType),
      ["session_5h", "weekly"]
    );
    assert.equal(snapshots[0]?.source, "local_quota_snapshot");
    assert.equal(snapshots[0]?.confidence, "high");
    assert.equal(snapshots[0]?.usedPercent, 35);
    assert.equal(snapshots[0]?.remainingPercent, 65);
    assert.equal(snapshots[0]?.observedAt, latestSampleAt);
    assert.equal(snapshots[1]?.usedPercent, 33);
    assert.equal(snapshots[1]?.remainingPercent, 67);
    assert.equal(snapshots[1]?.rawSourceRef, "fixture");
  });

  it("returns no snapshots when samples is empty", async () => {
    const fixture = await readFile(
      join(fixturesDir, "plan-usage-history-empty.json"),
      "utf8"
    );
    const snapshots = parsePlanUsageHistory(fixture, { observedAt });

    assert.deepEqual(snapshots, []);
  });

  it("returns no snapshots for malformed input", () => {
    assert.deepEqual(parsePlanUsageHistory("not json", { observedAt }), []);
    assert.deepEqual(parsePlanUsageHistory("{}", { observedAt }), []);
  });
});
