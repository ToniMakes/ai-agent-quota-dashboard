import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  defaultClaudeSettingsPath,
  defaultClaudeStatuslineHistoryPath,
  defaultClaudeStatuslineLatestPath,
  defaultClaudeStatuslineShimPath,
  defaultClaudeStatuslineSnapshotDir
} from "./paths.js";

describe("default Claude paths", () => {
  it("honors explicit environment overrides for setup and snapshots", () => {
    const snapshotDir = join("override", "claude-code");
    const settingsPath = join("override", "settings.json");
    const shimPath = join("override", "claude-statusline.ps1");

    withEnv(
      {
        AIQD_CLAUDE_SETTINGS_PATH: settingsPath,
        AIQD_CLAUDE_STATUSLINE_DIR: snapshotDir,
        AIQD_CLAUDE_STATUSLINE_SHIM_PATH: shimPath
      },
      () => {
        assert.equal(defaultClaudeSettingsPath(), settingsPath);
        assert.equal(defaultClaudeStatuslineSnapshotDir(), snapshotDir);
        assert.equal(
          defaultClaudeStatuslineLatestPath(),
          join(snapshotDir, "claude-code-statusline-latest.json")
        );
        assert.equal(
          defaultClaudeStatuslineHistoryPath(),
          join(snapshotDir, "claude-code-statusline-history.jsonl")
        );
        assert.equal(defaultClaudeStatuslineShimPath(), shimPath);
      }
    );
  });
});

function withEnv(env: Record<string, string>, callback: () => void): void {
  const previousValues = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(env)) {
    previousValues.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    callback();
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
