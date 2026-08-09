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
  return join(homedir(), ".claude", "settings.json");
}

export function defaultClaudeStatuslineShimPath(): string {
  return join(
    defaultAppDataDir(),
    platform() === "win32" ? "claude-statusline.ps1" : "claude-statusline.sh"
  );
}
