// Logic that was previously duplicated verbatim between app.js and mini.js.
// Only genuinely identical, presentation-agnostic functions live here —
// anything with legitimate per-surface differences (compact labels, widget
// date formats) stays local to each file.

export const languageStorageKey = "aiqd.language";
export const defaultLanguage = "en";

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
      official_statusline: tx("Claude Code statusline", "Claude Code 状态栏"),
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
