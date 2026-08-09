import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { AgentAdapter } from "../adapters/contracts.js";
import type { AdapterRegistry } from "../adapters/registry.js";
import { SqliteStore } from "../storage/sqlite-store.js";
import { AgentQuotaService } from "./agent-quota-service.js";
import type { AgentManifest, QuotaSnapshot } from "./types.js";

const manifest: AgentManifest = {
  provider: "anthropic",
  agent: "claude-code",
  displayName: "Claude Code",
  shortName: "Claude",
  description: "Test Claude Code adapter",
  defaultDataPaths: [],
  supportedWindows: ["session_5h", "weekly"]
};

const demoSnapshot: QuotaSnapshot = {
  provider: "anthropic",
  agent: "claude-code",
  windowType: "session_5h",
  unit: "percent",
  usedPercent: 12,
  remainingPercent: 88,
  resetAt: "2026-08-10T08:00:00.000Z",
  observedAt: "2026-08-10T01:00:00.000Z",
  source: "demo",
  confidence: "medium",
  stale: false
};

describe("AgentQuotaService demo snapshots", () => {
  it("hides persisted demo snapshots by default", async () => {
    await withStore(async (store) => {
      store.saveQuotaSnapshots([demoSnapshot]);

      const service = new AgentQuotaService(createRegistry(), store);
      const agents = service.listAgents();

      assert.deepEqual(service.listQuotaSnapshots(), []);
      assert.equal(agents[0]?.snapshots.length, 0);
      assert.equal(agents[0]?.status, "unknown");
      assert.equal(agents[0]?.emptyState?.reason, "no_quota_data");
    });
  });

  it("keeps demo snapshots visible in demo mode", async () => {
    await withStore(async (store) => {
      store.saveQuotaSnapshots([demoSnapshot]);

      const service = new AgentQuotaService(createRegistry(), store, {
        includeDemoSnapshots: true
      });
      const snapshots = service.listQuotaSnapshots();
      const agents = service.listAgents();

      assert.equal(snapshots.length, 1);
      assert.equal(snapshots[0]?.source, "demo");
      assert.equal(agents[0]?.snapshots[0]?.source, "demo");
      assert.equal(agents[0]?.status, "healthy");
      assert.equal(agents[0]?.emptyState, undefined);
    });
  });
});

async function withStore(
  callback: (store: SqliteStore) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "aiqd-service-"));
  const store = new SqliteStore(join(directory, "quota.db"));

  try {
    await callback(store);
  } finally {
    store.close();
    await rm(directory, { force: true, recursive: true });
  }
}

function createRegistry(): AdapterRegistry {
  const adapter: AgentAdapter = {
    manifest,
    async scan() {
      return {
        snapshots: [],
        usageEvents: [],
        doctorChecks: []
      };
    }
  };

  return {
    adapters: [adapter]
  };
}
