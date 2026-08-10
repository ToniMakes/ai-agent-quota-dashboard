import type { CodexSnapshotSetupStatus } from "../setup/codex-snapshot-status.js";
import type { ClaudeStatuslineSetupStatus } from "../setup/claude-statusline-status.js";
import {
  buildRealDataReadiness,
  hasBlockingDiagnosticFailures,
  type RealDataReadinessCheck
} from "../core/real-data-readiness.js";
import type { DoctorReportInput } from "./doctor-report.js";

export type TrialPreflightInput = DoctorReportInput & {
  claudeStatus?: ClaudeStatuslineSetupStatus;
  codexStatus?: CodexSnapshotSetupStatus;
};

export function formatTrialPreflightReport(input: TrialPreflightInput): string {
  const readiness = buildRealDataReadiness(input);
  const blockingDiagnostics = hasBlockingDiagnosticFailures(input);
  const ok = readiness.ok && !blockingDiagnostics;
  const lines = [
    "AI Agent Quota Trial Preflight",
    "",
    `Overall: ${ok ? "ready" : "not ready"}`,
    `Generated: ${input.generatedAt}`,
    `Mode: ${input.demoMode ? "demo" : "local"}`,
    "",
    "Sources:",
    formatCodexLine(input.codexStatus),
    formatClaudeLine(input.claudeStatus),
    formatDoctorLine(input),
    "",
    "Readiness checks:",
    ...readiness.checks.map(formatReadinessCheck)
  ];

  if (!ok) {
    const commands = new Set<string>([
      "npm run doctor",
      "npm run trial:preflight",
      "npm run trial:ready"
    ]);

    addCommand(commands, input.codexStatus?.nextAction);
    addCommand(commands, input.claudeStatus?.nextAction);

    if (input.claudeStatus?.readiness === "needs_setup") {
      commands.add("npm run claude:self-test");
      commands.add(input.claudeStatus.writeCommand);
    }

    lines.push("", "Next useful commands:");
    lines.push(...[...commands].map((command) => `  ${command}`));
  }

  lines.push("", "Privacy: preflight reads only local configured sources and normalized setup status.");

  return lines.join("\n");
}

export function isTrialPreflightReady(input: TrialPreflightInput): boolean {
  return (
    buildRealDataReadiness(input).ok &&
    !hasBlockingDiagnosticFailures(input)
  );
}

export function trialPreflightHelpText(): string {
  return [
    "AI Agent Quota Trial Preflight",
    "",
    "Usage:",
    "  ai-agent-quota trial preflight [--demo] [--db <path>] [--config <path>]",
    "",
    "Runs one local refresh and prints the shortest path to a real-data desktop",
    "trial. It does not install Claude Code statusline settings or modify external",
    "agent configuration."
  ].join("\n");
}

function formatCodexLine(status?: CodexSnapshotSetupStatus): string {
  if (!status) {
    return "  - Codex: unknown";
  }

  return formatSourceLine({
    action: status.nextAction,
    label: "Codex",
    state: codexPreflightState(status),
    summary: status.readinessLabel
  });
}

function formatClaudeLine(status?: ClaudeStatuslineSetupStatus): string {
  if (!status) {
    return "  - Claude Code: unknown";
  }

  return formatSourceLine({
    action: status.nextAction,
    label: "Claude Code",
    state: claudePreflightState(status),
    summary: status.readinessLabel
  });
}

function codexPreflightState(status: CodexSnapshotSetupStatus): string {
  if (status.readiness === "ready") return "ready";
  if (status.readiness === "expired") return "needs update";
  if (status.readiness === "needs_attention") return "needs attention";
  return "needs setup";
}

function claudePreflightState(status: ClaudeStatuslineSetupStatus): string {
  if (status.readiness === "ready") return "ready";
  if (status.readiness === "waiting_for_data") return "waiting";
  if (status.readiness === "needs_attention") return "needs attention";
  return "needs setup";
}

function formatDoctorLine(input: TrialPreflightInput): string {
  const blocking = hasBlockingDiagnosticFailures(input);

  return formatSourceLine({
    action: blocking ? "Run npm run doctor and fix failed checks first." : undefined,
    label: "Doctor",
    state: blocking ? "needs attention" : "pass",
    summary: blocking
      ? "Blocking diagnostics or refresh errors are present."
      : "No blocking diagnostics."
  });
}

function formatSourceLine(input: {
  action?: string | undefined;
  label: string;
  state: string;
  summary: string;
}): string {
  const base = `  - ${input.label}: ${input.state} (${input.summary})`;

  return input.action ? `${base}\n    Next: ${input.action}` : base;
}

function addCommand(commands: Set<string>, value?: string): void {
  if (!value?.startsWith("node ")) {
    return;
  }

  commands.add(value);
}

function formatReadinessCheck(check: RealDataReadinessCheck): string {
  const lines = [
    `  - [${check.status}] ${check.displayName}: ${check.message}`
  ];

  if (check.action) {
    lines.push(`    Next: ${check.action}`);
  }

  return lines.join("\n");
}
