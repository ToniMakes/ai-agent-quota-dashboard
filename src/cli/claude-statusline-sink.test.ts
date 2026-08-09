import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSanitizedClaudeStatuslineRecord,
  runClaudeStatuslineSink
} from "./claude-statusline-sink.js";

const observedAt = new Date("2026-08-09T00:00:00.000Z");

describe("claude statusline sink", () => {
  it("sanitizes statusline input down to rate limit fields", () => {
    const record = buildSanitizedClaudeStatuslineRecord(
      JSON.stringify({
        session_id: "do-not-store",
        transcript_path: "do-not-store",
        workspace: {
          current_dir: "do-not-store"
        },
        rate_limits: {
          five_hour: {
            used_percentage: 30,
            remaining_percentage: 70,
            resets_at: 1786233600,
            extra: "drop-me"
          }
        }
      }),
      observedAt
    );

    assert.deepEqual(record, {
      type: "claude_code_statusline_rate_limits",
      observed_at: "2026-08-09T00:00:00.000Z",
      rate_limits: {
        five_hour: {
          used_percentage: 30,
          remaining_percentage: 70,
          resets_at: 1786233600
        }
      }
    });
  });

  it("writes latest and history snapshots when rate limit data exists", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-statusline-"));
    const latestPath = join(directory, "latest.json");
    const historyPath = join(directory, "history.jsonl");

    try {
      const result = await runClaudeStatuslineSink({
        input: JSON.stringify({
          rate_limits: {
            five_hour: {
              used_percentage: 44,
              resets_at: 1786233600
            }
          }
        }),
        now: observedAt,
        latestPath,
        historyPath
      });

      assert.equal(result.wroteSnapshot, true);
      assert.equal(result.snapshots.length, 1);
      assert.match(result.statusText, /Claude quota: 5h 44% used/);
      assert.match(await readFile(latestPath, "utf8"), /rate_limits/);
      assert.match(await readFile(historyPath, "utf8"), /rate_limits/);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("does not write snapshots when rate limit data is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-statusline-"));

    try {
      const result = await runClaudeStatuslineSink({
        input: JSON.stringify({
          context_window: {
            used_percentage: 10
          }
        }),
        now: observedAt,
        latestPath: join(directory, "latest.json"),
        historyPath: join(directory, "history.jsonl")
      });

      assert.equal(result.wroteSnapshot, false);
      assert.equal(result.snapshots.length, 0);
      assert.equal(result.statusText, "Claude quota: waiting for rate limit data");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
