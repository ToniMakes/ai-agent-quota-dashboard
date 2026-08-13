import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  DoctorCheck,
  QuotaSnapshot,
  RefreshRun,
  RefreshResult,
  ResetEvent,
  UsageEvent
} from "../core/types.js";
import { detectResetEvent } from "../core/reset-events.js";

type SnapshotRow = {
  provider: string;
  agent: string;
  account_id_hash: string | null;
  plan_label: string | null;
  window_type: string;
  unit: string;
  used: number | null;
  remaining: number | null;
  total: number | null;
  used_percent: number | null;
  remaining_percent: number | null;
  reset_at: string | null;
  observed_at: string;
  expires_at: string | null;
  source: string;
  confidence: string;
  stale: number;
  raw_source_ref: string | null;
};

type DoctorCheckRow = {
  id: string;
  provider: string;
  agent: string;
  label: string;
  status: string;
  message: string;
  detail: string | null;
  observed_at: string;
};

type ResetEventRow = {
  id: number;
  provider: string;
  agent: string;
  window_type: string;
  event_type: string;
  previous_reset_at: string | null;
  new_reset_at: string | null;
  previous_remaining_percent: number | null;
  new_remaining_percent: number | null;
  observed_at: string;
  source: string;
  confidence: string;
  note: string;
};

type RefreshRunRow = {
  id: number;
  observed_at: string;
  snapshots_saved: number;
  usage_events_saved: number;
  doctor_checks_saved: number;
  reset_events_saved: number;
  adapter_count: number;
  errors_json: string;
};

type SaveQuotaSnapshotsResult = {
  resetEventsSaved: number;
  snapshotsSaved: number;
};

type Migration = {
  version: number;
  run: () => void;
};

export class SqliteStore {
  private readonly database: DatabaseSync;
  private readonly migrations: Migration[];

  constructor(private readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.database = new DatabaseSync(dbPath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    this.migrations = [
      { version: 1, run: () => this.createBaseSchema() },
      { version: 2, run: () => this.ensureRefreshRunsResetEventsColumn() }
    ];
    this.migrate();
  }

  get path(): string {
    return this.dbPath;
  }

  migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    const appliedVersions = new Set(
      (
        this.database.prepare("SELECT version FROM schema_migrations;").all() as Array<{
          version: number;
        }>
      ).map((row) => row.version)
    );

    for (const migration of this.migrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      this.database.exec("BEGIN;");

      try {
        migration.run();
        this.database
          .prepare("INSERT INTO schema_migrations (version) VALUES (?);")
          .run(migration.version);
        this.database.exec("COMMIT;");
      } catch (error) {
        this.database.exec("ROLLBACK;");
        throw error;
      }
    }
  }

  private createBaseSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS quota_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        agent TEXT NOT NULL,
        account_id_hash TEXT,
        plan_label TEXT,
        window_type TEXT NOT NULL,
        unit TEXT NOT NULL,
        used REAL,
        remaining REAL,
        total REAL,
        used_percent REAL,
        remaining_percent REAL,
        reset_at TEXT,
        observed_at TEXT NOT NULL,
        expires_at TEXT,
        source TEXT NOT NULL,
        confidence TEXT NOT NULL,
        stale INTEGER NOT NULL DEFAULT 0,
        raw_source_ref TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS quota_snapshots_agent_window_idx
        ON quota_snapshots(provider, agent, window_type, observed_at DESC);

      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        agent TEXT NOT NULL,
        session_id TEXT,
        project_path_hash TEXT,
        model TEXT,
        input_tokens REAL,
        output_tokens REAL,
        cache_read_tokens REAL,
        cache_write_tokens REAL,
        reasoning_tokens REAL,
        total_tokens REAL,
        cost_usd_estimate REAL,
        observed_at TEXT NOT NULL,
        source_file TEXT,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS usage_events_agent_time_idx
        ON usage_events(provider, agent, observed_at DESC);

