import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { buildCodexManualSnapshot } from "../cli/codex-snapshot.js";
import { getCodexSnapshotSetupStatus } from "./codex-snapshot-status.js";

const now = new Date("2026-08-10T00:00:00.000Z");

describe("getCodexSnapshotSetupStatus", () => {
  it("reports a missing manual snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-status-"));

    try {
      const snapshotPath = join(directory, "codex-quota-snapshot.json");
      const status = await getCodexSnapshotSetupStatus({
        now,
        snapshotPath
      });

      assert.equal(status.snapshotExists, false);
      assert.equal(status.latestHasQuota, false);
      assert.equal(status.readiness, "not_recorded");
      assert.match(status.nextAction, /codex snapshot/);
      assert.equal(
        status.checks.find((check) => check.id === "manual-snapshot-file")
          ?.status,
        "warn"
      );
      assert.equal(
        status.checks.find((check) => check.id === "manual-snapshot-parse")
          ?.message,
        "Waiting for snapshot file"
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("reports a usable manual Codex snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-status-"));

    try {
      const snapshotPath = join(directory, "codex-quota-snapshot.json");
      await mkdir(dirname(snapshotPath), { recursive: true });
      await writeFile(
        snapshotPath,
        JSON.stringify(
          buildCodexManualSnapshot({
            observedAt: "2026-08-10T00:00:00.000Z",
            outputPath: snapshotPath,
            planLabel: "Codex /status",
            remainingPercent: 72,
            resetAt: "2026-08-16T03:00:00.000Z",
            usedPercent: 28
          })
        )
      );

      const status = await getCodexSnapshotSetupStatus({
        now,
        snapshotPath
      });

      assert.equal(status.snapshotExists, true);
      assert.equal(status.latestHasQuota, true);
      assert.equal(status.latestRemainingPercent, 72);
      assert.equal(status.latestUsedPercent, 28);
      assert.equal(status.latestResetAt, "2026-08-16T03:00:00.000Z");
      assert.equal(status.latestExpiresAt, "2026-08-16T03:00:00.000Z");
      assert.equal(status.latestSource, "manual");
      assert.equal(status.latestConfidence, "unknown");
      assert.equal(status.latestAgeSeconds, 0);
      assert.equal(status.readiness, "ready");
      assert.equal(
        status.checks.find((check) => check.id === "manual-snapshot-freshness")
          ?.status,
        "pass"
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("marks manual snapshots expired at the reported reset time", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-status-"));

    try {
      const snapshotPath = join(directory, "codex-quota-snapshot.json");
      await mkdir(dirname(snapshotPath), { recursive: true });
      await writeFile(
        snapshotPath,
        JSON.stringify(
          buildCodexManualSnapshot({
            observedAt: "2026-08-09T00:00:00.000Z",
            outputPath: snapshotPath,
            planLabel: "Codex /status",
            remainingPercent: 72,
            resetAt: "2026-08-09T23:00:00.000Z",
            usedPercent: 28
          })
        )
      );

      const status = await getCodexSnapshotSetupStatus({
        now,
        snapshotPath
      });

      assert.equal(status.latestHasQuota, true);
      assert.equal(status.readiness, "expired");
      assert.equal(status.readinessLabel, "Codex snapshot expired");
      assert.equal(
        status.checks.find((check) => check.id === "manual-snapshot-freshness")
          ?.status,
        "warn"
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("marks snapshots expired from reset time when expires_at is absent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-status-"));

    try {
      const snapshotPath = join(directory, "codex-quota-snapshot.json");
      await mkdir(dirname(snapshotPath), { recursive: true });
      await writeFile(
        snapshotPath,
        JSON.stringify({
          type: "quota_snapshot",
          quota_snapshot: {
            observed_at: "2026-08-09T00:00:00.000Z",
            remaining_percent: 72,
            reset_at: "2026-08-09T23:00:00.000Z",
            source: "manual",
            unit: "percent",
            window_type: "weekly"
          }
        })
      );

      const status = await getCodexSnapshotSetupStatus({
        now,
        snapshotPath
      });

      assert.equal(status.latestHasQuota, true);
      assert.equal(status.readiness, "expired");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("reports unusable snapshot content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aiqd-codex-status-"));

    try {
      const snapshotPath = join(directory, "codex-quota-snapshot.json");
      await mkdir(dirname(snapshotPath), { recursive: true });
      await writeFile(snapshotPath, JSON.stringify({ type: "message" }));

      const status = await getCodexSnapshotSetupStatus({
        now,
        snapshotPath
      });

      assert.equal(status.snapshotExists, true);
      assert.equal(status.latestHasQuota, false);
      assert.equal(status.readiness, "needs_attention");
      assert.equal(
        status.checks.find((check) => check.id === "manual-snapshot-parse")
          ?.status,
        "warn"
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
