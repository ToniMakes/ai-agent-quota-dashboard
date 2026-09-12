import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createClaudeCodeAdapter } from "./adapter.js";

describe("Claude Code adapter", () => {
  it("reads only the subscription tier from local credentials metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-claude-code-"));
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

    try {
      process.env.CLAUDE_CONFIG_DIR = directory;
      await writeFile(
        join(directory, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "private-token",
            refreshToken: "private-refresh-token",
            subscriptionType: "pro",
            rateLimitTier: "default_claude_ai"
          }
        })
      );
      await writeFile(
        join(directory, "claude-statusline-latest.json"),
        JSON.stringify({
          observed_at: "2026-08-10T01:00:00.000Z",
          rate_limits: {
            seven_day: {
              used_percentage: 20,
              reset_at: "2026-08-16T03:00:00.000Z"
            }
          }
        })
      );

      const adapter = createClaudeCodeAdapter({
        configuredDataPaths: [],
        demoMode: false
      });
      const result = await adapter.scan({
        now: new Date("2026-08-10T01:05:00.000Z")
      });

      assert.equal(result.subscriptionTier, "Pro");
      assert.equal(JSON.stringify(result).includes("private-token"), false);
      assert.equal(JSON.stringify(result).includes("private-refresh-token"), false);
    } finally {
      if (previousClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir;
      }

      await rm(directory, { force: true, recursive: true });
    }
  });
});
