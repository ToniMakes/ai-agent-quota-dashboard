import type {
  AgentManifest,
  DoctorCheck,
  QuotaSnapshot,
  UsageEvent
} from "../core/types.js";

export type AdapterScanContext = {
  now: Date;
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