      CREATE TABLE IF NOT EXISTS doctor_checks (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        agent TEXT NOT NULL,
        label TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        detail TEXT,
        observed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS doctor_checks_agent_idx
        ON doctor_checks(provider, agent);

      CREATE TABLE IF NOT EXISTS refresh_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        observed_at TEXT NOT NULL,
        snapshots_saved INTEGER NOT NULL,
        usage_events_saved INTEGER NOT NULL,
        doctor_checks_saved INTEGER NOT NULL,
        reset_events_saved INTEGER NOT NULL DEFAULT 0,
        adapter_count INTEGER NOT NULL,
        errors_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reset_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        agent TEXT NOT NULL,
        window_type TEXT NOT NULL,
        event_type TEXT NOT NULL,
        previous_reset_at TEXT,
        new_reset_at TEXT,
        previous_remaining_percent REAL,
        new_remaining_percent REAL,
        observed_at TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS reset_events_agent_time_idx
        ON reset_events(provider, agent, observed_at DESC);
    `);
  }

  saveQuotaSnapshots(snapshots: QuotaSnapshot[]): SaveQuotaSnapshotsResult {
    if (snapshots.length === 0) {
      return {
        resetEventsSaved: 0,
        snapshotsSaved: 0
      };
    }

    const snapshotStatement = this.database.prepare(`
      INSERT INTO quota_snapshots (
        provider,
        agent,
        account_id_hash,
        plan_label,
        window_type,
        unit,
        used,
        remaining,
        total,
        used_percent,
        remaining_percent,
        reset_at,
        observed_at,
        expires_at,
        source,
        confidence,
        stale,
        raw_source_ref
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const resetEventStatement = this.database.prepare(`
      INSERT INTO reset_events (
        provider,
        agent,
        window_type,
        event_type,
        previous_reset_at,
        new_reset_at,
        previous_remaining_percent,
        new_remaining_percent,
        observed_at,
        source,
        confidence,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.database.exec("BEGIN;");

    try {
      let resetEventsSaved = 0;

      for (const snapshot of snapshots) {
        const previousSnapshot = this.getLatestQuotaSnapshotFor(
          snapshot.provider,
          snapshot.agent,
          snapshot.windowType
        );
        const resetEvent = detectResetEvent(previousSnapshot, snapshot);

        if (resetEvent) {
          resetEventStatement.run(
            resetEvent.provider,
            resetEvent.agent,
            resetEvent.windowType,
            resetEvent.eventType,
            resetEvent.previousResetAt ?? null,
            resetEvent.newResetAt ?? null,
            resetEvent.previousRemainingPercent ?? null,
            resetEvent.newRemainingPercent ?? null,
            resetEvent.observedAt,
            resetEvent.source,
            resetEvent.confidence,
            resetEvent.note
          );
          resetEventsSaved += 1;
        }

        snapshotStatement.run(
          snapshot.provider,
          snapshot.agent,
          snapshot.accountIdHash ?? null,
          snapshot.planLabel ?? null,
          snapshot.windowType,
          snapshot.unit,
          snapshot.used ?? null,
          snapshot.remaining ?? null,
          snapshot.total ?? null,
          snapshot.usedPercent ?? null,
          snapshot.remainingPercent ?? null,
          snapshot.resetAt ?? null,
          snapshot.observedAt,
          snapshot.expiresAt ?? null,
          snapshot.source,
          snapshot.confidence,
          snapshot.stale ? 1 : 0,
          snapshot.rawSourceRef ?? null
        );
      }

      this.database.exec("COMMIT;");
      return {
        resetEventsSaved,
        snapshotsSaved: snapshots.length
      };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  saveUsageEvents(events: UsageEvent[]): number {
    if (events.length === 0) {
      return 0;
    }

    const statement = this.database.prepare(`
      INSERT INTO usage_events (
        provider,
        agent,
        session_id,
        project_path_hash,
        model,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        reasoning_tokens,
        total_tokens,
        cost_usd_estimate,
        observed_at,
        source_file,
        source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.database.exec("BEGIN;");

    try {
      for (const event of events) {
        statement.run(
          event.provider,
          event.agent,
          event.sessionId ?? null,
          event.projectPathHash ?? null,
          event.model ?? null,
          event.inputTokens ?? null,
          event.outputTokens ?? null,
          event.cacheReadTokens ?? null,
          event.cacheWriteTokens ?? null,
          event.reasoningTokens ?? null,
          event.totalTokens ?? null,
          event.costUsdEstimate ?? null,
          event.observedAt,
          event.sourceFile ?? null,
          event.source
        );
      }

      this.database.exec("COMMIT;");
      return events.length;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  replaceDoctorChecks(checks: DoctorCheck[]): number {
    this.database.exec("BEGIN;");

    try {
      this.database.exec("DELETE FROM doctor_checks;");
      const statement = this.database.prepare(`
        INSERT INTO doctor_checks (
          id,
          provider,
          agent,
          label,
          status,
          message,
          detail,
          observed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const check of checks) {
        statement.run(
          check.id,
          check.provider,
          check.agent,
          check.label,
          check.status,
          check.message,
          check.detail ?? null,
          check.observedAt
        );
      }

      this.database.exec("COMMIT;");
      return checks.length;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  recordRefreshRun(result: RefreshResult): void {
    this.database.prepare(`
      INSERT INTO refresh_runs (
        observed_at,
        snapshots_saved,
        usage_events_saved,
        doctor_checks_saved,
        reset_events_saved,
        adapter_count,
        errors_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.observedAt,
      result.snapshotsSaved,
      result.usageEventsSaved,
      result.doctorChecksSaved,
      result.resetEventsSaved,
      result.adapterCount,
      JSON.stringify(result.errors)
    );
  }

  listLatestQuotaSnapshots(): QuotaSnapshot[] {
    const rows = this.database.prepare(`
      WITH ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY provider, agent, window_type
            ORDER BY observed_at DESC, id DESC
          ) AS rank
        FROM quota_snapshots
      )
      SELECT
        provider,
        agent,
        account_id_hash,
        plan_label,
        window_type,
        unit,
        used,
        remaining,
        total,
        used_percent,
        remaining_percent,
        reset_at,
        observed_at,
        expires_at,
        source,
        confidence,
        stale,
        raw_source_ref
      FROM ranked
      WHERE rank = 1
      ORDER BY provider ASC, agent ASC, window_type ASC;
    `).all() as SnapshotRow[];

    return rows.map(mapSnapshotRow);
  }

  listDoctorChecks(): DoctorCheck[] {
    const rows = this.database.prepare(`
      SELECT
        id,
        provider,
        agent,
        label,
        status,
        message,
        detail,
        observed_at
      FROM doctor_checks
      ORDER BY provider ASC, agent ASC, label ASC;
    `).all() as DoctorCheckRow[];

    return rows.map((row) => {
      const check: DoctorCheck = {
        id: row.id,
        provider: row.provider,
        agent: row.agent,
        label: row.label,
        status: row.status as DoctorCheck["status"],
        message: row.message,
        observedAt: row.observed_at
      };

      if (row.detail !== null) {
        check.detail = row.detail;
      }

      return check;
    });
  }

  listResetEvents(limit = 20): ResetEvent[] {
    const rows = this.database.prepare(`
      SELECT
        id,
        provider,
        agent,
        window_type,
        event_type,
        previous_reset_at,
        new_reset_at,
        previous_remaining_percent,
        new_remaining_percent,
        observed_at,
        source,
        confidence,
        note
      FROM reset_events
      ORDER BY observed_at DESC, id DESC
      LIMIT ?;
    `).all(limit) as ResetEventRow[];

    return rows.map(mapResetEventRow);
  }

  listRefreshRuns(limit = 10): RefreshRun[] {
    const rows = this.database.prepare(`
      SELECT
        id,
        observed_at,
        snapshots_saved,
        usage_events_saved,
        doctor_checks_saved,
        reset_events_saved,
        adapter_count,
        errors_json
      FROM refresh_runs
      ORDER BY observed_at DESC, id DESC
      LIMIT ?;
    `).all(limit) as RefreshRunRow[];

    return rows.map(mapRefreshRunRow);
  }

  close(): void {
    this.database.close();
  }

  private getLatestQuotaSnapshotFor(
    provider: string,
    agent: string,
    windowType: string
  ): QuotaSnapshot | undefined {
    const row = this.database.prepare(`
      SELECT
        provider,
        agent,
        account_id_hash,
        plan_label,
        window_type,
        unit,
        used,
        remaining,
        total,
        used_percent,
        remaining_percent,
        reset_at,
        observed_at,
        expires_at,
        source,
        confidence,
        stale,
        raw_source_ref
      FROM quota_snapshots
      WHERE provider = ? AND agent = ? AND window_type = ?
      ORDER BY observed_at DESC, id DESC
      LIMIT 1;
    `).get(provider, agent, windowType) as SnapshotRow | undefined;

    return row ? mapSnapshotRow(row) : undefined;
  }

  private ensureRefreshRunsResetEventsColumn(): void {
    const rows = this.database.prepare("PRAGMA table_info(refresh_runs);").all() as Array<{
      name: string;
    }>;
    const hasColumn = rows.some((row) => row.name === "reset_events_saved");

    if (!hasColumn) {
      this.database.exec(
        "ALTER TABLE refresh_runs ADD COLUMN reset_events_saved INTEGER NOT NULL DEFAULT 0;"
      );
    }
  }
}

function mapSnapshotRow(row: SnapshotRow): QuotaSnapshot {
  const snapshot: QuotaSnapshot = {
    provider: row.provider,
    agent: row.agent,
    windowType: row.window_type as QuotaSnapshot["windowType"],
    unit: row.unit as QuotaSnapshot["unit"],
    observedAt: row.observed_at,
    source: row.source as QuotaSnapshot["source"],
    confidence: row.confidence as QuotaSnapshot["confidence"],
    stale: row.stale === 1
  };

  if (row.account_id_hash !== null) snapshot.accountIdHash = row.account_id_hash;
  if (row.plan_label !== null) snapshot.planLabel = row.plan_label;
  if (row.used !== null) snapshot.used = row.used;
  if (row.remaining !== null) snapshot.remaining = row.remaining;
  if (row.total !== null) snapshot.total = row.total;
  if (row.used_percent !== null) snapshot.usedPercent = row.used_percent;
  if (row.remaining_percent !== null) {
    snapshot.remainingPercent = row.remaining_percent;
  }
  if (row.reset_at !== null) snapshot.resetAt = row.reset_at;
  if (row.expires_at !== null) snapshot.expiresAt = row.expires_at;
  if (row.raw_source_ref !== null) snapshot.rawSourceRef = row.raw_source_ref;

  return snapshot;
}

function mapResetEventRow(row: ResetEventRow): ResetEvent {
  const event: ResetEvent = {
    id: row.id,
    provider: row.provider,
    agent: row.agent,
    windowType: row.window_type as ResetEvent["windowType"],
    eventType: row.event_type as ResetEvent["eventType"],
    observedAt: row.observed_at,
    source: row.source as ResetEvent["source"],
    confidence: row.confidence as ResetEvent["confidence"],
    note: row.note
  };

  if (row.previous_reset_at !== null) event.previousResetAt = row.previous_reset_at;
  if (row.new_reset_at !== null) event.newResetAt = row.new_reset_at;
  if (row.previous_remaining_percent !== null) {
    event.previousRemainingPercent = row.previous_remaining_percent;
  }
  if (row.new_remaining_percent !== null) {
    event.newRemainingPercent = row.new_remaining_percent;
  }

  return event;
}

function mapRefreshRunRow(row: RefreshRunRow): RefreshRun {
  return {
    id: row.id,
    observedAt: row.observed_at,
    snapshotsSaved: row.snapshots_saved,
    usageEventsSaved: row.usage_events_saved,
    doctorChecksSaved: row.doctor_checks_saved,
    resetEventsSaved: row.reset_events_saved,
    adapterCount: row.adapter_count,
    errors: parseErrorsJson(row.errors_json)
  };
}

function parseErrorsJson(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return ["Stored refresh run errors could not be parsed."];
  }

  return [];
}
