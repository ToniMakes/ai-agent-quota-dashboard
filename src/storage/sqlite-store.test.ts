import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SqliteStore } from "./sqlite-store.js";
import type { QuotaSnapshot } from "../core/types.js";

const firstSnapshot: QuotaSnapshot = {
  provider: "openai",
  agent: "codex",
  windowType: "weekly",
  unit: "percent",
  remainingPercent: 30,
  resetAt: "2026-08-15T03:00:00.000Z",
  observedAt: "2026-08-09T00:00:00.000Z",
  source: "official_cli",
  confidence: "official",
  stale: false
};

describe("SqliteStore reset events", () => {
  it("records reset events when an observed reset anchor changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-store-"));
    const store = new SqliteStore(join(directory, "quota.db"));

    try {
      const firstResult = store.saveQuotaSnapshots([firstSnapshot]);
      const secondResult = store.saveQuotaSnapshots([
        {
          ...firstSnapshot,
          remainingPercent: 100,
          resetAt: "2026-08-16T03:00:00.000Z",
          observedAt: "2026-08-10T00:00:00.000Z"
        }
      ]);
      const events = store.listResetEvents();

      assert.equal(firstResult.snapshotsSaved, 1);
      assert.equal(firstResult.resetEventsSaved, 0);
      assert.equal(secondResult.snapshotsSaved, 1);
      assert.equal(secondResult.resetEventsSaved, 1);
      assert.equal(events.length, 1);
      assert.equal(events[0]?.eventType, "reset_anchor_changed");
      assert.equal(events[0]?.previousResetAt, "2026-08-15T03:00:00.000Z");
      assert.equal(events[0]?.newResetAt, "2026-08-16T03:00:00.000Z");
    } finally {
      store.close();
      await rm(directory, { force: true, recursive: true });
    }
  });
});
