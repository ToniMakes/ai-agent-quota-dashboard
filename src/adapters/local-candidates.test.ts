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

  it("skips oversized files and respects the candidate limit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-candidates-"));

    try {
      await writeFile(join(directory, "first.json"), "12345");
      await writeFile(join(directory, "second.json"), "67890");

      const candidates = await findReadableCandidateFiles([directory], {
        maxBytes: 5,
        maxFiles: 1,
        namePattern: /\.json$/i
      });

      assert.equal(candidates.length, 1);
      assert.equal(candidates[0]?.content, "12345");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("supports global name patterns without skipping alternating files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-candidates-"));

    try {
      await writeFile(join(directory, "first.json"), "first");
      await writeFile(join(directory, "second.json"), "second");

      const candidates = await findReadableCandidateFiles([directory], {
        namePattern: /\.json$/gi
      });

      assert.equal(candidates.length, 2);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
