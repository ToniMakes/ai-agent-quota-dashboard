// Logic that was previously duplicated verbatim between app.js and mini.js.
// Only genuinely identical, presentation-agnostic functions live here:
// anything with legitimate per-surface differences (compact labels, widget
// date formats) stays local to each file.

// The frontend can't import the backend's provider manifest (src/adapters
// is Node-only (fs/os/child_process) and has no build step that exposes
// it to the browser), so these agent ids are named here once instead of
// being repeated as string literals at every comparison below.
export const codexAgentId = "codex";
export const claudeCodeAgentId = "claude-code";
export const claudeDesktopAgentId = "claude-desktop";

export const languageStorageKey = "aiqd.language";
export const defaultLanguage = "en";
export const codexResetCreditReminderStorageKey =
  "aiqd:codex-reset-credit-reminder:v1";

export function resolveInitialLanguage() {
  const savedLanguage = window.localStorage?.getItem(languageStorageKey);

  if (savedLanguage === "zh" || savedLanguage === "en") {
    return savedLanguage;
  }

  return defaultLanguage;
}

export function createI18n(getLanguage) {
  function tx(english, chinese, values = {}) {
    const template = getLanguage() === "zh" ? chinese : english;

    return Object.entries(values).reduce(
      (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
      template
    );
  }

  function locale() {
    return getLanguage() === "zh" ? "zh-CN" : "en-US";
  }

  function sourceLabel(source) {
    const labels = {
      official_api: tx("Official API", "官方 API"),
      official_cli: tx("Official CLI", "官方 CLI"),
      official_statusline: tx("Claude Code", "Claude Code"),
      local_quota_snapshot: tx("Local snapshot", "本地快照"),
      local_usage_log: tx("Local log", "本地日志"),
      estimated: tx("Estimated", "估算"),
      manual: tx("Manual", "手动"),
      demo: tx("Demo", "演示"),
      unavailable: tx("Unavailable", "不可用")
    };

    return labels[source] ?? source;
  }

  function compactNumber(value) {
    return new Intl.NumberFormat(locale(), {
      notation: "compact",
      maximumFractionDigits: 1
    }).format(value);
  }

  function formatRelative(value) {
    if (!value) {
      return "--";
    }

    const date = new Date(value);
    const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const absoluteSeconds = Math.abs(deltaSeconds);
    const units = [
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
      ["second", 1]
    ];
    const formatter = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });

    for (const [unit, seconds] of units) {
      if (absoluteSeconds >= seconds || unit === "second") {
        return formatter.format(Math.round(deltaSeconds / seconds), unit);
      }
    }

    return date.toLocaleString(locale());
  }

  return { tx, locale, sourceLabel, compactNumber, formatRelative };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isStaleSnapshot(snapshot) {
  return Boolean(
    snapshot?.freshness?.status === "stale" ||
      snapshot?.stale ||
      (snapshot?.expiresAt && Date.parse(snapshot.expiresAt) <= Date.now())
  );
}

export function isSameSnapshot(left, right) {
  return Boolean(
    left &&
      right &&
      left.provider === right.provider &&
      left.agent === right.agent &&
      left.windowType === right.windowType &&
      left.observedAt === right.observedAt
  );
}

export function hasUsableResetAt(snapshot) {
  if (!snapshot?.resetAt) {
    return false;
  }

  const resetAtMs = Date.parse(snapshot.resetAt);
  return !Number.isNaN(resetAtMs) && resetAtMs > Date.now();
}

export function mergeSnapshotResetTiming(snapshot, sourceSnapshots) {
  if (!snapshot || hasUsableResetAt(snapshot)) {
    return snapshot;
  }

  const timingSource = sourceSnapshots.find(
    (candidate) =>
      candidate.windowType === snapshot.windowType && hasUsableResetAt(candidate)
  );

  if (!timingSource) {
    return snapshot;
  }

  return {
    ...snapshot,
    resetAt: timingSource.resetAt
  };
}

export function mergeClaudeSnapshots(winnerSnapshots, sources) {
  const sourceSnapshots = sources.flatMap((source) => source.snapshots ?? []);
  const byWindow = new Map();

  for (const snapshot of winnerSnapshots) {
    byWindow.set(
      snapshot.windowType,
      mergeSnapshotResetTiming(snapshot, sourceSnapshots)
    );
  }

  for (const snapshot of sourceSnapshots) {
    if (byWindow.has(snapshot.windowType) || isStaleSnapshot(snapshot)) {
      continue;
    }

    byWindow.set(
      snapshot.windowType,
      mergeSnapshotResetTiming(snapshot, sourceSnapshots)
    );
  }

  return Array.from(byWindow.values());
}

