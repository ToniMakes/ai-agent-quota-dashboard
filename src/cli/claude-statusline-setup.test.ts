import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { setupClaudeStatusline } from "./claude-statusline-setup.js";

describe("claude statusline setup", () => {
  it("writes a shim without changing Claude settings by default", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-setup-"));

    try {
      const settingsPath = join(directory, ".claude", "settings.json");
      const appDataDir = join(directory, ".aiqd");
      const result = await setupClaudeStatusline({
        appDataDir,
        argv: [],
        entryPointUrl: pathToFileURL(join(directory, "dist", "index.js")).href,
        settingsPath
      });

      assert.equal(result.wroteShim, true);
      assert.equal(result.wroteSettings, false);
      assert.equal(existsSync(result.shimPath), true);
      assert.equal(existsSync(settingsPath), false);
      assert.match(result.message, /No Claude settings were changed/);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("writes Claude settings when explicitly requested", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-setup-"));

    try {
      const settingsPath = join(directory, ".claude", "settings.json");
      const result = await setupClaudeStatusline({
        appDataDir: join(directory, ".aiqd"),
        argv: ["--write"],
        entryPointUrl: pathToFileURL(join(directory, "dist", "index.js")).href,
        settingsPath
      });
      const settings = JSON.parse(await readFile(settingsPath, "utf8"));

      assert.equal(result.wroteSettings, true);
      assert.equal(settings.statusLine.type, "command");
      assert.match(settings.statusLine.command, /claude-statusline/);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
