import type {
  DoctorCheck,
  DoctorStatus,
  QuotaSnapshot,
  QuotaStatus
} from "./types.js";

const statusSeverity: Record<QuotaStatus, number> = {
  critical: 5,
  warning: 4,
  stale: 3,
  unknown: 2,
  healthy: 1
};

const doctorSeverity: Record<DoctorStatus, number> = {
  fail: 4,
  warn: 3,
  info: 2,
  pass: 1
};

export function isSnapshotExpired(
  snapshot: QuotaSnapshot,
  now = new Date()
): boolean {
  if (!snapshot.expiresAt) {
    return false;
  }

  return Date.parse(snapshot.expiresAt) <= now.getTime();
}

export function resolveQuotaStatus(
  snapshot: QuotaSnapshot | undefined,
  now = new Date()
): QuotaStatus {
  if (!snapshot) {
    return "unknown";
  }

  if (snapshot.stale || isSnapshotExpired(snapshot, now)) {
    return "stale";
  }

  if (typeof snapshot.remainingPercent !== "number") {
    return "unknown";
  }

  if (snapshot.remainingPercent <= 10) {
    return "critical";
  }

  if (snapshot.remainingPercent <= 20) {
    return "warning";
  }

  return "healthy";
}

export function choosePrimarySnapshot(
  snapshots: QuotaSnapshot[],
  now = new Date()
): QuotaSnapshot | undefined {
  return [...snapshots].sort((left, right) => {
    const leftStatus = resolveQuotaStatus(left, now);
    const rightStatus = resolveQuotaStatus(right, now);
    const severityDelta = statusSeverity[rightStatus] - statusSeverity[leftStatus];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    const leftRemaining = left.remainingPercent ?? Number.POSITIVE_INFINITY;
    const rightRemaining = right.remainingPercent ?? Number.POSITIVE_INFINITY;

    if (leftRemaining !== rightRemaining) {
      return leftRemaining - rightRemaining;
    }

    const leftReset = left.resetAt ? Date.parse(left.resetAt) : Number.POSITIVE_INFINITY;
    const rightReset = right.resetAt ? Date.parse(right.resetAt) : Number.POSITIVE_INFINITY;

    return leftReset - rightReset;
  })[0];
}

export function resolveDoctorStatus(checks: DoctorCheck[]): DoctorStatus {
  return checks.reduce<DoctorStatus>((current, check) => {
    return doctorSeverity[check.status] > doctorSeverity[current]
      ? check.status
      : current;
  }, "pass");
}

export function mostSevereStatus(
  snapshots: QuotaSnapshot[],
  now = new Date()
): QuotaStatus {
  const primary = choosePrimarySnapshot(snapshots, now);
  return resolveQuotaStatus(primary, now);
}
