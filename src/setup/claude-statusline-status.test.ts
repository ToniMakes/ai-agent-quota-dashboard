import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { getClaudeStatuslineSetupStatus } from "./claude-statusline-status.js";

describe("getClaudeStatuslineSetupStatus", () => {
  it("reports missing setup without writing files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");

    try {
      const status = await getClaudeStatuslineSetupStatus({
        historyPath: join(directory, "history.jsonl"),
        latestPath: join(directory, "latest.json"),
        settingsPath,
        shimPath: join(directory, "shim.ps1")
      });

      assert.equal(status.settingsExists, false);
      assert.equal(status.statusLineConfigured, false);
      assert.equal(status.shimExists, false);
      assert.equal(status.latestExists, false);
      assert.equal(status.latestHasRateLimits, false);

      await assert.rejects(readFile(settingsPath, "utf8"));
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("detects configured statusline and sanitized latest snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");
    const latestPath = join(directory, "latest.json");

    try {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(
        settingsPath,
        JSON.stringify({
          statusLine: {
            type: "command",
            command: "powershell -File claude-statusline.ps1"
          }
        })
      );
      await writeFile(
        latestPath,
        JSON.stringify({
          type: "claude_code_statusline_rate_limits",
          observed_at: "2026-08-09T00:00:00.000Z",
          rate_limits: {
            five_hour: {
              used_percentage: 44,
              resets_at: 1786233600
            }
          }
        })
      );

      const status = await getClaudeStatuslineSetupStatus({
        historyPath: join(directory, "history.jsonl"),
        latestPath,
        settingsPath,
        shimPath: join(directory, "shim.ps1")
      });

      assert.equal(status.settingsExists, true);
      assert.equal(status.statusLineConfigured, true);
      assert.equal(status.statusLineManagedByApp, true);
      assert.equal(status.latestHasRateLimits, true);
      assert.equal(status.latestObservedAt, "2026-08-09T00:00:00.000Z");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