export function primaryMeterClass(snapshot, status) {
  if (snapshot?.windowType === "session_5h" && status === "healthy") {
    return "session";
  }

  return status;
}

export function isFreshRealSnapshot(snapshot) {
  return Boolean(
    snapshot && snapshot.source !== "demo" && snapshot.freshness?.status !== "stale"
  );
}

export function hasSnapshotMeterValue(snapshot) {
  return Boolean(
    typeof snapshot?.remainingPercent === "number" ||
      (typeof snapshot?.remaining === "number" &&
        typeof snapshot?.total === "number" &&
        snapshot.total > 0)
  );
}

export function snapshotMeterValue(snapshot) {
  if (!snapshot) {
    return 0;
  }

  if (isStaleSnapshot(snapshot)) {
    return 0;
  }

  if (typeof snapshot.remainingPercent === "number") {
    return clamp(snapshot.remainingPercent, 0, 100);
  }

  if (
    typeof snapshot.remaining === "number" &&
    typeof snapshot.total === "number" &&
    snapshot.total > 0
  ) {
    return clamp((snapshot.remaining / snapshot.total) * 100, 0, 100);
  }

  return 0;
}

export function snapshotMeterClass(snapshot) {
  if (snapshot.windowType === "session_5h") {
    return "session";
  }

  return snapshot.stale ? "stale" : "standard";
}

export function formatUsed(snapshot, compactNumber) {
  if (!snapshot) {
    return "";
  }

  if (typeof snapshot.usedPercent === "number") {
    return `${Math.round(snapshot.usedPercent)}%`;
  }

  if (typeof snapshot.used === "number") {
    return `${compactNumber(snapshot.used)} ${snapshot.unit ?? ""}`.trim();
  }

  return "";
}

// Both surfaces resolve the identical English source string to Chinese here
// so the wording can't drift between the main dashboard and the mini panel.
export function staleReasonLabel(snapshot, tx) {
  if (snapshot?.freshness?.reason === "expired") {
    return tx("past the reported reset time", "已超过报告的重置时间");
  }

  if (snapshot?.freshness?.reason === "too_old") {
    return tx("needs refresh", "需要刷新");
  }

  if (snapshot?.freshness?.reason === "source_marked_stale" || snapshot?.stale) {
    return tx("marked stale by source", "额度来源标记为过期");
  }

  return tx("needs fresh data", "需要新数据");
}

export function defaultCodexResetCreditReminderPreferences() {
  return {
    enabled: false,
    daysBefore: [1, 3]
  };
}

export function normalizeCodexResetCreditReminderPreferences(value) {
  const fallback = defaultCodexResetCreditReminderPreferences();
  const preferences = value && typeof value === "object" ? value : {};
  const rawDays = Array.isArray(preferences.daysBefore)
    ? preferences.daysBefore
    : [preferences.daysBefore];
  const daysBefore = [
    ...new Set(
      rawDays
        .map((days) => Number(days))
        .filter((days) => Number.isFinite(days))
        .map((days) => Math.round(clamp(days, 1, 30)))
    )
  ].sort((left, right) => left - right);

  return {
    enabled: preferences.enabled === true,
    daysBefore: daysBefore.length > 0 ? daysBefore : fallback.daysBefore
  };
}

export function availableCodexResetCredits(credits, nowMs = Date.now()) {
  return (Array.isArray(credits) ? credits : [])
    .filter((credit) => {
      const expiresAtMs = Date.parse(credit?.expiresAt);

      return (
        credit?.status === "available" &&
        credit?.resetType === "codexRateLimits" &&
        Number.isFinite(expiresAtMs) &&
        expiresAtMs > nowMs
      );
    })
    .slice()
    .sort((left, right) => Date.parse(left.expiresAt) - Date.parse(right.expiresAt));
}

export function codexResetCreditReminderState(
  credits,
  preferences,
  nowMs = Date.now()
) {
  const activeCredits = availableCodexResetCredits(credits, nowMs);
  const normalized = normalizeCodexResetCreditReminderPreferences(preferences);
  const nextCredit = activeCredits[0];
  const nextExpiresAtMs = nextCredit ? Date.parse(nextCredit.expiresAt) : undefined;
  const daysUntilNext =
    typeof nextExpiresAtMs === "number"
      ? Math.max(0, Math.ceil((nextExpiresAtMs - nowMs) / 86_400_000))
      : undefined;
  const reminderDays = normalized.daysBefore;
  const withinReminder =
    normalized.enabled &&
    typeof daysUntilNext === "number" &&
    reminderDays.some((days) => daysUntilNext <= days);

  return {
    count: activeCredits.length,
    credits: activeCredits,
    daysUntilNext,
    nextCredit,
    preferences: normalized,
    reminderDays,
    withinReminder
  };
}

