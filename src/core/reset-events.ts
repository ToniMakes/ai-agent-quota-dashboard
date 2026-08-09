import type { QuotaSnapshot, ResetEvent } from "./types.js";

const resetAtChangeToleranceMs = 5 * 60 * 1000;
const replenishedThresholdPercent = 95;
const replenishedJumpPercent = 20;

export function detectResetEvent(
  previous: QuotaSnapshot | undefined,
  current: QuotaSnapshot
): ResetEvent | undefined {
  if (!previous || current.source === "demo" || current.source === "unavailable") {
    return undefined;
  }

  const resetAtChanged = hasResetAtChanged(previous, current);
  const quotaReplenished = hasQuotaReplenished(previous, current);

  if (!resetAtChanged && !quotaReplenished) {
    return undefined;
  }

  const eventType = resetAtChanged
    ? "reset_anchor_changed"
    : "quota_replenished";
  const event: ResetEvent = {
    provider: current.provider,
    agent: current.agent,
    windowType: current.windowType,
    eventType,
    observedAt: current.observedAt,
    source: current.source,
    confidence: current.confidence,
    note:
      eventType === "reset_anchor_changed"
        ? "The reported reset time changed. Treat the new time as an observed value, not a prediction."
        : "Remaining quota increased sharply. This may indicate a reset, credit change, or backend limit update."
  };

  if (previous.resetAt) event.previousResetAt = previous.resetAt;
  if (current.resetAt) event.newResetAt = current.resetAt;
  if (typeof previous.remainingPercent === "number") {
    event.previousRemainingPercent = previous.remainingPercent;
  }
  if (typeof current.remainingPercent === "number") {
    event.newRemainingPercent = current.remainingPercent;
  }

  return event;
}

function hasResetAtChanged(
  previous: QuotaSnapshot,
  current: QuotaSnapshot
): boolean {
  if (!previous.resetAt || !current.resetAt) {
    return false;
  }

  const previousTime = Date.parse(previous.resetAt);
  const currentTime = Date.parse(current.resetAt);

  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) {
    return previous.resetAt !== current.resetAt;
  }

  return Math.abs(currentTime - previousTime) > resetAtChangeToleranceMs;
}

function hasQuotaReplenished(
  previous: QuotaSnapshot,
  current: QuotaSnapshot
): boolean {
  if (
    typeof previous.remainingPercent !== "number" ||
    typeof current.remainingPercent !== "number"
  ) {
    return false;
  }

  const jump = current.remainingPercent - previous.remainingPercent;

  return (
    current.remainingPercent >= replenishedThresholdPercent &&
    jump >= replenishedJumpPercent
  );
}
