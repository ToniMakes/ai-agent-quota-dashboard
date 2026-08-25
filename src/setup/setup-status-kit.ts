// Shared shapes for provider setup-status modules (claude-statusline-status.ts,
// codex-snapshot-status.ts). Each provider's readiness rules and check list
// are genuinely provider-specific and stay in their own file — this only
// captures the result shapes that were being redeclared identically in each.
import type { DoctorStatus } from "../core/types.js";

export type SetupCheck = {
  id: string;
  label: string;
  status: DoctorStatus;
  message: string;
  detail?: string;
  action?: string;
};

export type ReadinessResolution<TReadiness extends string> = {
  readiness: TReadiness;
  readinessLabel: string;
  nextAction: string;
};