export function agentSubscriptionTier(agent) {
  if (typeof agent?.subscriptionTier === "string" && agent.subscriptionTier.trim()) {
    return agent.subscriptionTier.trim();
  }

  const snapshots = [
    agent?.primarySnapshot,
    ...(Array.isArray(agent?.snapshots) ? agent.snapshots : [])
  ].filter(Boolean);

  for (const snapshot of snapshots) {
    const tier = subscriptionTierFromPlanLabel(snapshot?.planLabel);

    if (tier) {
      return tier;
    }
  }

  return undefined;
}

function subscriptionTierFromPlanLabel(planLabel) {
  if (typeof planLabel !== "string" || !planLabel.trim()) {
    return undefined;
  }

  const normalized = planLabel
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");
  const compact = normalized.replace(/\s+/g, "");

  if (compact.includes("prolite")) {
    return "Pro Lite";
  }

  const knownTiers = [
    ["enterprise", "Enterprise"],
    ["business", "Business"],
    ["team", "Team"],
    ["premium", "Premium"],
    ["max", "Max"],
    ["plus", "Plus"],
    ["pro", "Pro"],
    ["free", "Free"]
  ];

  for (const [token, label] of knownTiers) {
    if (new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(normalized)) {
      return label;
    }
  }

  return undefined;
}

export function readinessDisplayName(check, language) {
  if (!check?.displayName || language !== "zh") {
    return check?.displayName;
  }

  const labels = {
    Diagnostics: "诊断",
    Mode: "模式"
  };

  return labels[check.displayName] ?? check.displayName;
}

export function defaultOnboardingPreferences() {
  return {
    agents: {
      claude: true,
      codex: true
    },
    claudeSources: {
      cli: false,
      desktop: true
    },
    claudeSource: "desktop",
    completed: false
  };
}

export function normalizeClaudeSources(value, fallback) {
  const sources =
    value?.claudeSources && typeof value.claudeSources === "object"
      ? value.claudeSources
      : undefined;
  const legacySource =
    value?.claudeSource === "cli" || value?.claudeSource === "desktop"
      ? value.claudeSource
      : undefined;

  let desktop =
    sources?.desktop === true ||
    (sources?.desktop !== false && !sources && legacySource !== "cli") ||
    (!sources && !legacySource && fallback.desktop === true);
  let cli =
    sources?.cli === true ||
    (!sources && legacySource === "cli") ||
    (!sources && !legacySource && fallback.cli === true);

  if (!desktop && !cli) {
    desktop = true;
  }

  return {
    cli,
    desktop
  };
}

export function normalizeOnboardingPreferences(preferences) {
  const fallback = defaultOnboardingPreferences();
  const value = preferences && typeof preferences === "object" ? preferences : {};
  const agents = value.agents && typeof value.agents === "object" ? value.agents : {};
  const claudeSources = normalizeClaudeSources(value, fallback.claudeSources);

  return {
    agents: {
      claude: agents.claude !== false,
      codex: agents.codex !== false
    },
    claudeSources,
    claudeSource: claudeSources.desktop ? "desktop" : "cli",
    completed: value.completed === true
  };
}

export const firstRunOnboardingStorageKey = "aiqd:first-run-onboarding:v1";

export async function loadFirstRunOnboardingPreferences() {
  try {
    const preferences = window.aiqdDesktop?.getFirstRunOnboarding
      ? await window.aiqdDesktop.getFirstRunOnboarding()
      : JSON.parse(window.localStorage?.getItem(firstRunOnboardingStorageKey) ?? "null");

    return normalizeOnboardingPreferences(preferences);
  } catch {
    return defaultOnboardingPreferences();
  }
}

export function shouldShowAgentFamily(family, onboardingPreferences) {
  if (!onboardingPreferences?.completed) {
    return true;
  }

  if (family === codexAgentId) {
    return onboardingPreferences.agents.codex !== false;
  }

  if (family === "claude") {
    return onboardingPreferences.agents.claude !== false;
  }

  return true;
}

export function selectedClaudeSources(onboardingPreferences) {
  return normalizeOnboardingPreferences(onboardingPreferences).claudeSources;
}

