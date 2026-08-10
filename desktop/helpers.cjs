function summarizeAgents(agents, options = {}) {
  if (!Array.isArray(agents) || agents.length === 0) {
    return "No agents configured";
  }

  return agents
    .map((agent) => summarizeAgent(agent, options))
    .join(" | ");
}

function buildTrayMenuTemplate(input) {
  const actions = input.actions ?? {};
  const shortcuts = input.shortcuts ?? {};
  const refreshLabel = input.isRefreshing ? "Refreshing" : "Refresh Now";

  return [
    { label: input.trayStatus, enabled: false },
    { type: "separator" },
    {
      label: "Open Mini Panel",
      accelerator: shortcuts.panel,
      click: actions.togglePanelWindow
    },
    {
      label: "Toggle Desktop Widget",
      accelerator: shortcuts.widget,
      click: actions.toggleWidgetWindow
    },
    {
      label: refreshLabel,
      accelerator: shortcuts.refresh,
      enabled: !input.isRefreshing,
      click: actions.refreshTrayNow
    },
    { type: "separator" },
    { label: "Open Dashboard", click: actions.openDashboardWindow },
    { label: "Open Doctor", click: actions.openDoctorWindow },
    { label: "Open Settings", click: actions.openSettingsWindow },
    { type: "separator" },
    { label: "Quit", click: actions.quit }
  ];
}

function dashboardPath(view, target) {
  const allowedViews = new Set(["dashboard", "doctor", "settings"]);

  if (!allowedViews.has(view)) {
    return "/";
  }

  const hash = normalizeDashboardTarget(target);

  return `/?view=${encodeURIComponent(view)}${hash ? `#${hash}` : ""}`;
}

function summarizeAgent(agent, options = {}) {
  const snapshot = agent.primarySnapshot;
  const name = agent.shortName ?? agent.displayName ?? agent.agent;

  if (!snapshot) {
    if (agent.emptyState?.reason === "waiting_for_statusline_data") {
      return `${name}: waiting`;
    }

    if (agent.emptyState?.reason === "adapter_error") {
      return `${name}: check`;
    }

    if (
      agent.emptyState?.reason === "no_readable_paths" ||
      agent.emptyState?.reason === "no_supported_source" ||
      agent.emptyState?.reason === "no_quota_data"
    ) {
      return `${name}: setup`;
    }

    return `${name}: --`;
  }

  const remaining =
    typeof snapshot.remainingPercent === "number"
      ? `${Math.round(snapshot.remainingPercent)}%`
      : typeof snapshot.remaining === "number"
        ? `${snapshot.remaining} ${snapshot.unit}`
        : "--";
  const reset = snapshot.resetAt
    ? ` ${formatResetDistance(snapshot.resetAt, options)}`
    : "";

  return `${name}: ${remaining}${reset}`;
}

function formatResetDistance(value, options = {}) {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return "reset unknown";
  }

  const nowMs = options.nowMs ?? Date.now();
  const seconds = Math.round((parsed - nowMs) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  const suffix = seconds < 0 ? "ago" : "left";

  if (absoluteSeconds >= 86_400) {
    return `${Math.round(absoluteSeconds / 86_400)}d ${suffix}`;
  }

  if (absoluteSeconds >= 3_600) {
    return `${Math.round(absoluteSeconds / 3_600)}h ${suffix}`;
  }

  if (absoluteSeconds >= 60) {
    return `${Math.round(absoluteSeconds / 60)}m ${suffix}`;
  }

  return `${absoluteSeconds}s ${suffix}`;
}

function hasClaudeWaitingState(agents) {
  return (
    Array.isArray(agents) &&
    agents.some(
      (agent) =>
        agent.agent === "claude-code" &&
        agent.emptyState?.reason === "waiting_for_statusline_data"
    )
  );
}

function shouldRefreshForClaudeStatusline(agents, setupStatus) {
  return Boolean(setupStatus?.latestHasRateLimits && hasClaudeWaitingState(agents));
}

function resolveDesktopShortcuts(env = {}) {
  return {
    panel: resolveShortcutValue(
      env.AIQD_SHORTCUT_PANEL,
      "CommandOrControl+Alt+Q"
    ),
    refresh: resolveShortcutValue(
      env.AIQD_SHORTCUT_REFRESH,
      "CommandOrControl+Alt+R"
    ),
    widget: resolveShortcutValue(
      env.AIQD_SHORTCUT_WIDGET,
      "CommandOrControl+Alt+W"
    )
  };
}

function resolveShortcutValue(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return fallback;
  }

  if (["0", "false", "off", "none", "disabled"].includes(normalized.toLowerCase())) {
    return undefined;
  }

  return normalized;
}

function normalizeDashboardTarget(target) {
  if (typeof target !== "string") {
    return "";
  }

  const normalized = target.trim().replace(/^#/, "");

  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(normalized)) {
    return "";
  }

  return encodeURIComponent(normalized);
}

function resolveWidgetBounds(input) {
  const { savedBounds, widgetSize, workArea } = input;
  const clampToWorkArea = input.clampToWorkArea ?? true;
  const bounds = isSavedWidgetBounds(savedBounds)
    ? {
        ...widgetSize,
        x: savedBounds.x,
        y: savedBounds.y
      }
    : {
        ...widgetSize,
        x: workArea.x + workArea.width - widgetSize.width - 24,
        y: workArea.y + 72
      };

  return clampToWorkArea ? clampBoundsToWorkArea(bounds, workArea) : bounds;
}

function isSavedWidgetBounds(value) {
  return (
    value &&
    typeof value === "object" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
  );
}

function clampBoundsToWorkArea(bounds, workArea) {
  return {
    ...bounds,
    x: clamp(bounds.x, workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
    y: clamp(bounds.y, workArea.y + 8, workArea.y + workArea.height - bounds.height - 8)
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  buildTrayMenuTemplate,
  clampBoundsToWorkArea,
  dashboardPath,
  formatResetDistance,
  hasClaudeWaitingState,
  isSavedWidgetBounds,
  resolveWidgetBounds,
  resolveDesktopShortcuts,
  shouldRefreshForClaudeStatusline,
  summarizeAgent,
  summarizeAgents
};
