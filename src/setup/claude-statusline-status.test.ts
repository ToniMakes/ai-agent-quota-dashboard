import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { getClaudeStatuslineSetupStatus } from "./claude-statusline-status.js";

describe("getClaudeStatuslineSetupStatus", () => {
  it("reports missing setup without writing files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");

    try {
      const status = await getClaudeStatuslineSetupStatus({
        historyPath: join(directory, "history.jsonl"),
        latestPath: join(directory, "latest.json"),
        settingsPath,
        shimPath: join(directory, "shim.ps1")
      });

      assert.equal(status.settingsExists, false);
      assert.equal(status.statusLineConfigured, false);
      assert.equal(status.shimExists, false);
      assert.equal(status.latestExists, false);
      assert.equal(status.latestHasRateLimits, false);
      assert.equal(status.readiness, "needs_setup");
      assert.equal(status.readinessLabel, "Setup required");
      assert.match(status.nextAction, /setup claude-statusline --write/);
      assert.match(
        status.selfTestCommand,
        /claude-statusline-sink --self-test/
      );
      assert.equal(
        status.checks.find((check) => check.id === "statusline-command")?.status,
        "warn"
      );

      await assert.rejects(readFile(settingsPath, "utf8"));
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("detects configured statusline and sanitized latest snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");
    const latestPath = join(directory, "latest.json");
    const shimPath = join(directory, "claude-statusline.ps1");

    try {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(shimPath, "");
      await writeFile(
        settingsPath,
        JSON.stringify({
          statusLine: {
            type: "command",
            command: "powershell -File claude-statusline.ps1"
          }
        })
      );
      await writeFile(
        latestPath,
        JSON.stringify({
          type: "claude_code_statusline_rate_limits",
          observed_at: "2026-08-09T00:00:00.000Z",
          rate_limits: {
            five_hour: {
              used_percentage: 44,
              resets_at: 1786233600
            }
          }
        })
      );

      const status = await getClaudeStatuslineSetupStatus({
        historyPath: join(directory, "history.jsonl"),
        latestPath,
        now: new Date("2026-08-09T01:00:00.000Z"),
        settingsPath,
        shimPath
      });

      assert.equal(status.settingsExists, true);
      assert.equal(status.statusLineConfigured, true);
      assert.equal(status.statusLineManagedByApp, true);
      assert.equal(status.shimExists, true);
      assert.equal(status.latestHasRateLimits, true);
      assert.equal(status.latestObservedAt, "2026-08-09T00:00:00.000Z");
      assert.equal(status.latestAgeSeconds, 3600);
      assert.deepEqual(status.latestWindowTypes, ["session_5h"]);
      assert.equal(status.readiness, "ready");
      assert.equal(
        status.checks.find((check) => check.id === "latest-snapshot")?.status,
        "pass"
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("accepts UTF-8 BOM in settings and latest snapshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");
    const latestPath = join(directory, "latest.json");
    const shimPath = join(directory, "claude-statusline.ps1");

    try {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(shimPath, "");
      await writeFile(
        settingsPath,
        `\uFEFF${JSON.stringify({
          statusLine: {
            type: "command",
            command: "powershell -File claude-statusline.ps1"
          }
        })}`
      );
      await writeFile(
        latestPath,
        `\uFEFF${JSON.stringify({
          type: "claude_code_statusline_rate_limits",
          observed_at: "2026-08-09T00:00:00.000Z",
          rate_limits: {
            daily: {
              used_percentage: 21,
              resets_at: 1786233600
            }
          }
        })}`
      );

      const status = await getClaudeStatuslineSetupStatus({
        historyPath: join(directory, "history.jsonl"),
        latestPath,
        now: new Date("2026-08-09T01:00:00.000Z"),
        settingsPath,
        shimPath
      });

      assert.equal(status.statusLineConfigured, true);
      assert.equal(status.statusLineManagedByApp, true);
      assert.equal(status.latestHasRateLimits, true);
      assert.deepEqual(status.latestWindowTypes, ["daily"]);
      assert.equal(status.readiness, "ready");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("waits for data after setup without suggesting another install", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");
    const shimPath = join(directory, "claude-statusline.ps1");

    try {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(shimPath, "");
      await writeFile(
        settingsPath,
        JSON.stringify({
          statusLine: {
            type: "command",
            command: "powershell -File claude-statusline.ps1"
          }
        })
      );

      const status = await getClaudeStatuslineSetupStatus({
        claudeCliLookup: async () => ({
          available: true,
          path: "C:\\Tools\\Claude\\claude.exe"
        }),
        historyPath: join(directory, "history.jsonl"),
        latestPath: join(directory, "latest.json"),
        settingsPath,
        shimPath
      });
      const latestCheck = status.checks.find(
        (check) => check.id === "latest-snapshot"
      );

      assert.equal(status.readiness, "waiting_for_data");
      assert.match(status.nextAction, /let the statusline render once/);
      assert.doesNotMatch(status.nextAction, /after installing/);
      assert.match(latestCheck?.action ?? "", /let the statusline render once/);
      assert.doesNotMatch(latestCheck?.action ?? "", /after installing/);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("reports whether the Claude Code CLI command is available", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");

    try {
      const status = await getClaudeStatuslineSetupStatus({
        claudeCliLookup: async () => ({
          available: true,
          path: "C:\\Tools\\Claude\\claude.exe"
        }),
        historyPath: join(directory, "history.jsonl"),
        latestPath: join(directory, "latest.json"),
        settingsPath,
        shimPath: join(directory, "shim.ps1")
      });

      assert.equal(status.claudeCliAvailable, true);
      assert.equal(status.claudeCliCommand, "claude");
      assert.equal(status.claudeCliPath, "C:\\Tools\\Claude\\claude.exe");
      assert.equal(
        status.checks.find((check) => check.id === "claude-cli")?.status,
        "pass"
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("guides users to install Claude Code CLI when claude is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");
    const shimPath = join(directory, "claude-statusline.ps1");

    try {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(shimPath, "");
      await writeFile(
        settingsPath,
        JSON.stringify({
          statusLine: {
            type: "command",
            command: "powershell -File claude-statusline.ps1"
          }
        })
      );

      const status = await getClaudeStatuslineSetupStatus({
        claudeCliLookup: async () => ({ available: false }),
        historyPath: join(directory, "history.jsonl"),
        latestPath: join(directory, "latest.json"),
        settingsPath,
        shimPath
      });
      const cliCheck = status.checks.find((check) => check.id === "claude-cli");

      assert.equal(status.claudeCliAvailable, false);
      assert.equal(status.readiness, "waiting_for_data");
      assert.equal(status.readinessLabel, "Waiting for Claude Code CLI command");
      assert.match(status.nextAction, /Open Claude Code from your usual terminal/);
      assert.equal(cliCheck?.status, "warn");
      assert.match(
        cliCheck?.action ?? "",
        /Open Claude Code from your usual terminal/
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("marks old rate limit snapshots as needing attention", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");
    const latestPath = join(directory, "latest.json");
    const shimPath = join(directory, "claude-statusline.ps1");

    try {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(shimPath, "");
      await writeFile(
        settingsPath,
        JSON.stringify({
          statusLine: {
            type: "command",
            command: "powershell -File claude-statusline.ps1"
          }
        })
      );
      await writeFile(
        latestPath,
        JSON.stringify({
          type: "claude_code_statusline_rate_limits",
          observed_at: "2026-08-09T00:00:00.000Z",
          rate_limits: {
            five_hour: {
              used_percentage: 44,
              resets_at: 1786233600
            },
            seven_day: {
              used_percentage: 12,
              resets_at: 1786579200
            }
          }
        })
      );

      const status = await getClaudeStatuslineSetupStatus({
        historyPath: join(directory, "history.jsonl"),
        latestPath,
        now: new Date("2026-08-09T08:30:00.000Z"),
        settingsPath,
        shimPath
      });

      assert.equal(status.readiness, "needs_attention");
      assert.deepEqual(status.latestWindowTypes, ["session_5h", "weekly"]);
      assert.match(
        status.checks.find((check) => check.id === "latest-snapshot")?.message ?? "",
        /old/
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("does not treat empty rate_limits as usable data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-status-"));
    const settingsPath = join(directory, ".claude", "settings.json");
    const latestPath = join(directory, "latest.json");
    const shimPath = join(directory, "claude-statusline.ps1");

    try {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(shimPath, "");
      await writeFile(
        settingsPath,
        JSON.stringify({
          statusLine: {
            type: "command",
            command: "powershell -File claude-statusline.ps1"
          }
        })
      );
      await writeFile(
        latestPath,
        JSON.stringify({
          type: "claude_code_statusline_rate_limits",
          observed_at: "2026-08-09T00:00:00.000Z",
          rate_limits: {
            five_hour: {
              resets_at: 1786233600
            }
          }
        })
      );

      const status = await getClaudeStatuslineSetupStatus({
        historyPath: join(directory, "history.jsonl"),
        latestPath,
        now: new Date("2026-08-09T01:00:00.000Z"),
        settingsPath,
        shimPath
      });

      assert.equal(status.latestHasRateLimits, false);
      assert.deepEqual(status.latestWindowTypes, []);
      assert.equal(status.readiness, "waiting_for_data");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