export function shouldShowClaudeDesktopWorkflow(onboardingPreferences) {
  if (!shouldShowAgentFamily("claude", onboardingPreferences)) {
    return false;
  }

  if (!onboardingPreferences?.completed) {
    return true;
  }

  return selectedClaudeSources(onboardingPreferences).desktop;
}

export function shouldShowClaudeCliWorkflow(onboardingPreferences) {
  if (!shouldShowAgentFamily("claude", onboardingPreferences)) {
    return false;
  }

  if (!onboardingPreferences?.completed) {
    return true;
  }

  const sources = selectedClaudeSources(onboardingPreferences);
  return sources.cli && !sources.desktop;
}

export function filterAgentsByOnboarding(agents, onboardingPreferences) {
  return agents.filter((agent) => {
    if (agent.agent === codexAgentId) {
      return shouldShowAgentFamily(codexAgentId, onboardingPreferences);
    }

    if (agent.agent === claudeCodeAgentId) {
      return shouldShowClaudeCliWorkflow(onboardingPreferences);
    }

    if (agent.agent === claudeDesktopAgentId) {
      return shouldShowClaudeDesktopWorkflow(onboardingPreferences);
    }

    if (agent.provider === "anthropic" || String(agent.agent).startsWith("claude")) {
      return shouldShowAgentFamily("claude", onboardingPreferences);
    }

    return true;
  });
}

export function preferredClaudeDashboardSource(onboardingPreferences) {
  if (!onboardingPreferences?.completed) {
    return undefined;
  }

  const sources = selectedClaudeSources(onboardingPreferences);

  if (sources.desktop) {
    return "desktop";
  }

  if (sources.cli) {
    return "cli";
  }

  return undefined;
}

// The dashboard shows one Claude card, not two: Claude Code CLI and Claude
// Desktop report the same underlying account, so showing both side by side
// reads as duplicate/contradictory data. AIQD auto-picks whichever source is
// actually usable right now; Doctor and Settings still show each source's
// own status separately for troubleshooting.
export function pickPrimaryClaudeAgent(claudeCode, claudeDesktop, preferredSource) {
  if (preferredSource === "desktop" && claudeDesktop) {
    return claudeDesktop;
  }

  if (preferredSource === "cli" && claudeCode) {
    return claudeCode;
  }

  if (!claudeDesktop) {
    return claudeCode;
  }

  if (!claudeCode) {
    return claudeDesktop;
  }

  const codeFresh = isFreshRealSnapshot(claudeCode.primarySnapshot);
  const desktopFresh = isFreshRealSnapshot(claudeDesktop.primarySnapshot);

  if (codeFresh !== desktopFresh) {
    return codeFresh ? claudeCode : claudeDesktop;
  }

  if (codeFresh && desktopFresh) {
    const codeAt = Date.parse(claudeCode.primarySnapshot?.observedAt ?? "") || 0;
    const desktopAt = Date.parse(claudeDesktop.primarySnapshot?.observedAt ?? "") || 0;
    return desktopAt > codeAt ? claudeDesktop : claudeCode;
  }

  if (claudeCode.primarySnapshot && !claudeDesktop.primarySnapshot) {
    return claudeCode;
  }

  if (claudeDesktop.primarySnapshot && !claudeCode.primarySnapshot) {
    return claudeDesktop;
  }

  return claudeCode;
}

export function buildDisplayAgents(agents, preferredSource) {
  const claudeCode = agents.find((agent) => agent.agent === claudeCodeAgentId);
  const claudeDesktop = agents.find((agent) => agent.agent === claudeDesktopAgentId);

  if (!claudeCode && !claudeDesktop) {
    return agents;
  }

  const winner = pickPrimaryClaudeAgent(claudeCode, claudeDesktop, preferredSource);
  const sources = [claudeCode, claudeDesktop].filter(Boolean);
  const snapshots = mergeClaudeSnapshots(winner.snapshots ?? [], sources);
  const primarySnapshot = mergeSnapshotResetTiming(
    winner.primarySnapshot,
    sources.flatMap((source) => source.snapshots ?? [])
  );
  const subscriptionTier =
    sources.find((source) => source.subscriptionTier)?.subscriptionTier ??
    winner.subscriptionTier;
  const merged = {
    ...winner,
    agent: "claude",
    displayName: "Claude",
    primarySnapshot,
    snapshots,
    shortName: "Claude",
    subscriptionTier
  };

  return agents
    .filter(
      (agent) => agent.agent !== claudeCodeAgentId && agent.agent !== claudeDesktopAgentId
    )
    .concat([merged]);
}
