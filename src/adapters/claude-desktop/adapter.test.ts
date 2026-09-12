import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createClaudeDesktopAdapter } from "./adapter.js";

describe("Claude Desktop adapter", () => {
  it("reads only the subscription tier from local credentials metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-claude-desktop-"));
    const previousAppData = process.env.APPDATA;
    const previousLocalAppData = process.env.LOCALAPPDATA;
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

    try {
      process.env.APPDATA = directory;
      process.env.LOCALAPPDATA = join(directory, "LocalAppData");
      process.env.CLAUDE_CONFIG_DIR = join(directory, "MissingClaudeConfig");

      const claudeDirectory = join(directory, "Claude");
      await mkdir(claudeDirectory, { recursive: true });
      await writeFile(
        join(claudeDirectory, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "private-token",
            refreshToken: "private-refresh-token",
            subscriptionType: "pro"
          }
        })
      );
      await writeFile(
        join(claudeDirectory, "plan-usage-history.json"),
        JSON.stringify({
          samples: [
            {
              t: Date.parse("2026-08-10T01:00:00.000Z"),
              u: {
                fh: 26,
                sd: 32
              }
            }
          ]
        })
      );

      const adapter = createClaudeDesktopAdapter({
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
      restoreEnvironmentVariable("APPDATA", previousAppData);
      restoreEnvironmentVariable("LOCALAPPDATA", previousLocalAppData);
      restoreEnvironmentVariable("CLAUDE_CONFIG_DIR", previousClaudeConfigDir);
      await rm(directory, { force: true, recursive: true });
    }
  });
});

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
