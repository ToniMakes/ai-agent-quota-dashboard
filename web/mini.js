const state = {
  agents: [],
  generatedAt: undefined,
  isRefreshing: false,
  lastError: undefined,
  refreshRuns: [],
  setupStatus: undefined
};

const elements = {
  footer: document.querySelector("#mini-footer"),
  grid: document.querySelector("#mini-grid"),
  refreshButton: document.querySelector('[data-desktop-action="refresh"]'),
  shell: document.querySelector(".mini-shell")
};

const refreshIntervalMs = 15_000;
const mode = new URLSearchParams(window.location.search).get("mode") ?? "panel";

elements.shell.dataset.mode = mode;

document.addEventListener("click", async (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const control = target.closest("[data-desktop-action]");

  if (!(control instanceof HTMLElement)) {
    return;
  }

  await runDesktopAction(control);
});

document.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    await window.aiqdDesktop?.hideCurrentWindow();
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const control = target.closest("[data-desktop-action]");

  if (!(control instanceof HTMLElement) || control instanceof HTMLButtonElement) {
    return;
  }

  event.preventDefault();
  await runDesktopAction(control);
});

async function runDesktopAction(control) {
  const action = control.dataset.desktopAction;
  const target = control.dataset.dashboardTarget;

  if (action === "refresh") {
    await refreshNow();
    return;
  }

  if (action === "dashboard") {
    await openDashboardTarget(control.dataset.dashboardView ?? "dashboard", target);
  }

  if (action === "settings") {
    await openDashboardTarget("settings", target);
  }

  if (action === "doctor") {
    await openDashboardTarget("doctor", target);
  }

  if (action === "widget") {
    await window.aiqdDesktop?.toggleWidget();
  }

  if (action === "hide") {
    await window.aiqdDesktop?.hideCurrentWindow();
  }
}

async function openDashboardTarget(view, target) {
  if (window.aiqdDesktop) {
    await window.aiqdDesktop.openDashboard(view, target);
    return;
  }

  window.location.href = dashboardHref(view, target);
}

function dashboardHref(view, target) {
  const hash = target ? `#${encodeURIComponent(target)}` : "";

  return `/?view=${encodeURIComponent(view)}${hash}`;
}

await load();
window.setInterval(load, refreshIntervalMs);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void load();
  }
});

async function load(options = {}) {
  const allowRefresh = options.allowRefresh ?? true;

  try {
    const [agentsPayload, refreshRunsPayload, setupPayload] = await Promise.all([
      fetchJson("/api/agents"),
      fetchJson("/api/refresh-runs"),
      fetchJson("/api/setup/claude-statusline")
    ]);

    state.agents = agentsPayload.agents ?? [];
    state.generatedAt = agentsPayload.generatedAt;
    state.lastError = undefined;
    state.refreshRuns = refreshRunsPayload.runs ?? [];
    state.setupStatus = setupPayload.status;

    if (
      allowRefresh &&
      state.setupStatus?.latestHasRateLimits &&
      hasClaudeWaitingState(state.agents)
    ) {
      await fetchJson("/api/refresh", { method: "POST" });
      await load({ allowRefresh: false });
      return;
    }

    render();
  } catch {
    renderError();
  }
}

function render() {
  const agents = sortAgents(state.agents);

  if (agents.length === 0) {
    elements.grid.innerHTML = `<p class="mini-empty">No agents</p>`;
  } else {
    elements.grid.innerHTML = agents.map(renderAgent).join("");
  }

  renderFooter();
}

function renderAgent(agent) {
  const primary = agent.primarySnapshot;
  const status = agent.status ?? "unknown";
  const guidance = primary ? undefined : emptyStateGuidance(agent);
  const detail = primary ? snapshotDetail(primary) : guidance.detail;
  const label = primary
    ? `${windowLabel(primary.windowType)} left`
    : guidance.label;

  return `
    <article class="mini-agent ${escapeHtml(status)}" title="${escapeHtml(detail)}">
      <div class="mini-agent-top">
        <span class="status-dot ${escapeHtml(status)}" aria-hidden="true"></span>
        <strong>${escapeHtml(agent.shortName ?? agent.displayName)}</strong>
        <span class="mini-remaining">${formatRemaining(primary)}</span>
      </div>
      <div class="mini-primary-label">${escapeHtml(label)}</div>
      <div class="mini-meter" aria-hidden="true">
        <div class="mini-meter-fill ${escapeHtml(status)}" style="--value: ${meterValue(
          primary
        )}%"></div>
      </div>
      <div class="mini-window-list">${renderWindowRows(agent)}</div>
      <div class="mini-detail">${escapeHtml(detail)}</div>
    </article>
  `;
}

