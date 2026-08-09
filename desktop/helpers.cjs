function summarizeAgents(agents, options = {}) {
  if (!Array.isArray(agents) || agents.length === 0) {
    return "No agents configured";
  }

  return agents
    .map((agent) => summarizeAgent(agent, options))
    .join(" | ");
}

function summarizeAgent(agent, options = {}) {
  const snapshot = agent.primarySnapshot;
  const name = agent.shortName ?? agent.displayName ?? agent.agent;

  if (!snapshot) {
    if (agent.emptyState?.reason === "waiting_for_statusline_data") {
      return `${name}: waiting`;
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
  clampBoundsToWorkArea,
  formatResetDistance,
  hasClaudeWaitingState,
  isSavedWidgetBounds,
  resolveWidgetBounds,
  shouldRefreshForClaudeStatusline,
  summarizeAgent,
  summarizeAgents
};
