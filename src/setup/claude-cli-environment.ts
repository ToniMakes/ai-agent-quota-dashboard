// Finds the local `claude` command and works out how to install it. Kept
// separate from claude-statusline-status.ts, which only reads the statusline
// snapshot and reports readiness — this file is the "what does the local
// environment look like" concern.
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, extname, join } from "node:path";

export type ClaudeCliStatus = {
  available: boolean;
  command?: string;
  onPath?: boolean;
  path?: string;
};

// "winget" is the only install method AIQD can safely run unattended (a
// known package id, no interactive prompts once the accept flags are
// passed). "script" covers every other case — AIQD only ever shows the
// command for the user to run themselves. Callers that need to decide
// whether to offer one-click install must check `method`, not guess from
// `displayCommand`'s text.
export type ClaudeInstallMethod = "winget" | "script";

export type ClaudeInstallInfo = {
  method: ClaudeInstallMethod;
  displayCommand: string;
};

export async function detectClaudeCli(): Promise<ClaudeCliStatus> {
  const path = await findCommandOnPath("claude");

  if (path) {
    return {
      available: true,
      command: "claude",
      onPath: true,
      path
    };
  }

  const localInstall = await findLocalClaudeInstall();

  if (localInstall) {
    return {
      available: true,
      command: shellExecutableCommand(localInstall),
      onPath: false,
      path: localInstall
    };
  }

  return { available: false };
}

// The single source of truth for the winget package id, so the display
// command here and the executable install args in claude-auto-setup.ts
// can't drift apart into naming two different packages.
export const wingetClaudeCodePackageId = "Anthropic.ClaudeCode";

export async function resolveClaudeInstallInfo(): Promise<ClaudeInstallInfo> {
  if (process.platform === "win32") {
    const wingetPath = await findCommandOnPath("winget");

    if (wingetPath) {
      return {
        method: "winget",
        displayCommand: `winget install ${wingetClaudeCodePackageId}`
      };
    }

    return { method: "script", displayCommand: "irm https://claude.ai/install.ps1 | iex" };
  }

  return { method: "script", displayCommand: "curl -fsSL https://claude.ai/install.sh | bash" };
}

export function defaultClaudeOpenCommand(command = "claude"): string {
  return process.platform === "win32"
    ? `Set-Location -LiteralPath 'C:\\path\\to\\your-project'\n${command}`
    : `cd /path/to/your-project\n${command}`;
}

export function claudeOpenCommandForProject(path: string, command = "claude"): string {
  if (process.platform === "win32") {
    return `Set-Location -LiteralPath ${quotePowerShellLiteral(path)}\n${command}`;
  }

  return `cd ${quotePosixShellLiteral(path)}\n${command}`;
}

async function findLocalClaudeInstall(): Promise<string | undefined> {
  const candidates =
    process.platform === "win32"
      ? [
          join(homedir(), ".local", "bin", "claude.exe"),
          process.env.LOCALAPPDATA
            ? join(process.env.LOCALAPPDATA, "Programs", "Claude", "claude.exe")
            : undefined
        ]
      : [join(homedir(), ".local", "bin", "claude")];

  for (const candidate of candidates.filter(isDefined)) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next common install location.
    }
  }

  return undefined;
}

function isDefined(value: string | undefined): value is string {
  return value !== undefined;
}

function shellExecutableCommand(path: string): string {
  return process.platform === "win32"
    ? `& ${quotePowerShellLiteral(path)}`
    : quotePosixShellLiteral(path);
}

async function findCommandOnPath(command: string): Promise<string | undefined> {
  const pathEntries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const names = commandNames(command);

  for (const directory of pathEntries) {
    for (const name of names) {
      const candidate = join(directory, name);

      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Try the next PATH candidate.
      }
    }
  }

  return undefined;
}

function commandNames(command: string): string[] {
  if (process.platform !== "win32" || extname(command)) {
    return [command];
  }

  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean);
  return [command, ...extensions.map((extension) => `${command}${extension}`)];
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quotePosixShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
