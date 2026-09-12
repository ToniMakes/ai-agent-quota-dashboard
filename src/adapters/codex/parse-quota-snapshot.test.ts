import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  parseCodexQuotaSnapshots,
  parseCodexResetCredits
} from "./parse-quota-snapshot.js";

const fixturesDir = join(
  process.cwd(),
  "src",
  "adapters",
  "codex",
  "__fixtures__"
);
const observedAt = new Date("2026-08-09T00:00:00.000Z");

describe("parseCodexQuotaSnapshots", () => {
  it("parses explicit Codex quota snapshot records from JSONL", async () => {
    const fixture = await readFile(join(fixturesDir, "quota-snapshot.jsonl"), "utf8");
    const snapshots = parseCodexQuotaSnapshots(fixture, {
      observedAt,
      rawSourceRef: "fixture"
    });

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.provider, "openai");
    assert.equal(snapshots[0]?.agent, "codex");
    assert.equal(snapshots[0]?.windowType, "weekly");
    assert.equal(snapshots[0]?.source, "official_cli");
    assert.equal(snapshots[0]?.confidence, "official");
    assert.equal(snapshots[0]?.remainingPercent, 72);
    assert.equal(snapshots[0]?.resetAt, "2026-08-12T09:00:00.000Z");
  });

  it("parses nested usage limit records without relying on prompt content", async () => {
    const fixture = await readFile(
      join(fixturesDir, "usage-limits-nested.json"),
      "utf8"
    );
    const snapshots = parseCodexQuotaSnapshots(fixture, { observedAt });

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.windowType, "weekly");
    assert.equal(snapshots[0]?.unit, "credits");
    assert.equal(snapshots[0]?.remaining, 70);
    assert.equal(snapshots[0]?.remainingPercent, 70);
    assert.equal(snapshots[0]?.confidence, "high");
  });

  it("parses Codex session rate limit events", async () => {
    const fixture = await readFile(
      join(fixturesDir, "session-rate-limits.jsonl"),
      "utf8"
    );
    const snapshots = parseCodexQuotaSnapshots(fixture, { observedAt });

    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0]?.windowType, "session_5h");
    assert.equal(snapshots[0]?.usedPercent, 12);
    assert.equal(snapshots[0]?.remainingPercent, 88);
    assert.equal(snapshots[0]?.source, "official_cli");
    assert.equal(snapshots[0]?.confidence, "official");
    assert.equal(snapshots[0]?.observedAt, "2026-08-10T09:30:00.000Z");
    assert.equal(snapshots[1]?.windowType, "weekly");
    assert.equal(snapshots[1]?.usedPercent, 58);
    assert.equal(snapshots[1]?.remainingPercent, 42);
    assert.equal(snapshots[1]?.resetAt, "2026-08-16T08:00:00.000Z");
    assert.equal(snapshots[1]?.expiresAt, "2026-08-16T08:00:00.000Z");
  });

  it("parses Codex app-server rate limit response shapes", () => {
    const snapshots = parseCodexQuotaSnapshots(
      JSON.stringify({
        id: 6,
        result: {
          rateLimitsByLimitId: {
            codex: {
              limitId: "codex",
              limitName: null,
              planType: "pro",
              primary: {
                usedPercent: 40,
                windowDurationMins: 10080,
                resetsAt: 1786867200
              },
              secondary: null
            }
          }
        }
      }),
      { observedAt }
    );

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.windowType, "weekly");
    assert.equal(snapshots[0]?.usedPercent, 40);
    assert.equal(snapshots[0]?.remainingPercent, 60);
    assert.equal(snapshots[0]?.resetAt, "2026-08-16T08:00:00.000Z");
    assert.equal(snapshots[0]?.source, "official_cli");
  });

  it("ignores model-specific Codex rate limit buckets", () => {
    const snapshots = parseCodexQuotaSnapshots(
      [
        JSON.stringify({
          timestamp: "2026-08-15T13:58:44.642Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            rate_limits: {
              limit_id: "codex_bengalfox",
              limit_name: "GPT-5.3-Codex-Spark",
              plan_type: "prolite",
              primary: {
                used_percent: 0,
                window_minutes: 10080,
                resets_at: 1787407116
              }
            }
          }
        }),
        JSON.stringify({
          timestamp: "2026-08-15T13:59:58.752Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            rate_limits: {
              limit_id: "codex",
              limit_name: null,
              plan_type: "prolite",
              primary: {
                used_percent: 80,
                window_minutes: 10080,
                resets_at: 1787228055
              }
            }
          }
        })
      ].join("\n"),
      { observedAt }
    );

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.remainingPercent, 20);
    assert.equal(snapshots[0]?.resetAt, "2026-08-20T12:14:15.000Z");
  });

  it("ignores unrelated JSON documents", () => {
    const snapshots = parseCodexQuotaSnapshots(
      JSON.stringify({ type: "message", text: "hello" }),
      { observedAt }
    );

    assert.deepEqual(snapshots, []);
  });
});

