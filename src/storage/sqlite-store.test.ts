import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { SqliteStore } from "./sqlite-store.js";
import type { QuotaSnapshot, RefreshResult } from "../core/types.js";

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

describe("SqliteStore migrations", () => {
  it("records every applied migration version on a fresh database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-store-"));
    const dbPath = join(directory, "quota.db");
    const store = new SqliteStore(dbPath);

    try {
      const database = new DatabaseSync(dbPath);
      const rows = database
        .prepare("SELECT version FROM schema_migrations ORDER BY version;")
        .all() as Array<{ version: number }>;
      database.close();

      assert.deepEqual(
        rows.map((row) => row.version),
        [1, 2]
      );
    } finally {
      store.close();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("upgrades a pre-migration database without duplicating the reset_events_saved column", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-store-"));
    const dbPath = join(directory, "quota.db");

    // Simulate a database created before schema_migrations existed: the
    // refresh_runs table already has reset_events_saved (added by the old
    // ad-hoc ALTER TABLE check), but there is no migration bookkeeping yet.
    const legacyDatabase = new DatabaseSync(dbPath);
    legacyDatabase.exec(`
      CREATE TABLE refresh_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        observed_at TEXT NOT NULL,
        snapshots_saved INTEGER NOT NULL,
        usage_events_saved INTEGER NOT NULL,
        doctor_checks_saved INTEGER NOT NULL,
        reset_events_saved INTEGER NOT NULL DEFAULT 0,
        adapter_count INTEGER NOT NULL,
        errors_json TEXT NOT NULL
      );
    `);
    legacyDatabase.close();

    const store = new SqliteStore(dbPath);

    try {
      store.recordRefreshRun({
        observedAt: "2026-08-09T00:00:00.000Z",
        snapshotsSaved: 1,
        usageEventsSaved: 0,
        doctorChecksSaved: 2,
        resetEventsSaved: 0,
        adapterCount: 2,
        errors: []
      });

      const runs = store.listRefreshRuns();

      assert.equal(runs.length, 1);
    } finally {
      store.close();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("adds the reset_events_saved column when a truly old database lacks it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-store-"));
    const dbPath = join(directory, "quota.db");

    // Simulate the original v0.1 schema, before reset_events_saved existed
    // at all.
    const legacyDatabase = new DatabaseSync(dbPath);
    legacyDatabase.exec(`
      CREATE TABLE refresh_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        observed_at TEXT NOT NULL,
        snapshots_saved INTEGER NOT NULL,
        usage_events_saved INTEGER NOT NULL,
        doctor_checks_saved INTEGER NOT NULL,
        adapter_count INTEGER NOT NULL,
        errors_json TEXT NOT NULL
      );
    `);
    legacyDatabase.close();

    const store = new SqliteStore(dbPath);

    try {
      store.recordRefreshRun({
        observedAt: "2026-08-09T00:00:00.000Z",
        snapshotsSaved: 1,
        usageEventsSaved: 0,
        doctorChecksSaved: 2,
        resetEventsSaved: 3,
        adapterCount: 2,
        errors: []
      });

      const runs = store.listRefreshRuns();

      assert.equal(runs[0]?.resetEventsSaved, 3);
    } finally {
      store.close();
      await rm(directory, { force: true, recursive: true });
    }
  });
});

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

describe("SqliteStore refresh runs", () => {
  it("lists recent refresh runs newest first", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-store-"));
    const store = new SqliteStore(join(directory, "quota.db"));
    const firstRun: RefreshResult = {
      observedAt: "2026-08-09T00:00:00.000Z",
      snapshotsSaved: 1,
      usageEventsSaved: 0,
      doctorChecksSaved: 2,
      resetEventsSaved: 0,
      adapterCount: 2,
      errors: []
    };
    const secondRun: RefreshResult = {
      observedAt: "2026-08-09T01:00:00.000Z",
      snapshotsSaved: 0,
      usageEventsSaved: 0,
      doctorChecksSaved: 2,
      resetEventsSaved: 1,
      adapterCount: 2,
      errors: ["Codex: scan failed"]
    };

    try {
      store.recordRefreshRun(firstRun);
      store.recordRefreshRun(secondRun);

      const runs = store.listRefreshRuns();

      assert.equal(runs.length, 2);
      assert.equal(runs[0]?.observedAt, secondRun.observedAt);
      assert.equal(runs[0]?.resetEventsSaved, 1);
      assert.deepEqual(runs[0]?.errors, ["Codex: scan failed"]);
      assert.equal(runs[1]?.observedAt, firstRun.observedAt);
    } finally {
      store.close();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("limits refresh run history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-store-"));
    const store = new SqliteStore(join(directory, "quota.db"));

    try {
      for (let index = 0; index < 3; index += 1) {
        store.recordRefreshRun({
          observedAt: `2026-08-09T0${index}:00:00.000Z`,
          snapshotsSaved: index,
          usageEventsSaved: 0,
          doctorChecksSaved: 2,
          resetEventsSaved: 0,
          adapterCount: 2,
          errors: []
        });
      }

      const runs = store.listRefreshRuns(2);

      assert.equal(runs.length, 2);
      assert.equal(runs[0]?.observedAt, "2026-08-09T02:00:00.000Z");
      assert.equal(runs[1]?.observedAt, "2026-08-09T01:00:00.000Z");
    } finally {
      store.close();
      await rm(directory, { force: true, recursive: true });
    }
  });
});