async function refreshNow() {
  if (state.isRefreshing) {
    return;
  }

  state.isRefreshing = true;
  renderFooter();

  try {
    await fetchJson("/api/refresh", { method: "POST" });
    await load({ allowRefresh: false });
  } catch {
    state.lastError = "Refresh failed";
    renderError();
  } finally {
    state.isRefreshing = false;
    renderFooter();
  }
}

function renderError() {
  elements.grid.innerHTML = `
    <article class="mini-agent unknown">
      <div class="mini-agent-top">
        <span class="status-dot unknown" aria-hidden="true"></span>
        <strong>Offline</strong>
        <span class="mini-remaining">--</span>
      </div>
      <div class="mini-primary-label">offline</div>
      <div class="mini-window-list">
        <div class="mini-empty-state">
          <strong>Local service unavailable</strong>
          <span>Restart the dashboard</span>
        </div>
      </div>
      <div class="mini-detail">Waiting for local service</div>
    </article>
  `;
  state.lastError = state.lastError ?? "Local service unavailable";
  renderFooter();
}

function renderFooter() {
  const footer = footerState();
  elements.footer.textContent = footer.text;
  elements.footer.className = `mini-footer ${footer.kind}`;

  if (footer.title) {
    elements.footer.title = footer.title;
  } else {
    elements.footer.removeAttribute("title");
  }

  if (footer.action) {
    elements.footer.dataset.desktopAction = footer.action;
    if (footer.target) {
      elements.footer.dataset.dashboardTarget = footer.target;
    } else {
      delete elements.footer.dataset.dashboardTarget;
    }
    elements.footer.setAttribute("role", "button");
    elements.footer.setAttribute("tabindex", "0");
    elements.footer.setAttribute("aria-label", footer.ariaLabel ?? footer.text);
  } else {
    delete elements.footer.dataset.desktopAction;
    delete elements.footer.dataset.dashboardTarget;
    elements.footer.removeAttribute("role");
    elements.footer.removeAttribute("tabindex");
    elements.footer.removeAttribute("aria-label");
  }

  if (elements.refreshButton instanceof HTMLButtonElement) {
    elements.refreshButton.disabled = state.isRefreshing;
    elements.refreshButton.classList.toggle("is-spinning", state.isRefreshing);
  }
}

function footerState() {
  if (state.isRefreshing) {
    return {
      kind: "pending",
      text: "Refreshing now"
    };
  }

  if (state.lastError) {
    return {
      kind: "warning",
      text: state.lastError
    };
  }

  const latestRun = latestRefreshRun();

  if ((latestRun?.errors?.length ?? 0) > 0) {
    return {
      action: "doctor",
      ariaLabel: "Open Doctor for refresh warning",
      kind: "warning",
      target: "refresh-run-list",
      text: "Refresh warning - open Doctor",
      title: refreshRunTitle(latestRun)
    };
  }

  if (needsRealDataSetup(state.agents)) {
    const setup = setupProgress(state.agents);

    if (latestRun && latestRun.snapshotsSaved > 0) {
      return {
        action: "settings",
        ariaLabel: "Open Settings to finish real data setup",
        kind: "info",
        target: setup.target,
        text: `${setup.ready}/${setup.total} ready - finish ${setup.missingText}`,
        title: [setup.title, refreshRunTitle(latestRun)].join("\n")
      };
    }

    return {
      action: "settings",
      ariaLabel: "Open Settings to set up real data",
      kind: "info",
      target: setup.target,
      text: `${setup.ready}/${setup.total} ready - finish ${setup.missingText}`,
      title: latestRun ? [setup.title, refreshRunTitle(latestRun)].join("\n") : setup.title
    };
  }

  if (hasClaudeWaitingState(state.agents)) {
    return {
      action: state.setupStatus?.statusLineManagedByApp ? undefined : "settings",
      ariaLabel: "Open Settings for Claude Code setup",
      kind: "info",
      target: "settings-content",
      text: state.setupStatus?.statusLineManagedByApp
        ? "Watching Claude Code for rate_limits"
        : "Claude Code setup needed",
      title: latestRun ? refreshRunTitle(latestRun) : undefined
    };
  }

  if (latestRun) {
    return {
      kind: "success",
      text: `${snapshotCountText(latestRun.snapshotsSaved)} - updated ${formatRelative(
        latestRun.observedAt
      )}`,
      title: refreshRunTitle(latestRun)
    };
  }

  return {
    kind: "success",
    text: `Updated ${formatRelative(state.generatedAt)}`
  };
}

