import type {
  AgentManifest,
  DoctorCheck,
  QuotaSnapshot,
  UsageEvent
} from "../core/types.js";

export type AdapterScanContext = {
  now: Date;
};

// The options every provider's createXAdapter() accepts at minimum. Each
// provider's own XAdapterOptions type extends this rather than redeclaring
// it, so a manifest or registry that only needs the common shape (see
// provider-manifest.ts) can reference one name instead of retyping it.
export type CommonAdapterOptions = {
  configuredDataPaths?: string[];
  demoMode: boolean;
};

export type AdapterScanResult = {
  snapshots: QuotaSnapshot[];
  usageEvents: UsageEvent[];
  doctorChecks: DoctorCheck[];
};

export interface AgentAdapter {
  manifest: AgentManifest;
  scan(context: AdapterScanContext): Promise<AdapterScanResult>;
}
