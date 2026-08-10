import { spawn } from "node:child_process";
import { platform as hostPlatform } from "node:os";
import { setupClaudeStatusline } from "../cli/claude-statusline-setup.js";
import {
  getClaudeStatuslineSetupStatus,
  type ClaudeStatuslineSetupStatus
} from "./claude-statusline-status.js";

export type ClaudeAutoSetupStepState = "pass" | "warn" | "fail" | "skip";

export type ClaudeAutoSetupStep = {
  id: "claude-cli" | "statusline";
  label: string;
  state: ClaudeAutoSetupStepState;
  message: string;
  command?: string;
  detail?: string;
  exitCode?: number;
};

export type ClaudeAutoSetupResult = {
  ok: boolean;
  needsUserAction: boolean;
  nextAction: string;
  steps: ClaudeAutoSetupStep[];
};

export type ClaudeAutoSetupOptions = {
  entryPointUrl: string;
  installIfMissing?: boolean;
  platform?: NodeJS.Platform;
  runCommand?: CommandRunner;
  setupStatusline?: (argv: string[]) => Promise<{
    command: string;
    settingsPath: string;
    shimPath: string;
  }>;
  statusLookup?: () => Promise<ClaudeStatuslineSetupStatus>;
};

export type CommandRunResult = {
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
  timedOut?: boolean;
};

export type CommandRunner = (
  command: string,
  args: string[],
  options?: {
    timeoutMs?: number;
  }
) => Promise<CommandRunResult>;

type StatuslineSetupRunner = (argv: string[]) => Promise<{
  command: string;
  settingsPath: string;
  shimPath: string;
}>;

const installTimeoutMs = 5 * 60 * 1000;

export async function runClaudeAutoSetup(
  options: ClaudeAutoSetupOptions
): Promise<{
  result: ClaudeAutoSetupResult;
  status: ClaudeStatuslineSetupStatus;
}> {
  const statusLookup = options.statusLookup ?? getClaudeStatuslineSetupStatus;
  const runCommand = options.runCommand ?? runExternalCommand;
  const platform = options.platform ?? hostPlatform();
  const setupStatusline: StatuslineSetupRunner =
    options.setupStatusline ??
    ((argv: string[]) =>
      setupClaudeStatusline({
        argv,
        entryPointUrl: options.entryPointUrl
      }));
  const steps: ClaudeAutoSetupStep[] = [];

  let status = await statusLookup();
  const installStep = await maybeInstallClaudeCli({
    installIfMissing: options.installIfMissing === true,
    platform,
    runCommand,
    status
  });
  steps.push(installStep);

  status = await statusLookup();
  const statuslineStep = await maybeWriteStatusline({
    setupStatusline,
    status
  });
  steps.push(statuslineStep);

  const finalStatus = await statusLookup();
  const result = buildResult(steps, finalStatus);

  return {
    result,
    status: finalStatus
  };
}

async function maybeInstallClaudeCli(options: {
  installIfMissing: boolean;
  platform: NodeJS.Platform;
  runCommand: CommandRunner;
  status: ClaudeStatuslineSetupStatus;
}): Promise<ClaudeAutoSetupStep> {
  if (options.status.claudeCliAvailable) {
    return {
      id: "claude-cli",
      label: "Claude Code CLI",
      message: "claude command is already available.",
      state: "skip"
    };
  }

  if (!options.installIfMissing) {
    return {
      detail:
        "AIQD did not install anything. If Claude Code already works in your terminal, open it once from there or restart AIQD so PATH changes are visible.",
      id: "claude-cli",
      label: "Claude Code CLI",
      message:
        "claude command was not found on PATH; installation was not run.",
      state: "warn"
    };
  }

  const installPlan = buildInstallPlan(options.status, options.platform);

  if (!installPlan) {
    return {
      command: options.status.claudeCliInstallCommand,
      detail: options.status.claudeCliDocsUrl,
      id: "claude-cli",
      label: "Claude Code CLI",
      message:
        "AIQD cannot safely automate this installer on the current platform.",
      state: "warn"
    };
  }

  const result = await options.runCommand(installPlan.command, installPlan.args, {
    timeoutMs: installTimeoutMs
  });
  const detail = commandResultDetail(result);

  if (result.exitCode === 0 && !result.timedOut) {
    const step: ClaudeAutoSetupStep = {
      command: installPlan.displayCommand,
      id: "claude-cli",
      label: "Claude Code CLI",
      message: "Claude Code installer finished.",
      state: "pass"
    };

    if (detail) {
      step.detail = detail;
    }

    return step;
  }

  const step: ClaudeAutoSetupStep = {
    command: installPlan.displayCommand,
    id: "claude-cli",
    label: "Claude Code CLI",
    message: result.timedOut
      ? "Claude Code installer timed out."
      : "Claude Code installer failed.",
    state: "fail"
  };

  if (result.exitCode !== null) {
    step.exitCode = result.exitCode;
  }

  if (detail) {
    step.detail = detail;
  }

  return step;
}