function latestRefreshRun() {
  return state.refreshRuns
    .slice()
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
}

function snapshotCountText(count) {
  return `${count} snapshot${count === 1 ? "" : "s"}`;
}

function refreshRunTitle(run) {
  const lines = [
    `Last refresh ${formatRelative(run.observedAt)}`,
    `${run.snapshotsSaved} snapshots / ${run.usageEventsSaved} usage events / ${run.doctorChecksSaved} doctor checks / ${run.resetEventsSaved} reset events`
  ];

  if (run.errors?.length > 0) {
    lines.push(...run.errors);
  }

  return lines.join("\n");
}

function renderWindowRows(agent) {
  const snapshots = prioritizeSnapshots(agent.snapshots ?? [], agent.primarySnapshot);

  if (snapshots.length === 0) {
    const guidance = emptyStateGuidance(agent);

    return `
      <div class="mini-empty-state">
        <strong>${escapeHtml(guidance.title)}</strong>
        <span>${escapeHtml(guidance.detail)}</span>
        <button
          class="mini-action"
          type="button"
          data-desktop-action="${escapeHtml(guidance.action)}"
          ${guidance.target ? `data-dashboard-target="${escapeHtml(guidance.target)}"` : ""}
        >${escapeHtml(guidance.actionLabel)}</button>
      </div>
    `;
  }

  const visibleSnapshots = snapshots.slice(0, 2);
  const rows = visibleSnapshots.map(renderWindowRow).join("");
  const hiddenCount = snapshots.length - visibleSnapshots.length;
  const more =
    hiddenCount > 0
      ? `<div class="mini-window-more">+${hiddenCount} more ${
          hiddenCount === 1 ? "window" : "windows"
        }</div>`
      : "";

  return rows + more;
}

function renderWindowRow(snapshot) {
  const reset = resetSummary(snapshot.resetAt);
  const resetTitle = snapshot.resetAt
    ? `Reported reset ${formatTimestamp(snapshot.resetAt, { long: true })}`
    : "No reported reset";

  return `
    <div class="mini-window-row" title="${escapeHtml(resetTitle)}">
      <span>${escapeHtml(windowLabel(snapshot.windowType))}</span>
      <strong>${escapeHtml(formatRemainingText(snapshot))}</strong>
      <time datetime="${escapeHtml(snapshot.resetAt ?? "")}">${escapeHtml(reset)}</time>
    </div>
  `;
}

function prioritizeSnapshots(snapshots, primary) {
  if (!primary) {
    return snapshots;
  }

  return [
    primary,
    ...snapshots.filter(
      (snapshot) =>
        !(
          snapshot.provider === primary.provider &&
          snapshot.agent === primary.agent &&
          snapshot.windowType === primary.windowType &&
          snapshot.observedAt === primary.observedAt
        )
    )
  ];
}

function hasClaudeWaitingState(agents) {
  return agents.some(
    (agent) =>
      agent.agent === "claude-code" &&
      agent.emptyState?.reason === "waiting_for_statusline_data"
  );
}

function needsRealDataSetup(agents) {
  return agents.some((agent) => !agent.primarySnapshot);
}

function setupProgress(agents) {
  const setupAgents = sortAgents(agents).filter((agent) =>
    ["codex", "claude-code"].includes(agent.agent)
  );
  const missing = setupAgents.filter((agent) => !agent.primarySnapshot);
  const total = setupAgents.length || agents.length;
  const ready = Math.max(total - missing.length, 0);
  const missingNames = missing.map((agent) => setupAgentName(agent)).filter(Boolean);
  const missingText = missingNames.length > 0 ? missingNames.join(", ") : "real data";
  const target = missing[0] ? setupAgentTarget(missing[0]) : undefined;

  return {
    missingText,
    ready,
    target,
    title: `${ready}/${total} quota sources ready. Missing: ${missingText}.`,
    total
  };
}

function setupAgentName(agent) {
  if (agent.agent === "codex") {
    return "Codex";
  }

  if (agent.agent === "claude-code") {
    if (agent.emptyState?.reason === "waiting_for_statusline_data") {
      return "Claude data";
    }

    return "Claude";
  }

  return agent.shortName ?? agent.displayName ?? agent.agent;
}

function setupAgentTarget(agent) {
  if (agent.agent === "codex") {
    return "codex-snapshot-content";
  }

  if (agent.agent === "claude-code") {
    return "settings-content";
  }

  return "real-data-content";
}

