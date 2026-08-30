import { windowLabel } from "./quota-state.js";
import type {
  AgentSummary,
  DoctorCheck,
  RefreshResult
} from "./types.js";

export type RealDataReadinessInput = {
  agents: readonly AgentSummary[];
  checks: readonly DoctorCheck[];
  configErrors: readonly string[];
  demoMode: boolean;
  refreshResult: Pick<RefreshResult, "errors">;
};

export type RealDataReadiness = {
  ok: boolean;
  checks: RealDataReadinessCheck[];
};

export type RealDataReadinessCheck = {
  provider: string;
  agent: string;
  displayName: string;
  status: "pass" | "fail";
  message: string;
  action?: string;
};

export function buildRealDataReadiness(
  input: RealDataReadinessInput
): RealDataReadiness {
  const checks: RealDataReadinessCheck[] = [];

  if (hasBlockingDiagnosticFailures(input)) {
    checks.push({
      provider: "local",
      agent: "doctor",
      displayName: "Diagnostics",
      status: "fail",
      message: "Blocking diagnostics must pass before a real-data trial.",
      action: "Run the normal doctor command and fix any failed checks first."
    });
  }

  if (input.demoMode) {
    checks.push({
      provider: "local",
      agent: "mode",
      displayName: "Mode",
      status: "fail",
      message: "Demo mode is enabled.",
      action: "Run without --demo so AIQD reads only local real-data sources."
    });
  }

  for (const agent of input.agents) {
    const snapshot = agent.primarySnapshot;

    if (!snapshot) {
      checks.push({
        provider: agent.provider,
        agent: agent.agent,
        displayName: agent.displayName,
        status: "fail",
        message: `${agent.displayName} has no quota snapshot yet.`,
        action: agent.emptyState?.action ?? "Finish setup, then refresh real data."
      });
      continue;
    }

    if (snapshot.source === "demo") {
      checks.push({
        provider: agent.provider,
        agent: agent.agent,
        displayName: agent.displayName,
        status: "fail",
        message: `${agent.displayName} is showing demo quota data.`,
        action: "Run without --demo and refresh real data."
      });
      continue;
    }

    if (snapshot.freshness.status !== "fresh") {
      checks.push({
        provider: agent.provider,
        agent: agent.agent,
        displayName: agent.displayName,
        status: "fail",
        message: `${agent.displayName} quota data is stale: ${snapshot.freshness.label}.`,
        action: "Refresh the source or record a new visible quota value."
      });
      continue;
    }

    checks.push({
      provider: agent.provider,
      agent: agent.agent,
      displayName: agent.displayName,
      status: "pass",
      message: `${windowLabel(snapshot.windowType)} quota from ${snapshot.source}, observed ${snapshot.observedAt}.`
    });
  }

  return {
    checks,
    ok: isReadinessOk(checks)
  };
}

function isReadinessOk(checks: RealDataReadinessCheck[]): boolean {
  const blockingChecksOk = checks
    .filter((check) => check.provider === "local")
    .every((check) => check.status === "pass");

  const providerGroups = groupChecksByProvider(
    checks.filter((check) => check.provider !== "local")
  );

  const providersOk = [...providerGroups.values()].every((group) =>
    group.some((check) => check.status === "pass")
  );

  return blockingChecksOk && providersOk;
}

function groupChecksByProvider(
  checks: RealDataReadinessCheck[]
): Map<string, RealDataReadinessCheck[]> {
  const groups = new Map<string, RealDataReadinessCheck[]>();

  for (const check of checks) {
    const group = groups.get(check.provider) ?? [];
    group.push(check);
    groups.set(check.provider, group);
  }

  return groups;
}

export function hasBlockingDiagnosticFailures(
  input: RealDataReadinessInput
): boolean {
  return (
    input.configErrors.length > 0 ||
    input.refreshResult.errors.length > 0 ||
    input.checks.some((check) => check.status === "fail")
  );
}
