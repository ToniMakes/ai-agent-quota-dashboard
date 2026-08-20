import type { AdapterRegistry } from "../adapters/registry.js";
import type { SqliteStore } from "../storage/sqlite-store.js";
import {
  choosePrimarySnapshot,
  describeEmptyQuotaState,
  mostSevereStatus,
  resolveDoctorStatus,
  withSnapshotFreshness
} from "./quota-state.js";
import type {
  AgentManifest,
  AgentSummary,
  DoctorCheck,
  QuotaSnapshot,
  QuotaWindowType,
  RefreshRun,
  RefreshResult,
  ResetEvent
} from "./types.js";

export type AgentQuotaServiceOptions = {
  includeDemoSnapshots?: boolean;
};

export class AgentQuotaService {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly store: SqliteStore,
    private readonly options: AgentQuotaServiceOptions = {}
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
    const now = new Date();
    const manifests = this.registry.adapters.map((adapter) => adapter.manifest);
    const snapshots = this.listVisibleQuotaSnapshots();
    const checks = this.store.listDoctorChecks();

    return manifests.map((manifest) => {
      const agentSnapshots = snapshots
        .filter((snapshot) => isSameAgent(manifest, snapshot))
        .map((snapshot) => withSnapshotFreshness(snapshot, now));
      const agentChecks = checks.filter((check) => isSameAgent(manifest, check));
      const primarySnapshot = choosePrimarySnapshot(agentSnapshots, now);

      const summary: AgentSummary = {
        provider: manifest.provider,
        agent: manifest.agent,
        displayName: manifest.displayName,
        shortName: manifest.shortName,
        status: mostSevereStatus(agentSnapshots, now),
        snapshots: agentSnapshots,
        doctorStatus: resolveDoctorStatus(agentChecks)
      };

      if (primarySnapshot) {
        summary.primarySnapshot = primarySnapshot;
        summary.lastObservedAt = primarySnapshot.observedAt;
      }

      const emptyState = describeEmptyQuotaState(
        manifest,
        agentSnapshots,
        agentChecks
      );

      if (emptyState) {
        summary.emptyState = emptyState;
      }

      return summary;
    });
  }

  listQuotaSnapshots(): QuotaSnapshot[] {
    return this.listVisibleQuotaSnapshots();
  }

  listDoctorChecks(): DoctorCheck[] {
    return this.store.listDoctorChecks();
  }

  listResetEvents(limit?: number): ResetEvent[] {
    return this.store
      .listResetEvents(limit)
      .filter((event) => this.isVisibleQuotaWindow(event));
  }

  listRefreshRuns(limit?: number): RefreshRun[] {
    return this.store.listRefreshRuns(limit);
  }

  private listVisibleQuotaSnapshots(): QuotaSnapshot[] {
    const snapshots = this.store.listLatestQuotaSnapshots();

    return snapshots.filter(
      (snapshot) =>
        (this.options.includeDemoSnapshots || snapshot.source !== "demo") &&
        this.isVisibleQuotaWindow(snapshot)
    );
  }

  private isVisibleQuotaWindow(item: {
    provider: string;
    agent: string;
    windowType: QuotaWindowType;
  }): boolean {
    const manifest = this.registry.adapters
      .map((adapter) => adapter.manifest)
      .find((candidate) => isSameAgent(candidate, item));

    return manifest?.supportedWindows.includes(item.windowType) ?? true;
  }
}

function isSameAgent(
  manifest: AgentManifest,
  item: { provider: string; agent: string }
): boolean {
  return manifest.provider === item.provider && manifest.agent === item.agent;
}
