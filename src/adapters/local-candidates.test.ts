import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { findReadableCandidateFiles } from "./local-candidates.js";

describe("findReadableCandidateFiles", () => {
  it("accepts a readable file as a candidate root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-candidates-"));

    try {
      const snapshotPath = join(directory, "codex-quota-snapshot.json");
      await writeFile(snapshotPath, JSON.stringify({ type: "quota_snapshot" }));

      const candidates = await findReadableCandidateFiles([snapshotPath], {
        namePattern: /quota.*\.json$/i
      });

      assert.equal(candidates.length, 1);
      assert.equal(candidates[0]?.path, snapshotPath);
      assert.match(candidates[0]?.content ?? "", /quota_snapshot/);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
