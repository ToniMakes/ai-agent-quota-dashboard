const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  clampBoundsToWorkArea,
  hasClaudeWaitingState,
  isSavedWidgetBounds,
  resolveWidgetBounds,
  shouldRefreshForClaudeStatusline,
  summarizeAgents
} = require("./helpers.cjs");

const nowMs = Date.parse("2026-08-10T00:00:00.000Z");

describe("desktop helpers", () => {
  it("summarizes compact agent status for tray text", () => {
    const summary = summarizeAgents(
      [
        {
          agent: "codex",
          shortName: "Codex",
          primarySnapshot: {
            remainingPercent: 42,
            resetAt: "2026-08-10T02:00:00.000Z"
          }
        },
        {
          agent: "claude-code",
          shortName: "Claude",
          emptyState: {
            reason: "waiting_for_statusline_data"
          }
        }
      ],
      { nowMs }
    );

    assert.equal(summary, "Codex: 42% 2h left | Claude: waiting");
  });

  it("summarizes first-run empty states for tray text", () => {
    const summary = summarizeAgents([
      {
        agent: "codex",
        shortName: "Codex",
        emptyState: {
          reason: "no_supported_source"
        }
      },
      {
        agent: "claude-code",
        shortName: "Claude",
        emptyState: {
          reason: "adapter_error"
        }
      }
    ]);

    assert.equal(summary, "Codex: setup | Claude: check");
  });

  it("detects when Claude waiting state should refresh after rate limits arrive", () => {
    const agents = [
      {
        agent: "claude-code",
        emptyState: {
          reason: "waiting_for_statusline_data"
        }
      }
    ];

    assert.equal(hasClaudeWaitingState(agents), true);
    assert.equal(
      shouldRefreshForClaudeStatusline(agents, { latestHasRateLimits: true }),
      true
    );
    assert.equal(
      shouldRefreshForClaudeStatusline(agents, { latestHasRateLimits: false }),
      false
    );
  });

  it("validates and clamps remembered widget bounds", () => {
    const workArea = {
      height: 600,
      width: 800,
      x: 0,
      y: 0
    };
    const widgetSize = {
      height: 196,
      width: 340
    };

    assert.equal(isSavedWidgetBounds({ x: 12, y: 24 }), true);
    assert.equal(isSavedWidgetBounds({ x: "12", y: 24 }), false);
    assert.deepEqual(
      clampBoundsToWorkArea(
        { ...widgetSize, x: 900, y: -40 },
        workArea
      ),
      { ...widgetSize, x: 452, y: 8 }
    );
    assert.deepEqual(
      resolveWidgetBounds({
        savedBounds: { x: 720, y: 500 },
        widgetSize,
        workArea
      }),
      { ...widgetSize, x: 452, y: 396 }
    );
    assert.deepEqual(
      resolveWidgetBounds({
        clampToWorkArea: false,
        savedBounds: { x: 720, y: 500 },
        widgetSize,
        workArea
      }),
      { ...widgetSize, x: 720, y: 500 }
    );
  });
});
