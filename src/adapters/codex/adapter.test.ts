import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createCodexAdapter, resolveCodexDataPaths } from "./adapter.js";

describe("Codex adapter paths", () => {
  it("includes the app-owned manual snapshot path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-paths-"));
    const previousSnapshotPath = process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH;

    try {
      const snapshotPath = join(directory, "codex-quota-snapshot.json");
      process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH = snapshotPath;

      assert.ok(resolveCodexDataPaths().includes(snapshotPath));
    } finally {
      if (previousSnapshotPath === undefined) {
        delete process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH;
      } else {
        process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH = previousSnapshotPath;
      }

      await rm(directory, { force: true, recursive: true });
    }
  });

  it("parses app-owned manual snapshot files after browser saves", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-paths-"));
    const previousSnapshotPath = process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH;

    try {
      const snapshotPath = join(directory, "codex-manual-snapshot.jsonl");
      process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH = snapshotPath;
      await writeFile(
        snapshotPath,
        JSON.stringify({
          type: "quota_snapshot",
          quota_snapshot: {
            agent: "codex",
            expires_at: "2026-08-16T03:00:00.000Z",
            observed_at: "2026-08-10T01:00:00.000Z",
            plan_label: "Codex visible status",
            provider: "openai",
            remaining_percent: 42,
            reset_at: "2026-08-16T03:00:00.000Z",
            source: "manual",
            stale: false,
            unit: "percent",
            used_percent: 58,
            window_type: "weekly"
          }
        })
      );

      const adapter = createCodexAdapter({ demoMode: false });
      const result = await adapter.scan({
        now: new Date("2026-08-10T01:05:00.000Z")
      });

      assert.equal(result.snapshots.length, 1);
      assert.equal(result.snapshots[0]?.remainingPercent, 42);
      assert.equal(result.snapshots[0]?.rawSourceRef, snapshotPath);
      assert.equal(
        result.doctorChecks.find((check) => check.id === "codex:quota-source")
          ?.status,
        "pass"
      );
    } finally {
      if (previousSnapshotPath === undefined) {
        delete process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH;
      } else {
        process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH = previousSnapshotPath;
      }

      await rm(directory, { force: true, recursive: true });
    }
  });
});
