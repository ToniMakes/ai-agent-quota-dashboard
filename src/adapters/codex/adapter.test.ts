import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createCodexAdapter, resolveCodexDataPaths } from "./adapter.js";

describe("Codex adapter paths", () => {
  it("includes the app-owned manual snapshot path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-paths-"));
    const previousAppDataDir = process.env.AIQD_APP_DATA_DIR;
    const previousSnapshotPath = process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH;

    try {
      const snapshotPath = join(directory, "codex-quota-snapshot.json");
      process.env.AIQD_APP_DATA_DIR = directory;
      process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH = snapshotPath;

      assert.ok(resolveCodexDataPaths().includes(snapshotPath));
    } finally {
      if (previousAppDataDir === undefined) {
        delete process.env.AIQD_APP_DATA_DIR;
      } else {
        process.env.AIQD_APP_DATA_DIR = previousAppDataDir;
      }

      if (previousSnapshotPath === undefined) {
        delete process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH;
      } else {
        process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH = previousSnapshotPath;
      }

      await rm(directory, { force: true, recursive: true });
    }
  });

  it("parses app-owned manual snapshot files after browser saves", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-paths-"));
    const previousAppDataDir = process.env.AIQD_APP_DATA_DIR;
    const previousSnapshotPath = process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH;

    try {
      const snapshotPath = join(directory, "codex-manual-snapshot.jsonl");
      process.env.AIQD_APP_DATA_DIR = directory;
      process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH = snapshotPath;
      await writeFile(
        snapshotPath,
        JSON.stringify({
          type: "quota_snapshot",
          quota_snapshot: {
            agent: "codex",
            expires_at: "2026-08-16T03:00:00.000Z",
            observed_at: "2026-08-10T01:00:00.000Z",
            plan_label: "Codex visible status",
            provider: "openai",
            remaining_percent: 42,
            reset_at: "2026-08-16T03:00:00.000Z",
            source: "manual",
            stale: false,
            unit: "percent",
            used_percent: 58,
            window_type: "weekly"
          }
        })
      );

      const adapter = createCodexAdapter({
        configuredDataPaths: [snapshotPath],
        demoMode: false,
        includeDefaultDataPaths: false
      });
      const result = await adapter.scan({
        now: new Date("2026-08-10T01:05:00.000Z")
      });

      assert.equal(result.snapshots.length, 1);
      assert.equal(result.snapshots[0]?.remainingPercent, 42);
      assert.equal(result.snapshots[0]?.rawSourceRef, snapshotPath);
      assert.equal(
        result.doctorChecks.find((check) => check.id === "codex:quota-source")
          ?.status,
        "pass"
      );
    } finally {
      if (previousAppDataDir === undefined) {
        delete process.env.AIQD_APP_DATA_DIR;
      } else {
        process.env.AIQD_APP_DATA_DIR = previousAppDataDir;
      }

      if (previousSnapshotPath === undefined) {
        delete process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH;
      } else {
        process.env.AIQD_CODEX_MANUAL_SNAPSHOT_PATH = previousSnapshotPath;
      }

      await rm(directory, { force: true, recursive: true });
    }
  });

  it("parses recent Codex session rate limit logs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-session-"));

    try {
      const sessionPath = join(
        directory,
        "sessions",
        "2026",
        "08",
        "10",
        "rollout-2026-08-10T09-30-00-test.jsonl"
      );
      await mkdir(join(directory, "sessions", "2026", "08", "10"), {
        recursive: true
      });
      await writeFile(
        sessionPath,
        [
          JSON.stringify({
            timestamp: "2026-08-10T09:25:00.000Z",
            result: {
              rateLimitResetCredits: {
                credits: [
                  {
                    resetType: "codexRateLimits",
                    status: "available",
                    expiresAt: "2026-08-20T00:00:00.000Z",
                    title: "Old reset"
                  }
                ]
              }
            }
          }),
          JSON.stringify({
            timestamp: "2026-08-10T09:30:00.000Z",
            type: "event_msg",
            payload: {
              type: "token_count",
              rate_limits: {
                limit_id: "codex",
                primary: {
                used_percent: 12,
                window_minutes: 300,
                resets_at: "2026-08-10T15:00:00.000Z"
                },
                secondary: {
                  used_percent: 58,
                  window_minutes: 10080,
                  resets_at: 1786867200
                },
                plan_type: "pro"
              }
            }
          }),
          JSON.stringify({
            timestamp: "2026-08-10T09:35:00.000Z",
            type: "event_msg",
            payload: {
              type: "token_count",
              rate_limits: {
                limit_id: "codex",
                primary: {
                  used_percent: 61,
                  window_minutes: 10080,
                  resets_at: 1786867200
                },
                secondary: null,
                plan_type: "pro"
              }
            }
          }),
          JSON.stringify({
            timestamp: "2026-08-10T09:36:00.000Z",
            result: {
              rateLimitResetCredits: {
                availableCount: 2,
                credits: [
                  {
                    resetType: "codexRateLimits",
                    status: "available",
                    grantedAt: "2026-08-01T00:00:00.000Z",
                    expiresAt: "2026-08-18T00:00:00.000Z",
                    title: "Full reset"
                  },
                  {
                    resetType: "codexRateLimits",
                    status: "available",
                    expiresAt: "2026-08-19T00:00:00.000Z",
                    title: "Full reset"
                  },
                  {
                    resetType: "codexRateLimits",
                    status: "used",
                    expiresAt: "2026-08-20T00:00:00.000Z",
                    title: "Full reset"
                  }
                ]
              }
            }
          })
        ].join("\n")
      );
      await writeFile(
        join(directory, "codex-status.json"),
        JSON.stringify({
          type: "quota_snapshot",
          quota_snapshot: {
            observed_at: "2026-08-10T09:40:00.000Z",
            remaining_percent: 99,
            reset_at: "2026-08-16T09:00:00.000Z",
            source: "manual",
            unit: "percent",
            window_type: "weekly"
          }
        })
      );

      const adapter = createCodexAdapter({
        configuredDataPaths: [directory],
        demoMode: false,
        includeDefaultDataPaths: false
      });
      const result = await adapter.scan({
        now: new Date("2026-08-10T09:35:00.000Z")
      });

      const sessionWindow = result.snapshots.find(
        (snapshot) => snapshot.windowType === "session_5h"
      );
      const weeklyWindow = result.snapshots.find(
        (snapshot) => snapshot.windowType === "weekly"
      );

      assert.equal(result.snapshots.length, 2);
      assert.equal(sessionWindow?.remainingPercent, 88);
      assert.equal(sessionWindow?.source, "official_cli");
      assert.equal(weeklyWindow?.remainingPercent, 39);
      assert.equal(weeklyWindow?.source, "official_cli");
      assert.equal(weeklyWindow?.observedAt, "2026-08-10T09:35:00.000Z");
      assert.equal(result.resetCredits?.length, 2);
      assert.equal(result.resetCredits?.[0]?.title, "Full reset");
      assert.equal(result.resetCredits?.[0]?.expiresAt, "2026-08-18T00:00:00.000Z");
      assert.equal(result.resetCredits?.[1]?.expiresAt, "2026-08-19T00:00:00.000Z");
      assert.equal(
        result.doctorChecks.find((check) => check.id === "codex:quota-source")
          ?.status,
        "pass"
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("parses Codex usage-limit tool results from recent session logs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-tool-"));

    try {
      const sessionPath = join(
        directory,
        "sessions",
        "2026",
        "09",
        "12",
        "rollout-2026-09-12T12-22-09-test.jsonl"
      );
      await mkdir(join(directory, "sessions", "2026", "09", "12"), {
        recursive: true
      });
      await writeFile(
        sessionPath,
        JSON.stringify({
          timestamp: "2026-09-12T12:22:09.368Z",
          type: "event_msg",
          payload: {
            type: "item_completed",
            item: {
              type: "McpToolCall",
              server: "codex_app",
              tool: "get_usage_limits",
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      rateLimitResetCredits: {
                        availableCount: 1,
                        credits: [
                          {
                            id: "RateLimitResetCredit_private",
                            resetType: "codexRateLimits",
                            status: "available",
                            grantedAt: 1787357865,
                            expiresAt: 1789949865,
                            title: "Full reset",
                            description: "private"
                          }
                        ]
                      },
                      accountId: "private"
                    })
                  }
                ]
              }
            }
          }
        })
      );

      const adapter = createCodexAdapter({
        configuredDataPaths: [directory],
        demoMode: false,
        includeDefaultDataPaths: false
      });
      const result = await adapter.scan({
        now: new Date("2026-09-12T12:25:00.000Z")
      });

      assert.equal(result.resetCredits?.length, 1);
      assert.equal(result.resetCredits?.[0]?.expiresAt, "2026-09-21T00:17:45.000Z");
      assert.equal(result.resetCredits?.[0]?.observedAt, "2026-09-12T12:22:09.368Z");
      assert.equal(Object.hasOwn(result.resetCredits?.[0] ?? {}, "id"), false);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
