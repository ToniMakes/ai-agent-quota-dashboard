import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseCodexQuotaSnapshots } from "./parse-quota-snapshot.js";

const fixturesDir = join(
  process.cwd(),
  "src",
  "adapters",
  "codex",
  "__fixtures__"
);
const observedAt = new Date("2026-08-09T00:00:00.000Z");

describe("parseCodexQuotaSnapshots", () => {
  it("parses explicit Codex quota snapshot records from JSONL", async () => {
    const fixture = await readFile(join(fixturesDir, "quota-snapshot.jsonl"), "utf8");
    const snapshots = parseCodexQuotaSnapshots(fixture, {
      observedAt,
      rawSourceRef: "fixture"
    });

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.provider, "openai");
    assert.equal(snapshots[0]?.agent, "codex");
    assert.equal(snapshots[0]?.windowType, "weekly");
    assert.equal(snapshots[0]?.source, "official_cli");
    assert.equal(snapshots[0]?.confidence, "official");
    assert.equal(snapshots[0]?.remainingPercent, 72);
    assert.equal(snapshots[0]?.resetAt, "2026-08-12T09:00:00.000Z");
  });

  it("parses nested usage limit records without relying on prompt content", async () => {
    const fixture = await readFile(
      join(fixturesDir, "usage-limits-nested.json"),
      "utf8"
    );
    const snapshots = parseCodexQuotaSnapshots(fixture, { observedAt });

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.windowType, "weekly");
    assert.equal(snapshots[0]?.unit, "credits");
    assert.equal(snapshots[0]?.remaining, 70);
    assert.equal(snapshots[0]?.remainingPercent, 70);
    assert.equal(snapshots[0]?.confidence, "high");
  });

  it("ignores unrelated JSON documents", () => {
    const snapshots = parseCodexQuotaSnapshots(
      JSON.stringify({ type: "message", text: "hello" }),
      { observedAt }
    );

    assert.deepEqual(snapshots, []);
  });
});
