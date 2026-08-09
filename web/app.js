const state = {
  agents: [],
  doctorChecks: [],
  resetEvents: [],
  setupStatus: undefined,
  generatedAt: undefined
};

const elements = {
  agentGrid: document.querySelector("#agent-grid"),
  doctorList: document.querySelector("#doctor-list"),
  eventList: document.querySelector("#event-list"),
  lastRefresh: document.querySelector("#last-refresh"),
  refreshButton: document.querySelector("#refresh-button"),
  resetList: document.querySelector("#reset-list"),
  settingsContent: document.querySelector("#settings-content"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view")
};

elements.refreshButton.addEventListener("click", async () => {
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "Refreshing";

  try {
    await fetch("/api/refresh", { method: "POST" });
    await load();
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = "Refresh";
  }
});

for (const tab of elements.tabs) {
  tab.addEventListener("click", () => {
    const viewName = tab.dataset.view;

    for (const item of elements.tabs) {
      item.classList.toggle("is-active", item === tab);
    }

    for (const view of elements.views) {
      view.classList.toggle("is-active", view.id === `${viewName}-view`);
    }
  });
}

await load();

async function load() {
  const [
    agentsResponse,
    doctorResponse,
    eventsResponse,
    setupResponse
  ] = await Promise.all([
    fetch("/api/agents"),
    fetch("/api/doctor"),
    fetch("/api/reset-events"),
    fetch("/api/setup/claude-statusline")
  ]);
  const agentsPayload = await agentsResponse.json();
  const doctorPayload = await doctorResponse.json();
  const eventsPayload = await eventsResponse.json();
  const setupPayload = await setupResponse.json();

  state.agents = agentsPayload.agents ?? [];
  state.doctorChecks = doctorPayload.checks ?? [];
  state.resetEvents = eventsPayload.events ?? [];
  state.setupStatus = setupPayload.status;
  state.generatedAt = agentsPayload.generatedAt;

  render();
}

function render() {
  elements.lastRefresh.textContent = `Last refresh: ${formatRelative(state.generatedAt)}`;
  renderAgents();
  renderResets();
  renderEvents();
  renderDoctor();
  renderSettings();
}

function renderAgents() {
  if (state.agents.length === 0) {
    elements.agentGrid.innerHTML = `<p class="empty">No agents configured.</p>`;
    return;
  }

  elements.agentGrid.innerHTML = state.agents.map(renderAgentCard).join("");
}

function renderAgentCard(agent) {
  const primary = agent.primarySnapshot;
  const remaining = formatRemaining(primary);
  const status = agent.status ?? "unknown";
  const source = primary ? sourceLabel(primary.source) : "Unavailable";
  const confidence = primary ? confidenceLabel(primary.confidence) : "unknown";
  const meterValue = clamp(primary?.remainingPercent ?? 0, 0, 100);

  return `
    <article class="agent-card">
      <div class="agent-card-header">
        <div>
          <h3 class="agent-name">${escapeHtml(agent.displayName)}</h3>
          <p class="agent-provider">${escapeHtml(agent.provider)}</p>
        </div>
        <span class="badge ${status}">${status}</span>
      </div>

      <div>
        <div class="remaining">${remaining}</div>
        <div class="meter" aria-hidden="true">
          <div class="meter-fill ${status}" style="--value: ${meterValue}%"></div>
        </div>
      </div>

      <div class="quota-lines">
        ${renderSnapshotLines(agent.snapshots)}
        <div class="quota-line">
          <span class="label">Source</span>
          <span class="value">${escapeHtml(source)} / ${escapeHtml(confidence)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderSnapshotLines(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    return `
      <div class="quota-line">
        <span class="label">Quota</span>
        <span class="value">No data</span>
      </div>
    `;
  }

  return snapshots
    .map((snapshot) => {
      const reset = snapshot.resetAt ? formatRelative(snapshot.resetAt) : "No reset";
      return `
        <div class="quota-line">
          <span class="label">${escapeHtml(windowLabel(snapshot.windowType))}</span>
          <span class="value">${formatRemaining(snapshot)} / ${escapeHtml(reset)}</span>
        </div>
      `;
    })
    .join("");
}

function renderResets() {
  const snapshots = state.agents
    .flatMap((agent) =>
      (agent.snapshots ?? []).map((snapshot) => ({
        agent: agent.displayName,
        snapshot
      }))
    )
    .filter((item) => item.snapshot.resetAt)
    .sort(
      (left, right) =>
        Date.parse(left.snapshot.resetAt) - Date.parse(right.snapshot.resetAt)
    );

  if (snapshots.length === 0) {
    elements.resetList.innerHTML = `<p class="empty">No reset data.</p>`;
    return;
  }

  elements.resetList.innerHTML = snapshots
    .map(
      ({ agent, snapshot }) => `
        <div class="reset-row">
          <strong>${escapeHtml(agent)}</strong>
          <span>${escapeHtml(windowLabel(snapshot.windowType))}</span>
          <span class="value">${escapeHtml(formatRelative(snapshot.resetAt))}</span>
        </div>
      `
    )
    .join("");
}

function renderDoctor() {
  if (state.doctorChecks.length === 0) {
    elements.doctorList.innerHTML = `<p class="empty">No doctor checks yet.</p>`;
    return;
  }

  elements.doctorList.innerHTML = state.doctorChecks
    .map(
      (check) => `
        <div class="doctor-row">
          <strong>${escapeHtml(check.agent)}</strong>
          <div>
            <div>${escapeHtml(check.label)}: ${escapeHtml(check.message)}</div>
            ${
              check.detail
                ? `<div class="doctor-detail">${escapeHtml(check.detail)}</div>`
                : ""
            }
          </div>
          <span class="badge ${doctorBadgeClass(check.status)}">${escapeHtml(
            check.status
          )}</span>
        </div>
      `
    )
    .join("");
}

function renderEvents() {
  if (state.resetEvents.length === 0) {
    elements.eventList.innerHTML = `<p class="empty">No reset changes observed yet.</p>`;
    return;
  }

  elements.eventList.innerHTML = state.resetEvents
    .slice(0, 5)
    .map(
      (event) => `
        <div class="event-row">
          <strong>${escapeHtml(event.agent)}</strong>
          <div>
            <div>${escapeHtml(eventTitle(event))}</div>
            <div class="event-detail">${escapeHtml(eventDetail(event))}</div>
          </div>
          <span class="value">${escapeHtml(formatRelative(event.observedAt))}</span>
        </div>
      `
    )
    .join("");
}

function renderSettings() {
  const status = state.setupStatus;

  if (!status) {
    elements.settingsContent.innerHTML = `<p class="empty">Setup status unavailable.</p>`;
    return;
  }

  elements.settingsContent.innerHTML = `
    <div class="settings-list">
      ${settingsRow(
        "Claude settings",
        status.settingsExists ? "Found" : "Not found",
        status.settingsPath,
        status.settingsExists ? "healthy" : "stale"
      )}
      ${settingsRow(
        "Statusline",
        status.statusLineConfigured
          ? status.statusLineManagedByApp
            ? "Managed by AIQD"
            : "Configured elsewhere"
          : "Not configured",
        status.statusLineCommand ?? "No statusLine command detected",
        status.statusLineManagedByApp ? "healthy" : "warning"
      )}
      ${settingsRow(
        "Snapshot",
        status.latestHasRateLimits ? "Rate limits received" : "Waiting for data",
        status.latestObservedAt
          ? `Last observed ${formatRelative(status.latestObservedAt)}`
          : status.latestPath,
        status.latestHasRateLimits ? "healthy" : "stale"
      )}
    </div>

    <div>
      <div class="label">Preview command</div>
      <code class="command-box">${escapeHtml(status.previewCommand)}</code>
    </div>
    <div>
      <div class="label">Install command</div>
      <code class="command-box">${escapeHtml(status.writeCommand)}</code>
    </div>

    <div class="settings-row">
      <strong>Stored</strong>
      <div class="pill-list">${status.savedFields
        .map((field) => `<span class="badge healthy">${escapeHtml(field)}</span>`)
        .join("")}</div>
      <span></span>
    </div>
    <div class="settings-row">
      <strong>Not stored</strong>
      <div class="pill-list">${status.notSavedFields
        .map((field) => `<span class="badge stale">${escapeHtml(field)}</span>`)
        .join("")}</div>
      <span></span>
    </div>
  `;
}

function settingsRow(label, value, detail, badgeClass) {
  return `
    <div class="settings-row">
      <strong>${escapeHtml(label)}</strong>
      <div>
        <div>${escapeHtml(value)}</div>
        <div class="settings-detail">${escapeHtml(detail)}</div>
      </div>
      <span class="badge ${badgeClass}">${escapeHtml(value)}</span>
    </div>
  `;
}

function eventTitle(event) {
  if (event.eventType === "reset_anchor_changed") {
    return `${windowLabel(event.windowType)} reset time changed`;
  }

  return `${windowLabel(event.windowType)} quota replenished`;
}

function eventDetail(event) {
  const resetChange =
    event.previousResetAt && event.newResetAt
      ? `${formatAbsolute(event.previousResetAt)} -> ${formatAbsolute(
          event.newResetAt
        )}`
      : "";
  const remainingChange =
    typeof event.previousRemainingPercent === "number" &&
    typeof event.newRemainingPercent === "number"
      ? `${Math.round(event.previousRemainingPercent)}% -> ${Math.round(
          event.newRemainingPercent
        )}%`
      : "";
  const parts = [resetChange, remainingChange, sourceLabel(event.source)].filter(
    Boolean
  );

  return parts.length > 0 ? parts.join(" / ") : event.note;
}

function formatRemaining(snapshot) {
  if (!snapshot) {
    return `--<span>%</span>`;
  }

  if (typeof snapshot.remainingPercent === "number") {
    return `${Math.round(snapshot.remainingPercent)}<span>%</span>`;
  }

  if (typeof snapshot.remaining === "number") {
    return `${compactNumber(snapshot.remaining)}<span>${escapeHtml(
      snapshot.unit
    )}</span>`;
  }

  return `--<span>${escapeHtml(snapshot.unit)}</span>`;
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

function formatAbsolute(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function windowLabel(windowType) {
  const labels = {
    session_5h: "5h window",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    billing_cycle: "Billing cycle",
    credits: "Credits"
  };

  return labels[windowType] ?? windowType;
}

function sourceLabel(source) {
  const labels = {
    official_api: "Official API",
    official_cli: "Official CLI",
    official_statusline: "Official statusline",
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
  return confidence ?? "unknown";
}

function doctorBadgeClass(status) {
  if (status === "fail") {
    return "critical";
  }

  if (status === "warn") {
    return "warning";
  }

  if (status === "info") {
    return "stale";
  }

  return "healthy";
}

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1
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
