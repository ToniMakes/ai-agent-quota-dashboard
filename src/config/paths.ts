import { homedir, platform } from "node:os";
import { join } from "node:path";

export function defaultAppDataDir(): string {
  return join(homedir(), ".ai-agent-quota-dashboard");
}

export function defaultUserConfigPath(): string {
  return join(defaultAppDataDir(), "config.json");
}

export function defaultCodexSnapshotDir(): string {
  return join(defaultAppDataDir(), "codex");
}

export function defaultCodexManualSnapshotPath(): string {
  if (process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH) {
    return process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH;
  }

  return join(defaultCodexSnapshotDir(), "codex-quota-snapshot.json");
}

export function defaultClaudeStatuslineSnapshotDir(): string {
  if (process.env.AIQD_CLAUDE_STATUSLINE_DIR) {
    return process.env.AIQD_CLAUDE_STATUSLINE_DIR;
  }

  return join(defaultAppDataDir(), "claude-code");
}

export function defaultClaudeStatuslineHistoryPath(): string {
  return join(
    defaultClaudeStatuslineSnapshotDir(),
    "claude-code-statusline-history.jsonl"
  );
}

export function defaultClaudeStatuslineLatestPath(): string {
  return join(
    defaultClaudeStatuslineSnapshotDir(),
    "claude-code-statusline-latest.json"
  );
}

export function defaultClaudeSettingsPath(): string {
  if (process.env.AIQD_CLAUDE_SETTINGS_PATH) {
    return process.env.AIQD_CLAUDE_SETTINGS_PATH;
  }

  return join(homedir(), ".claude", "settings.json");
}

export function defaultClaudeStatuslineShimPath(): string {
  if (process.env.AIQD_CLAUDE_STATUSLINE_SHIM_PATH) {
    return process.env.AIQD_CLAUDE_STATUSLINE_SHIM_PATH;
  }

  return join(
    defaultAppDataDir(),
    platform() === "win32" ? "claude-statusline.ps1" : "claude-statusline.sh"
  );
}
