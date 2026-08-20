import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clamp,
  createI18n,
  defaultLanguage,
  escapeHtml,
  hasUsableResetAt,
  mergeClaudeSnapshots,
  mergeSnapshotResetTiming,
  isSameSnapshot,
  isStaleSnapshot,
  languageStorageKey,
  primaryMeterClass,
  resolveInitialLanguage
} from "./shared.js";

function withStubbedWindow(storedLanguage, run) {
  const previousWindow = globalThis.window;

  globalThis.window = {
    localStorage: {
      getItem: (key) => (key === languageStorageKey ? storedLanguage : null)
    }
  };

  try {
    return run();
  } finally {
    globalThis.window = previousWindow;
  }
}

describe("resolveInitialLanguage", () => {
  it("falls back to the default language when nothing is stored", () => {
    withStubbedWindow(null, () => {
      assert.equal(resolveInitialLanguage(), defaultLanguage);
    });
  });

  it("uses a valid stored language", () => {
    withStubbedWindow("zh", () => {
      assert.equal(resolveInitialLanguage(), "zh");
    });
  });

  it("ignores an invalid stored value", () => {
    withStubbedWindow("fr", () => {
      assert.equal(resolveInitialLanguage(), defaultLanguage);
    });
  });
});

describe("createI18n", () => {
  it("tx picks the string matching the current language", () => {
    let language = "en";
    const { tx } = createI18n(() => language);

    assert.equal(tx("Hello", "你好"), "Hello");
    language = "zh";
    assert.equal(tx("Hello", "你好"), "你好");
  });

  it("tx substitutes template values", () => {
    const { tx } = createI18n(() => "en");

    assert.equal(
      tx("{count} items", "{count} 项", { count: 3 }),
      "3 items"
    );
  });

  it("sourceLabel maps known sources and passes through unknown ones", () => {
    const { sourceLabel } = createI18n(() => "en");

    assert.equal(sourceLabel("official_cli"), "Official CLI");
    assert.equal(sourceLabel("local_quota_snapshot"), "Local snapshot");
    assert.equal(sourceLabel("something_new"), "something_new");
  });

  it("formatRelative returns a placeholder for missing values", () => {
    const { formatRelative } = createI18n(() => "en");

    assert.equal(formatRelative(undefined), "--");
    assert.equal(formatRelative(""), "--");
  });

  it("compactNumber formats without throwing", () => {
    const { compactNumber } = createI18n(() => "en");

    assert.equal(typeof compactNumber(1500), "string");
  });
});

describe("clamp", () => {
  it("keeps values inside the range unchanged", () => {
    assert.equal(clamp(5, 0, 10), 5);
  });

  it("clamps below the minimum", () => {
    assert.equal(clamp(-5, 0, 10), 0);
  });

  it("clamps above the maximum", () => {
    assert.equal(clamp(15, 0, 10), 10);
  });
});

describe("escapeHtml", () => {
  it("escapes all five reserved HTML characters", () => {
    assert.equal(
      escapeHtml(`<script>alert("x" & 'y')</script>`),
      "&lt;script&gt;alert(&quot;x&quot; &amp; &#039;y&#039;)&lt;/script&gt;"
    );
  });

  it("stringifies non-string input", () => {
    assert.equal(escapeHtml(42), "42");
  });
});

describe("isStaleSnapshot", () => {
  it("is stale when freshness status is stale", () => {
    assert.equal(
      isStaleSnapshot({ freshness: { status: "stale" } }),
      true
    );
  });

  it("is stale when the source marked it stale", () => {
    assert.equal(isStaleSnapshot({ stale: true }), true);
  });

  it("is stale when expiresAt is in the past", () => {
    assert.equal(
      isStaleSnapshot({ expiresAt: "2000-01-01T00:00:00.000Z" }),
      true
    );
  });

  it("is not stale for a fresh snapshot", () => {
    assert.equal(
      isStaleSnapshot({
        freshness: { status: "fresh" },
        stale: false,
        expiresAt: "2999-01-01T00:00:00.000Z"
      }),
      false
    );
  });
});

