import type { QuotaSnapshot, UsageEvent } from "./types.js";

export type BurnForecast = {
  burnRatePerHour?: number;
  hoursToEmpty?: number;
  likelyToRunOutBeforeReset?: boolean;
};

export function estimateBurnForecast(
  snapshot: QuotaSnapshot,
  events: UsageEvent[],
  now = new Date()
): BurnForecast {
  if (
    typeof snapshot.remaining !== "number" ||
    !snapshot.resetAt ||
    events.length < 2
  ) {
    return {};
  }

  const sorted = [...events].sort(
    (left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt)
  );
  const first = sorted[0];
  const last = sorted.at(-1);

  if (!first || !last) {
    return {};
  }

  const elapsedHours =
    (Date.parse(last.observedAt) - Date.parse(first.observedAt)) / 3_600_000;

  if (elapsedHours <= 0) {
    return {};
  }

  const totalTokens = sorted.reduce((sum, event) => {
    return sum + (event.totalTokens ?? 0);
  }, 0);
  const burnRatePerHour = totalTokens / elapsedHours;

  if (burnRatePerHour <= 0) {
    return { burnRatePerHour: 0 };
  }

  const hoursToEmpty = snapshot.remaining / burnRatePerHour;
  const hoursUntilReset = (Date.parse(snapshot.resetAt) - now.getTime()) / 3_600_000;

  return {
    burnRatePerHour,
    hoursToEmpty,
    likelyToRunOutBeforeReset: hoursToEmpty < hoursUntilReset
  };
}
