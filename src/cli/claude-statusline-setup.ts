import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultAppDataDir } from "../config/paths.js";

export type ClaudeStatuslineSetupOptions = {
  appDataDir?: string;
  argv: string[];
  entryPointUrl: string;
  settingsPath?: string;
};

export type ClaudeStatuslineSetupResult = {
  wroteShim: boolean;
  wroteSettings: boolean;
  settingsPath: string;
  shimPath: string;
  command: string;
  message: string;
};

export async function setupClaudeStatusline(
  options: ClaudeStatuslineSetupOptions
): Promise<ClaudeStatuslineSetupResult> {
  const writeSettings = options.argv.includes("--write");
  const force = options.argv.includes("--force");
  const settingsPath =
    options.settingsPath ?? join(homedir(), ".claude", "settings.json");
  const entryPoint = resolveRunnableEntryPoint(options.entryPointUrl);
  const shim = buildShim(entryPoint, options.appDataDir ?? defaultAppDataDir());

  await writeShim(shim.path, shim.content);

  let didWriteSettings = false;

  if (writeSettings) {
    didWriteSettings = await writeClaudeSettings({
      settingsPath,
      command: shim.command,
      force
    });
  }

  return {
    wroteShim: true,
    wroteSettings: didWriteSettings,
    settingsPath,
    shimPath: shim.path,
    command: shim.command,
    message: buildSetupMessage({
      settingsPath,
      shimPath: shim.path,
      command: shim.command,
      wroteSettings: didWriteSettings,
      writeSettings
    })
  };
}

type WriteSettingsOptions = {
  settingsPath: string;
  command: string;
  force: boolean;
};

async function writeClaudeSettings(
  options: WriteSettingsOptions
): Promise<boolean> {
  let settings: Record<string, unknown> = {};

  if (existsSync(options.settingsPath)) {
    const rawSettings = await readFile(options.settingsPath, "utf8");
    settings = JSON.parse(rawSettings) as Record<string, unknown>;

    if (settings.statusLine && !options.force) {
      throw new Error(
        "Claude Code settings already has statusLine. Re-run with --force to replace it after reviewing the current value."
      );
    }

    const backupPath = `${options.settingsPath}.aiqd-backup-${Date.now()}`;
    await copyFile(options.settingsPath, backupPath);
  }

  settings.statusLine = {
    type: "command",
    command: options.command,
    padding: 1
  };

  await mkdir(dirname(options.settingsPath), { recursive: true });
  await writeFile(options.settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return true;
}

function resolveRunnableEntryPoint(entryPointUrl: string): string {
  const entryPoint = fileURLToPath(entryPointUrl);

  if (entryPoint.endsWith(join("src", "index.ts"))) {
    const distEntryPoint = entryPoint.replace(
      `${join("src", "index.ts")}`,
      `${join("dist", "index.js")}`
    );

    if (existsSync(distEntryPoint)) {
      return distEntryPoint;
    }
  }

  return entryPoint;
}

function buildShim(entryPoint: string, appDataDir: string): {
  command: string;
  content: string;
  path: string;
} {
  if (platform() === "win32") {
    const shimPath = join(appDataDir, "claude-statusline.ps1");
    const content = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      "$inputJson = [Console]::In.ReadToEnd()",
      `$node = ${toPowerShellString(process.execPath)}`,
      `$entry = ${toPowerShellString(entryPoint)}`,
      "$inputJson | & $node $entry claude-statusline-sink"
    ].join("\n");
    const command = `powershell -NoProfile -ExecutionPolicy Bypass -File ${toForwardSlashPath(
      shimPath
    )}`;

    return {
      command,
      content: `${content}\n`,
      path: shimPath
    };
  }

  const shimPath = join(appDataDir, "claude-statusline.sh");
  const content = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `${shellQuote(process.execPath)} ${shellQuote(
      entryPoint
    )} claude-statusline-sink`
  ].join("\n");

  return {
    command: shellQuote(shimPath),
    content: `${content}\n`,
    path: shimPath
  };
}

async function writeShim(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, { mode: 0o755 });
}

function buildSetupMessage(options: {
  settingsPath: string;
  shimPath: string;
  command: string;
  wroteSettings: boolean;
  writeSettings: boolean;
}): string {
  const lines = [
    "Claude Code statusline helper is ready.",
    "",
    `Shim: ${options.shimPath}`,
    `Settings: ${options.settingsPath}`,
    "",
    "Recommended settings snippet:",
    JSON.stringify(
      {
        statusLine: {
          type: "command",
          command: options.command,
          padding: 1
        }
      },
      null,
      2
    )
  ];

  if (options.wroteSettings) {
    lines.push("", "Settings were updated.");
  } else if (!options.writeSettings) {
    lines.push(
      "",
      "No Claude settings were changed. Re-run with --write to install this snippet automatically."
    );
  }

  lines.push(
    "",
    "Real-data check:",
    "1. Build the local CLI: npm run build",
    "2. Test the local sink: node dist/index.js claude-statusline-sink --self-test",
    "3. Install the statusline: node dist/index.js setup claude-statusline --write",
    "4. Open Claude Code, then refresh the dashboard or run: node dist/index.js doctor"
  );

  return lines.join("\n");
}

function toPowerShellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function toForwardSlashPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  return normalized.includes(" ") ? `"${normalized}"` : normalized;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