function buildInstallPlan(
  status: ClaudeStatuslineSetupStatus,
  platform: NodeJS.Platform
):
  | {
      args: string[];
      command: string;
      displayCommand: string;
    }
  | undefined {
  if (
    platform !== "win32" ||
    !status.claudeCliInstallCommand.includes("Anthropic.ClaudeCode")
  ) {
    return undefined;
  }

  const args = [
    "install",
    "--id",
    "Anthropic.ClaudeCode",
    "--accept-source-agreements",
    "--accept-package-agreements"
  ];

  return {
    args,
    command: "winget",
    displayCommand: `winget ${args.join(" ")}`
  };
}

async function maybeWriteStatusline(options: {
  setupStatusline: StatuslineSetupRunner;
  status: ClaudeStatuslineSetupStatus;
}): Promise<ClaudeAutoSetupStep> {
  if (
    options.status.statusLineConfigured &&
    !options.status.statusLineManagedByApp
  ) {
    const step: ClaudeAutoSetupStep = {
      command: options.status.forceWriteCommand,
      id: "statusline",
      label: "Claude Code statusline",
      message:
        "Claude Code already has a statusLine command, so AIQD did not replace it automatically.",
      state: "warn"
    };

    if (options.status.statusLineCommand) {
      step.detail = options.status.statusLineCommand;
    }

    return step;
  }

  try {
    const argv = options.status.statusLineManagedByApp
      ? ["--write", "--force"]
      : ["--write"];
    const result = await options.setupStatusline(argv);

    return {
      command: result.command,
      detail: `Settings: ${result.settingsPath}\nShim: ${result.shimPath}`,
      id: "statusline",
      label: "Claude Code statusline",
      message: "AIQD statusline capture is installed.",
      state: "pass"
    };
  } catch (error) {
    return {
      id: "statusline",
      label: "Claude Code statusline",
      message: "AIQD could not write the Claude Code statusline setting.",
      detail: error instanceof Error ? error.message : String(error),
      state: "fail"
    };
  }
}

function buildResult(
  steps: ClaudeAutoSetupStep[],
  status: ClaudeStatuslineSetupStatus
): ClaudeAutoSetupResult {
  const failed = steps.some((step) => step.state === "fail");
  const warning = steps.some((step) => step.state === "warn");

  return {
    ok: !failed,
    needsUserAction: failed || warning || status.readiness !== "ready",
    nextAction: nextActionForStatus({
      failed,
      cliMissingWarning: steps.some(
        (step) => step.id === "claude-cli" && step.state === "warn"
      ),
      status,
      warning
    }),
    steps
  };
}

function nextActionForStatus(input: {
  cliMissingWarning: boolean;
  failed: boolean;
  status: ClaudeStatuslineSetupStatus;
  warning: boolean;
}): string {
  if (input.failed) {
    return "Review the failed step, then try again.";
  }

  if (input.cliMissingWarning) {
    return "AIQD finished the local statusline setup, but this running process cannot see the claude command yet. If Claude Code works in your terminal, open it there once and then restart AIQD if needed.";
  }

  if (input.warning) {
    return "Review the warning before AIQD changes existing Claude Code settings.";
  }

  if (input.status.readiness === "ready") {
    return "Claude Code quota data is ready. Refresh the dashboard.";
  }

  if (input.status.claudeCliAvailable) {
    return "AIQD finished the local setup. Open Claude Code from a terminal once so it can send quota data.";
  }

  return "AIQD finished the local setup, but this running process cannot see the claude command yet. Open a new terminal, check claude --version, then restart AIQD if needed.";
}

async function runExternalCommand(
  command: string,
  args: string[],
  options: {
    timeoutMs?: number;
  } = {}
): Promise<CommandRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    });
    const chunks = {
      stderr: [] as Buffer[],
      stdout: [] as Buffer[]
    };
    let timedOut = false;
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, options.timeoutMs)
      : undefined;

    child.stdout.on("data", (chunk: Buffer) => chunks.stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.stderr.push(chunk));
    child.once("error", (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      resolve({
        exitCode,
        signal,
        stderr: limitedOutput(chunks.stderr),
        stdout: limitedOutput(chunks.stdout),
        timedOut
      });
    });
  });
}

function commandResultDetail(result: CommandRunResult): string | undefined {
  const detail = [
    result.timedOut ? "Timed out." : undefined,
    result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : undefined,
    result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : undefined
  ].filter(Boolean);

  return detail.length > 0 ? detail.join("\n\n") : undefined;
}

function limitedOutput(chunks: Buffer[], maxBytes = 8 * 1024): string {
  const output = Buffer.concat(chunks);

  if (output.length <= maxBytes) {
    return output.toString("utf8");
  }

  return `${output.subarray(0, maxBytes).toString("utf8")}\n[output truncated]`;
}