describe("isSameSnapshot", () => {
  const base = {
    provider: "anthropic",
    agent: "claude-code",
    windowType: "weekly",
    observedAt: "2026-08-13T00:00:00.000Z"
  };

  it("matches identical provider/agent/window/observedAt", () => {
    assert.equal(isSameSnapshot(base, { ...base }), true);
  });

  it("does not match when the window type differs", () => {
    assert.equal(
      isSameSnapshot(base, { ...base, windowType: "session_5h" }),
      false
    );
  });

  it("does not match when either snapshot is missing", () => {
    assert.equal(isSameSnapshot(base, undefined), false);
    assert.equal(isSameSnapshot(undefined, base), false);
  });
});

describe("hasUsableResetAt", () => {
  it("accepts future reset timestamps", () => {
    assert.equal(
      hasUsableResetAt({ resetAt: "2999-01-01T00:00:00.000Z" }),
      true
    );
  });

  it("rejects missing, invalid, or past reset timestamps", () => {
    assert.equal(hasUsableResetAt({}), false);
    assert.equal(hasUsableResetAt({ resetAt: "not-a-date" }), false);
    assert.equal(
      hasUsableResetAt({ resetAt: "2000-01-01T00:00:00.000Z" }),
      false
    );
  });
});

describe("mergeSnapshotResetTiming", () => {
  it("borrows a future reset for the same window", () => {
    const snapshot = {
      provider: "anthropic",
      agent: "claude-desktop",
      windowType: "weekly",
      observedAt: "2026-08-20T00:00:00.000Z"
    };

    const merged = mergeSnapshotResetTiming(snapshot, [
      {
        provider: "anthropic",
        agent: "claude-code",
        windowType: "weekly",
        observedAt: "2026-08-20T00:00:00.000Z",
        resetAt: "2999-01-01T00:00:00.000Z",
        expiresAt: "2000-01-01T00:00:00.000Z"
      }
    ]);

    assert.equal(merged.resetAt, "2999-01-01T00:00:00.000Z");
  });

  it("does not borrow freshness expiry as reset timing", () => {
    const snapshot = {
      provider: "anthropic",
      agent: "claude-desktop",
      windowType: "weekly",
      observedAt: "2026-08-20T00:00:00.000Z"
    };

    const merged = mergeSnapshotResetTiming(snapshot, [
      {
        provider: "anthropic",
        agent: "claude-desktop",
        windowType: "weekly",
        observedAt: "2026-08-20T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ]);

    assert.equal(merged.resetAt, undefined);
  });
});

describe("mergeClaudeSnapshots", () => {
  it("keeps winner percentages while adding reset timing from another source", () => {
    const desktopSnapshot = {
      provider: "anthropic",
      agent: "claude-desktop",
      windowType: "session_5h",
      remainingPercent: 26,
      observedAt: "2026-08-20T00:00:00.000Z"
    };

    const [merged] = mergeClaudeSnapshots([desktopSnapshot], [
      { snapshots: [desktopSnapshot] },
      {
        snapshots: [
          {
            provider: "anthropic",
            agent: "claude-code",
            windowType: "session_5h",
            remainingPercent: 100,
            observedAt: "2026-08-20T00:00:00.000Z",
            resetAt: "2999-01-01T00:00:00.000Z"
          }
        ]
      }
    ]);

    assert.equal(merged.remainingPercent, 26);
    assert.equal(merged.resetAt, "2999-01-01T00:00:00.000Z");
  });
});

describe("primaryMeterClass", () => {
  it("uses the session class for a healthy 5h window", () => {
    assert.equal(
      primaryMeterClass({ windowType: "session_5h" }, "healthy"),
      "session"
    );
  });

  it("falls back to the status for other windows", () => {
    assert.equal(
      primaryMeterClass({ windowType: "weekly" }, "warning"),
      "warning"
    );
  });
});
