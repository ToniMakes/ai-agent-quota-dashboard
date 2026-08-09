const state = {
  agents: [],
  generatedAt: undefined,
  setupStatus: undefined
};

const elements = {
  footer: document.querySelector("#mini-footer"),
  grid: document.querySelector("#mini-grid"),
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

  const button = target.closest("[data-desktop-action]");

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const action = button.dataset.desktopAction;

  if (action === "dashboard") {
    if (window.aiqdDesktop) {
      await window.aiqdDesktop.openDashboard();
    } else {
      window.location.href = "/";
    }
  }

  if (action === "widget") {
    await window.aiqdDesktop?.toggleWidget();
  }

  if (action === "hide") {
    await window.aiqdDesktop?.hideCurrentWindow();
  }
});

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
    const [agentsResponse, setupResponse] = await Promise.all([
      fetch("/api/agents"),
      fetch("/api/setup/claude-statusline")
    ]);
    const agentsPayload = await agentsResponse.json();
    const setupPayload = await setupResponse.json();

    state.agents = agentsPayload.agents ?? [];
    state.generatedAt = agentsPayload.generatedAt;
    state.setupStatus = setupPayload.status;

    if (
      allowRefresh &&
      state.setupStatus?.latestHasRateLimits &&
      hasClaudeWaitingState(state.agents)
    ) {
      await fetch("/api/refresh", { method: "POST" });
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

  elements.footer.textContent = footerText();
}

function renderAgent(agent) {
  const primary = agent.primarySnapshot;
  const status = agent.status ?? "unknown";
  const title = primary
    ? `${windowLabel(primary.windowType)} ${renderResetText(primary.resetAt)}`
    : agent.emptyState?.title ?? "No quota data";
  const detail = primary
    ? `${sourceLabel(primary.source)} / ${primary.confidence}`
    : emptyStateDetail(agent);

  return `
    <article class="mini-agent ${escapeHtml(status)}">
      <div class="mini-agent-top">
        <span class="status-dot ${escapeHtml(status)}" aria-hidden="true"></span>
        <strong>${escapeHtml(agent.shortName ?? agent.displayName)}</strong>
        <span class="mini-remaining">${formatRemaining(primary)}</span>
      </div>
      <div class="mini-meter" aria-hidden="true">
        <div class="mini-meter-fill ${escapeHtml(status)}" style="--value: ${meterValue(
          primary
        )}%"></div>
      </div>
      <div class="mini-line">${escapeHtml(title)}</div>
      <div class="mini-detail">${escapeHtml(detail)}</div>
    </article>
  `;
}

function renderError() {
  elements.grid.innerHTML = `
    <article class="mini-agent unknown">
      <div class="mini-agent-top">
        <span class="status-dot unknown" aria-hidden="true"></span>
        <strong>Offline</strong>
        <span class="mini-remaining">--</span>
      </div>
      <div class="mini-line">Local service unavailable</div>
      <div class="mini-detail">Restart the dashboard.</div>
    </article>
  `;
  elements.footer.textContent = "Waiting for local service";
}

function footerText() {
  if (hasClaudeWaitingState(state.agents)) {
    return "Watching Claude Code";
  }

  return `Updated ${formatRelative(state.generatedAt)}`;
}

function hasClaudeWaitingState(agents) {
  return agents.some(
    (agent) =>
      agent.agent === "claude-code" &&
      agent.emptyState?.reason === "waiting_for_statusline_data"
  );
}

function emptyStateDetail(agent) {
  if (agent.emptyState?.reason === "waiting_for_statusline_data") {
    return "Open Claude Code once";
  }

  if (agent.emptyState?.reason === "no_supported_source") {
    return "No supported source";
  }

  return "Unavailable";
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
  return clamp(snapshot?.remainingPercent ?? 0, 0, 100);
}

function renderResetText(value) {
  if (!value) {
    return "reset unknown";
  }

  return `resets ${formatRelative(value)}`;
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

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    notation: "compact"
  }).format(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
