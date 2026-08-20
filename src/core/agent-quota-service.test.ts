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

const codexManifest: AgentManifest = {
  provider: "openai",
  agent: "codex",
  displayName: "Codex",
  shortName: "Codex",
  description: "OpenAI Codex local session and quota snapshots.",
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

const weeklyCodexSnapshot: QuotaSnapshot = {
  provider: "openai",
  agent: "codex",
  windowType: "weekly",
  unit: "percent",
  usedPercent: 5,
  remainingPercent: 95,
  resetAt: "2026-08-28T00:23:00.000Z",
  observedAt: "2026-08-21T00:23:00.000Z",
  source: "official_cli",
  confidence: "official",
  stale: false
};

const monthlyCodexSnapshot: QuotaSnapshot = {
  provider: "openai",
  agent: "codex",
  windowType: "monthly",
  unit: "percent",
  usedPercent: 0,
  remainingPercent: 100,
  resetAt: "2026-09-18T00:23:00.000Z",
  observedAt: "2026-08-21T00:23:00.000Z",
  source: "official_cli",
  confidence: "official",
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

describe("AgentQuotaService supported windows", () => {
  it("hides snapshots outside the adapter supported windows", async () => {
    await withStore(async (store) => {
      store.saveQuotaSnapshots([weeklyCodexSnapshot, monthlyCodexSnapshot]);

      const service = new AgentQuotaService(
        createRegistry(codexManifest),
        store
      );
      const snapshots = service.listQuotaSnapshots();
      const agents = service.listAgents();

      assert.deepEqual(
        snapshots.map((snapshot) => snapshot.windowType),
        ["weekly"]
      );
      assert.equal(agents[0]?.primarySnapshot?.windowType, "weekly");
      assert.equal(agents[0]?.snapshots.length, 1);
    });
  });

  it("hides reset events outside the adapter supported windows", async () => {
    await withStore(async (store) => {
      store.saveQuotaSnapshots([monthlyCodexSnapshot]);
      store.saveQuotaSnapshots([
        {
          ...monthlyCodexSnapshot,
          resetAt: "2026-09-19T00:23:00.000Z",
          observedAt: "2026-08-22T00:23:00.000Z"
        }
      ]);

      const service = new AgentQuotaService(
        createRegistry(codexManifest),
        store
      );

      assert.deepEqual(service.listResetEvents(), []);
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

function createRegistry(
  adapterManifest: AgentManifest = manifest
): AdapterRegistry {
  const adapter: AgentAdapter = {
    manifest: adapterManifest,
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
