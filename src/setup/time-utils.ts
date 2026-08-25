export function secondsSince(value: string, now: Date): number | undefined {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.round((now.getTime() - parsed) / 1000));
}