describe("parseCodexResetCredits", () => {
  it("parses available Codex reset credits from app-server response shapes", () => {
    const credits = parseCodexResetCredits(
      JSON.stringify({
        timestamp: "2026-09-12T12:00:00.000Z",
        result: {
          rateLimitResetCredits: {
            availableCount: 2,
            credits: [
              {
                id: "RateLimitResetCredit_private",
                resetType: "codexRateLimits",
                status: "available",
                grantedAt: 1787357865,
                expiresAt: 1789949865,
                title: "Full reset"
              },
              {
                resetType: "codexRateLimits",
                status: "used",
                expiresAt: 1789949865,
                title: "Full reset"
              }
            ]
          }
        }
      }),
      { observedAt }
    );

    assert.equal(credits.length, 1);
    assert.equal(credits[0]?.provider, "openai");
    assert.equal(credits[0]?.agent, "codex");
    assert.equal(credits[0]?.resetType, "codexRateLimits");
    assert.equal(credits[0]?.status, "available");
    assert.equal(credits[0]?.title, "Full reset");
    assert.equal(credits[0]?.grantedAt, "2026-08-22T00:17:45.000Z");
    assert.equal(credits[0]?.expiresAt, "2026-09-21T00:17:45.000Z");
    assert.equal(credits[0]?.observedAt, "2026-09-12T12:00:00.000Z");
    assert.equal(credits[0]?.source, "official_cli");
    assert.equal(Object.hasOwn(credits[0] ?? {}, "id"), false);
  });

  it("parses reset credits from trusted Codex usage-limit tool results", () => {
    const credits = parseCodexResetCredits(
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
                      availableCount: 3,
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
      }),
      { observedAt }
    );

    assert.equal(credits.length, 1);
    assert.equal(credits[0]?.expiresAt, "2026-09-21T00:17:45.000Z");
    assert.equal(credits[0]?.observedAt, "2026-09-12T12:22:09.368Z");
    assert.equal(Object.hasOwn(credits[0] ?? {}, "id"), false);
    assert.equal(Object.hasOwn(credits[0] ?? {}, "accountId"), false);
    assert.equal(Object.hasOwn(credits[0] ?? {}, "description"), false);
  });

  it("does not parse arbitrary transcript text as reset credits", () => {
    const credits = parseCodexResetCredits(
      JSON.stringify({
        timestamp: "2026-09-12T12:22:09.368Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                rateLimitResetCredits: {
                  credits: [
                    {
                      resetType: "codexRateLimits",
                      status: "available",
                      expiresAt: "2026-09-21T00:17:45.000Z",
                      title: "Full reset"
                    }
                  ]
                }
              })
            }
          ]
        }
      }),
      { observedAt }
    );

    assert.deepEqual(credits, []);
  });

  it("ignores non-Codex reset credit records", () => {
    const credits = parseCodexResetCredits(
      JSON.stringify({
        rateLimitResetCredits: {
          credits: [
            {
              resetType: "otherRateLimits",
              status: "available",
              expiresAt: "2026-09-20T00:00:00.000Z",
              title: "Full reset"
            }
          ]
        }
      }),
      { observedAt }
    );

    assert.deepEqual(credits, []);
  });
});
