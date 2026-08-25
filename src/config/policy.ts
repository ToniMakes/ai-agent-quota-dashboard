// How long a Claude Code statusline snapshot counts as fresh. Shared by the
// adapter (which sets QuotaSnapshot.expiresAt) and the setup/readiness status
// check (which independently judges "is the latest snapshot still usable"),
// so both sides agree on one definition of "fresh" instead of drifting.
export const claudeStatuslineFreshnessMs = 5 * 60 * 60 * 1000;
