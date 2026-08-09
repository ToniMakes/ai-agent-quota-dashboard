import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveCodexDataPaths } from "./adapter.js";

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
});
