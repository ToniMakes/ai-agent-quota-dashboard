import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseClaudeCodeStatusline } from "./parse-statusline.js";

const fixturesDir = join(
  process.cwd(),
  "src",
  "adapters",
  "claude-code",
  "__fixtures__"
);
const observedAt = new Date("2026-08-09T00:00:00.000Z");

describe("parseClaudeCodeStatusline", () => {
  it("parses official rate limit windows from statusline input", async () => {
    const fixture = await readFile(
      join(fixturesDir, "statusline-rate-limits.json"),
      "utf8"
    );
    const snapshots = parseClaudeCodeStatusline(fixture, {
      observedAt,
      rawSourceRef: "fixture"
    });

    assert.equal(snapshots.length, 2);
    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.windowType),
      ["session_5h", "weekly"]
    );
    assert.equal(snapshots[0]?.source, "official_statusline");
    assert.equal(snapshots[0]?.confidence, "official");
    assert.equal(snapshots[0]?.usedPercent, 37.4);
    assert.equal(snapshots[0]?.remainingPercent, 62.6);
    assert.equal(snapshots[0]?.resetAt, "2026-08-09T00:00:00.000Z");
    assert.equal(snapshots[0]?.expiresAt, "2026-08-09T00:00:00.000Z");
    assert.equal(snapshots[1]?.resetAt, "2026-08-13T00:00:00.000Z");
    assert.equal(snapshots[1]?.expiresAt, "2026-08-09T05:00:00.000Z");
  });

  it("returns no quota snapshots when rate_limits is absent", async () => {
    const fixture = await readFile(
      join(fixturesDir, "statusline-without-rate-limits.json"),
      "utf8"
    );
    const snapshots = parseClaudeCodeStatusline(fixture, { observedAt });

    assert.deepEqual(snapshots, []);
  });
});
