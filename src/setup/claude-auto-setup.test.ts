import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runClaudeAutoSetup,
  type CommandRunner
} from "./claude-auto-setup.js";
import type { ClaudeStatuslineSetupStatus } from "./claude-statusline-status.js";

describe("runClaudeAutoSetup", () => {
  it("connects existing Claude Code by default without running an installer", async () => {
    const commands: Array<{ command: string; args: string[] }> = [];
    const setupArgv: string[][] = [];
    const statuses = [
      status({
        claudeCliAvailable: false,
        statusLineConfigured: false,
        statusLineManagedByApp: false
      }),
      status({
        claudeCliAvailable: false,
        statusLineConfigured: false,
        statusLineManagedByApp: false
      }),
      status({
        claudeCliAvailable: false,
        statusLineConfigured: true,
        statusLineManagedByApp: true
      })
    ];
    const result = await runClaudeAutoSetup({
      entryPointUrl: "file:///app/dist/index.js",
      platform: "win32",
      runCommand: recordCommand(commands),
      setupStatusline: async (argv) => {
        setupArgv.push(argv);
        return {
          command: "powershell -File claude-statusline.ps1",
          settingsPath: "C:\\Users\\hitomi\\.claude\\settings.json",
          shimPath: "C:\\Users\\hitomi\\.aiqd\\claude-statusline.ps1"
        };
      },
      statusLookup: async () => statuses.shift() ?? statuses.at(-1)!
    });

    assert.equal(commands.length, 0);
    assert.deepEqual(setupArgv[0], ["--write"]);
    assert.equal(result.result.ok, true);
    assert.equal(result.result.needsUserAction, true);
    assert.equal(result.result.steps[0]?.state, "warn");
    assert.equal(result.result.steps[1]?.state, "pass");
    assert.match(result.result.nextAction, /cannot see the claude command/);
  });

  it("installs Claude Code with WinGet only when explicitly requested", async () => {
    const commands: Array<{ command: string; args: string[] }> = [];
    const setupArgv: string[][] = [];
    const statuses = [
      status({
        claudeCliAvailable: false,
        statusLineConfigured: false,
        statusLineManagedByApp: false
      }),
      status({
        claudeCliAvailable: true,
        statusLineConfigured: false,
        statusLineManagedByApp: false
      }),
      status({
        claudeCliAvailable: true,
        statusLineConfigured: true,
        statusLineManagedByApp: true
      })
    ];
    const result = await runClaudeAutoSetup({
      entryPointUrl: "file:///app/dist/index.js",
      installIfMissing: true,
      platform: "win32",
      runCommand: recordCommand(commands),
      setupStatusline: async (argv) => {
        setupArgv.push(argv);
        return {
          command: "powershell -File claude-statusline.ps1",
          settingsPath: "C:\\Users\\hitomi\\.claude\\settings.json",
          shimPath: "C:\\Users\\hitomi\\.aiqd\\claude-statusline.ps1"
        };
      },
      statusLookup: async () => statuses.shift() ?? statuses.at(-1)!
    });

    assert.equal(result.result.ok, true);
    assert.equal(commands[0]?.command, "winget");
    assert.deepEqual(commands[0]?.args.slice(0, 3), [
      "install",
      "--id",
      "Anthropic.ClaudeCode"
    ]);
    assert.deepEqual(setupArgv[0], ["--write"]);
    assert.equal(result.result.steps[0]?.state, "pass");
    assert.equal(result.result.steps[1]?.state, "pass");
  });

  it("does not replace an existing non-AIQD Claude statusline automatically", async () => {
    let setupCalled = false;
    const result = await runClaudeAutoSetup({
      entryPointUrl: "file:///app/dist/index.js",
      platform: "win32",
      setupStatusline: async () => {
        setupCalled = true;
        throw new Error("should not be called");
      },
      statusLookup: async () =>
        status({
          claudeCliAvailable: true,
          statusLineCommand: "custom-statusline-command",
          statusLineConfigured: true,
          statusLineManagedByApp: false
        })
    });

    assert.equal(setupCalled, false);
    assert.equal(result.result.ok, true);
    assert.equal(result.result.needsUserAction, true);
    assert.equal(result.result.steps[0]?.state, "skip");
    assert.equal(result.result.steps[1]?.state, "warn");
    assert.match(result.result.nextAction, /warning/i);
  });

  it("force-refreshes the app-managed statusline when it already exists", async () => {
    const setupArgv: string[][] = [];
    const result = await runClaudeAutoSetup({
      entryPointUrl: "file:///app/dist/index.js",
      platform: "win32",
      setupStatusline: async (argv) => {
        setupArgv.push(argv);
        return {
          command: "powershell -File claude-statusline.ps1",
          settingsPath: "C:\\Users\\hitomi\\.claude\\settings.json",
          shimPath: "C:\\Users\\hitomi\\.aiqd\\claude-statusline.ps1"
        };
      },
      statusLookup: async () =>
        status({
          claudeCliAvailable: true,
          statusLineConfigured: true,
          statusLineManagedByApp: true
        })
    });

    assert.equal(result.result.steps[0]?.state, "skip");
    assert.equal(result.result.steps[1]?.state, "pass");
    assert.deepEqual(setupArgv[0], ["--write", "--force"]);
  });
});

function recordCommand(
  commands: Array<{ command: string; args: string[] }>
): CommandRunner {
  return async (command, args) => {
    commands.push({ command, args });
    return {
      exitCode: 0,
      stderr: "",
      stdout: "installed\n"
    };
  };
}

function status(
  overrides: Partial<ClaudeStatuslineSetupStatus> = {}
): ClaudeStatuslineSetupStatus {
  return {
    checks: [],
    claudeCliAvailable: true,
    claudeCliCommand: "claude",
    claudeCliDocsUrl: "https://docs.anthropic.com/en/docs/claude-code/quickstart",
    claudeCliExampleProjectOpenCommand:
      "Set-Location -LiteralPath 'C:\\repo'\nclaude",
    claudeCliExampleProjectPath: "C:\\repo",
    claudeCliInstallCommand: "winget install Anthropic.ClaudeCode",
    claudeCliOpenCommand: "Set-Location -LiteralPath 'C:\\path'\nclaude",
    forceWriteCommand: "node dist/index.js setup claude-statusline --write --force",
    historyExists: false,
    historyPath: "C:\\aiqd\\history.jsonl",
    latestExists: false,
    latestHasRateLimits: false,
    latestPath: "C:\\aiqd\\latest.json",
    latestWindowTypes: [],
    nextAction: "Open Claude Code.",
    notSavedFields: [],
    previewCommand: "node dist/index.js setup claude-statusline",
    readiness: "waiting_for_data",
    readinessLabel: "Waiting for Claude Code data",
    savedFields: [],
    selfTestCommand: "node dist/index.js claude-statusline-sink --self-test",
    settingsExists: true,
    settingsPath: "C:\\Users\\hitomi\\.claude\\settings.json",
    shimExists: true,
    shimPath: "C:\\aiqd\\claude-statusline.ps1",
    statusLineConfigured: true,
    statusLineManagedByApp: true,
    writeCommand: "node dist/index.js setup claude-statusline --write",
    ...overrides
  };
}