function emptyStateGuidance(agent) {
  if (agent.emptyState?.reason === "waiting_for_statusline_data") {
    return {
      action: "settings",
      actionLabel: "Settings",
      detail: "Open Claude Code once",
      label: "waiting",
      target: "settings-content",
      title: "Claude listening"
    };
  }

  if (agent.emptyState?.reason === "adapter_error") {
    return {
      action: "doctor",
      actionLabel: "Doctor",
      detail: "Check the failing adapter",
      label: "check",
      target: "doctor-list",
      title: "Scan failed"
    };
  }

  if (agent.agent === "codex") {
    return {
      action: "settings",
      actionLabel: "Save /status",
      detail: "Paste visible quota + reset",
      label: "setup 1",
      target: "codex-snapshot-content",
      title: "Codex /status needed"
    };
  }

  if (agent.agent === "claude-code") {
    return {
      action: "settings",
      actionLabel: "Install setup",
      detail: "Add local statusline sink",
      label: "setup 2",
      target: "settings-content",
      title: "Claude statusline needed"
    };
  }

  return {
    action: "doctor",
    actionLabel: "Doctor",
    detail: agent.emptyState?.detail ?? "No quota data yet",
    label: "unavailable",
    target: "doctor-list",
    title: agent.emptyState?.title ?? "No quota data"
  };
}

function sortAgents(agents) {
  const order = new Map([
    ["codex", 0],
    ["claude-code", 1]
  ]);

  return [...agents].sort(
    (left, right) =>
      (order.get(left.agent) ?? 99) - (order.get(right.agent) ?? 99)
  );
}

function formatRemaining(snapshot) {
  if (!snapshot) {
    return "--%";
  }

  if (typeof snapshot.remainingPercent === "number") {
    return `${Math.round(snapshot.remainingPercent)}%`;
  }

  if (typeof snapshot.remaining === "number") {
    return compactNumber(snapshot.remaining);
  }

  return "--";
}

function meterValue(snapshot) {
  if (!snapshot) {
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

function resetSummary(value) {
  if (!value) {
    return "reset --";
  }

  return `${formatResetDistance(value)} / ${formatTimestamp(value)}`;
}

function snapshotDetail(snapshot) {
  const parts = [
    `${sourceLabel(snapshot.source)} / ${confidenceLabel(snapshot.confidence)}`,
    `seen ${formatRelative(snapshot.observedAt)}`
  ];

  if (snapshot.freshness?.status === "stale") {
    parts.push(snapshot.freshness.label);
  }

  return parts.join(" / ");
}

function formatRemainingText(snapshot) {
  if (!snapshot) {
    return "--";
  }

  if (typeof snapshot.remainingPercent === "number") {
    return `${Math.round(snapshot.remainingPercent)}%`;
  }

  if (typeof snapshot.remaining === "number") {
    return `${compactNumber(snapshot.remaining)} ${snapshot.unit}`;
  }

  return "--";
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
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  for (const [unit, seconds] of units) {
    if (absoluteSeconds >= seconds || unit === "second") {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }

  return date.toLocaleString();
}

function formatResetDistance(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const suffix = deltaSeconds < 0 ? "ago" : "left";

  if (absoluteSeconds >= 86400) {
    return `${Math.round(absoluteSeconds / 86400)}d ${suffix}`;
  }

  if (absoluteSeconds >= 3600) {
    return `${Math.round(absoluteSeconds / 3600)}h ${suffix}`;
  }

  if (absoluteSeconds >= 60) {
    return `${Math.round(absoluteSeconds / 60)}m ${suffix}`;
  }

  return `${absoluteSeconds}s ${suffix}`;
}

function formatTimestamp(value, options = {}) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZoneName: options.long ? "short" : undefined,
    weekday: options.long ? "short" : undefined,
    year: options.long ? "numeric" : undefined
  });

  return formatter.format(date);
}

function windowLabel(windowType) {
  const labels = {
    billing_cycle: "Billing",
    credits: "Credits",
    daily: "Daily",
    monthly: "Monthly",
    session_5h: "5h",
    weekly: "Weekly"
  };

  return labels[windowType] ?? windowType;
}

function sourceLabel(source) {
  const labels = {
    official_api: "Official API",
    official_cli: "Official CLI",
    official_statusline: "Statusline",
    local_quota_snapshot: "Local snapshot",
    local_usage_log: "Local log",
    estimated: "Estimated",
    manual: "Manual",
    demo: "Demo",
    unavailable: "Unavailable"
  };

  return labels[source] ?? source;
}

function confidenceLabel(confidence) {
  const labels = {
    estimated: "estimated",
    high: "high",
    medium: "medium",
    official: "official",
    unknown: "unknown"
  };

  return labels[confidence] ?? confidence;
}

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    notation: "compact"
  }).format(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
