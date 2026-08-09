import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseCodexQuotaSnapshots } from "../adapters/codex/parse-quota-snapshot.js";
import {
  buildCodexManualSnapshot,
  formatCodexManualSnapshotResult,
  parseCodexManualSnapshotOptions,
  writeCodexManualSnapshot
} from "./codex-snapshot.js";

const now = new Date("2026-08-10T00:00:00.000Z");

describe("codex manual snapshot command", () => {
  it("builds a structured manual weekly quota snapshot", () => {
    const options = parseCodexManualSnapshotOptions(
      [
        "--remaining-percent",
        "72",
        "--reset-at",
        "2026-08-16T03:00:00.000Z",
        "--observed-at",
        "2026-08-10T01:00:00.000Z",
        "--plan-label",
        "Codex /status"
      ],
      now
    );
    const document = buildCodexManualSnapshot(options, now);

    assert.equal(document.type, "quota_snapshot");
    assert.equal(document.quota_snapshot.agent, "codex");
    assert.equal(document.quota_snapshot.window_type, "weekly");
    assert.equal(document.quota_snapshot.remaining_percent, 72);
    assert.equal(document.quota_snapshot.used_percent, 28);
    assert.equal(document.quota_snapshot.reset_at, "2026-08-16T03:00:00.000Z");
    assert.equal(
      document.quota_snapshot.expires_at,
      "2026-08-16T03:00:00.000Z"
    );
    assert.equal(document.quota_snapshot.source, "manual");
  });

  it("writes a snapshot that the Codex parser can read", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-snapshot-"));

    try {
      const outputPath = join(directory, "codex-quota-snapshot.json");
      const result = await writeCodexManualSnapshot(
        parseCodexManualSnapshotOptions(
          [
            "--used-percent",
            "12",
            "--reset-at",
            "2026-08-16T03:00:00.000Z",
            "--output",
            outputPath
          ],
          now
        ),
        now
      );
      const raw = await readFile(outputPath, "utf8");
      const snapshots = parseCodexQuotaSnapshots(raw, {
        observedAt: now,
        rawSourceRef: outputPath
      });

      assert.equal(result.outputPath, outputPath);
      assert.match(formatCodexManualSnapshotResult(result), /Remaining: 88%/);
      assert.equal(snapshots.length, 1);
      assert.equal(snapshots[0]?.source, "manual");
      assert.equal(snapshots[0]?.confidence, "unknown");
      assert.equal(snapshots[0]?.remainingPercent, 88);
      assert.equal(snapshots[0]?.usedPercent, 12);
      assert.equal(snapshots[0]?.expiresAt, "2026-08-16T03:00:00.000Z");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects invalid or stale input", () => {
    assert.throws(
      () =>
        parseCodexManualSnapshotOptions(
          ["--remaining-percent", "101", "--reset-at", "2026-08-16T03:00:00Z"],
          now
        ),
      /between 0 and 100/
    );
    assert.throws(
      () =>
        parseCodexManualSnapshotOptions(
          [
            "--remaining-percent",
            "70",
            "--used-percent",
            "20",
            "--reset-at",
            "2026-08-16T03:00:00Z"
          ],
          now
        ),
      /add up to roughly 100/
    );
    assert.throws(
      () =>
        parseCodexManualSnapshotOptions(
          ["--remaining-percent", "70", "--reset-at", "2026-08-09T03:00:00Z"],
          now
        ),
      /later than the observed time/
    );
    assert.throws(
      () =>
        parseCodexManualSnapshotOptions(
          ["--remaining-percent", "70", "--reset-at"],
          now
        ),
      /--reset-at requires a value/
    );
  });
});
