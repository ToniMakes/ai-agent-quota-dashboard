import type { AdapterRegistry } from "../adapters/registry.js";
import type { SqliteStore } from "../storage/sqlite-store.js";
import {
  choosePrimarySnapshot,
  mostSevereStatus,
  resolveDoctorStatus
} from "./quota-state.js";
import type {
  AgentManifest,
  AgentSummary,
  DoctorCheck,
  QuotaSnapshot,
  RefreshRun,
  RefreshResult,
  ResetEvent
} from "./types.js";

export class AgentQuotaService {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly store: SqliteStore
  ) {}

  async initialize(): Promise<RefreshResult> {
    return this.refresh();
  }

  async refresh(): Promise<RefreshResult> {
    const now = new Date();
    const snapshots: QuotaSnapshot[] = [];
    const doctorChecks: DoctorCheck[] = [];
    const usageEvents = [];
    const errors: string[] = [];

    for (const adapter of this.registry.adapters) {
      try {
        const result = await adapter.scan({ now });
        snapshots.push(...result.snapshots);
        usageEvents.push(...result.usageEvents);
        doctorChecks.push(...result.doctorChecks);
      } catch (error) {
        errors.push(
          `${adapter.manifest.displayName}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        doctorChecks.push({
          id: `${adapter.manifest.agent}:adapter-error`,
          provider: adapter.manifest.provider,
          agent: adapter.manifest.agent,
          label: "Adapter",
          status: "fail",
          message: "Adapter scan failed",
          detail: error instanceof Error ? error.message : String(error),
          observedAt: now.toISOString()
        });
      }
    }

    const quotaSaveResult = this.store.saveQuotaSnapshots(snapshots);
    const result: RefreshResult = {
      observedAt: now.toISOString(),
      snapshotsSaved: quotaSaveResult.snapshotsSaved,
      usageEventsSaved: this.store.saveUsageEvents(usageEvents),
      doctorChecksSaved: this.store.replaceDoctorChecks(doctorChecks),
      resetEventsSaved: quotaSaveResult.resetEventsSaved,
      adapterCount: this.registry.adapters.length,
      errors
    };

    this.store.recordRefreshRun(result);
    return result;
  }

  listAgents(): AgentSummary[] {
    const manifests = this.registry.adapters.map((adapter) => adapter.manifest);
    const snapshots = this.store.listLatestQuotaSnapshots();
    const checks = this.store.listDoctorChecks();

    return manifests.map((manifest) => {
      const agentSnapshots = snapshots.filter((snapshot) =>
        isSameAgent(manifest, snapshot)
      );
      const agentChecks = checks.filter((check) => isSameAgent(manifest, check));
      const primarySnapshot = choosePrimarySnapshot(agentSnapshots);

      const summary: AgentSummary = {
        provider: manifest.provider,
        agent: manifest.agent,
        displayName: manifest.displayName,
        shortName: manifest.shortName,
        status: mostSevereStatus(agentSnapshots),
        snapshots: agentSnapshots,
        doctorStatus: resolveDoctorStatus(agentChecks)
      };

      if (primarySnapshot) {
        summary.primarySnapshot = primarySnapshot;
        summary.lastObservedAt = primarySnapshot.observedAt;
      }

      return summary;
    });
  }

  listQuotaSnapshots(): QuotaSnapshot[] {
    return this.store.listLatestQuotaSnapshots();
  }

  listDoctorChecks(): DoctorCheck[] {
    return this.store.listDoctorChecks();
  }

  listResetEvents(limit?: number): ResetEvent[] {
    return this.store.listResetEvents(limit);
  }

  listRefreshRuns(limit?: number): RefreshRun[] {
    return this.store.listRefreshRuns(limit);
  }
}

function isSameAgent(
  manifest: AgentManifest,
  item: { provider: string; agent: string }
): boolean {
  return manifest.provider === item.provider && manifest.agent === item.agent;
}
