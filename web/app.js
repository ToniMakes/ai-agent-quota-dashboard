const state = {
  agents: [],
  doctorChecks: [],
  pathsStatus: undefined,
  refreshRuns: [],
  resetEvents: [],
  setupStatus: undefined,
  generatedAt: undefined
};

const elements = {
  agentGrid: document.querySelector("#agent-grid"),
  doctorList: document.querySelector("#doctor-list"),
  eventList: document.querySelector("#event-list"),
  lastRefresh: document.querySelector("#last-refresh"),
  pathsContent: document.querySelector("#paths-content"),
  refreshButton: document.querySelector("#refresh-button"),
  refreshRunList: document.querySelector("#refresh-run-list"),
  resetList: document.querySelector("#reset-list"),
  settingsContent: document.querySelector("#settings-content"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view")
};

const copyResetTimers = new WeakMap();

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

document.addEventListener("click", async (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest("[data-copy-text]");

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const text = button.dataset.copyText;

  if (!text) {
    return;
  }

  const result = await copyText(text, button);
  showCopyState(button, result);
});

await load();

async function load() {
  const [
    agentsResponse,
    doctorResponse,
    eventsResponse,
    pathsResponse,
    refreshRunsResponse,
    setupResponse
  ] = await Promise.all([
    fetch("/api/agents"),
    fetch("/api/doctor"),
    fetch("/api/reset-events"),
    fetch("/api/setup/local-paths"),
    fetch("/api/refresh-runs"),
    fetch("/api/setup/claude-statusline")
  ]);
  const agentsPayload = await agentsResponse.json();
  const doctorPayload = await doctorResponse.json();
  const eventsPayload = await eventsResponse.json();
  const pathsPayload = await pathsResponse.json();
  const refreshRunsPayload = await refreshRunsResponse.json();
  const setupPayload = await setupResponse.json();

  state.agents = agentsPayload.agents ?? [];
  state.doctorChecks = doctorPayload.checks ?? [];
  state.resetEvents = eventsPayload.events ?? [];
  state.pathsStatus = pathsPayload.status;
  state.refreshRuns = refreshRunsPayload.runs ?? [];
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
  renderRefreshRuns();
  renderSettings();
  renderPathSettings();
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
        ${renderSnapshotLines(agent)}
        <div class="quota-line">
          <span class="label">Source</span>
          <span class="value">${escapeHtml(source)} / ${escapeHtml(confidence)}</span>
        </div>
        ${primary ? renderObservedLine(primary) : ""}
      </div>
    </article>
  `;
}

function renderObservedLine(snapshot) {
  return `
    <div class="quota-line">
      <span class="label">Observed</span>
      <span class="value observed-value">
        <time datetime="${escapeHtml(snapshot.observedAt)}">${escapeHtml(
          formatRelative(snapshot.observedAt)
        )}</time>
        <span class="observed-absolute">${escapeHtml(
          formatTimestamp(snapshot.observedAt)
        )}</span>
        ${renderStaleNote(snapshot)}
      </span>
    </div>
  `;
}

function renderStaleNote(snapshot) {
  if (snapshot.freshness?.status === "stale") {
    return `<span class="freshness-note">${escapeHtml(
      snapshot.freshness.label
    )}</span>`;
  }

  if (snapshot.stale) {
    return `<span class="freshness-note">marked stale by source</span>`;
  }

  if (snapshot.expiresAt && Date.parse(snapshot.expiresAt) <= Date.now()) {
    return `<span class="freshness-note">expired observation</span>`;
  }

  return "";
}

function renderSnapshotLines(agent) {
  const snapshots = agent.snapshots;

  if (!snapshots || snapshots.length === 0) {
    const emptyState = agent.emptyState;
    const action =
      emptyState?.action ?? "Open Doctor for source checks and refresh history.";

    return `
      <div class="agent-empty-state">
        <strong>${escapeHtml(emptyState?.title ?? "No quota data yet")}</strong>
        <p>${escapeHtml(
          emptyState?.detail ??
            "The latest refresh did not produce a quota snapshot for this agent."
        )}</p>
        ${renderActionHint(action)}
      </div>
    `;
  }

  return snapshots
    .map((snapshot) => {
      return `
        <div class="quota-line">
          <span class="label">${escapeHtml(windowLabel(snapshot.windowType))}</span>
          <span class="value quota-value">
            <span>${formatRemaining(snapshot)}</span>
            <span class="quota-reset">reported reset ${renderResetValue(
              snapshot.resetAt
            )}</span>
          </span>
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
          <span class="value">${renderResetValue(snapshot.resetAt)}</span>
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

  elements.doctorList.innerHTML = groupDoctorChecks(state.doctorChecks)
    .map(renderDoctorGroup)
    .join("");
}

function renderDoctorGroup(group) {
  return `
    <section class="doctor-group">
      <div class="doctor-group-header">
        <strong>${escapeHtml(group.displayName)}</strong>
        <span class="badge ${doctorBadgeClass(group.status)}">${escapeHtml(
          group.status
        )}</span>
      </div>
      <div class="doctor-group-list">
        ${group.checks.map(renderDoctorCheck).join("")}
      </div>
    </section>
  `;
}

function renderDoctorCheck(check) {
  return `
    <div class="doctor-row">
      <strong>${escapeHtml(check.label)}</strong>
      <div>
        <div>${escapeHtml(check.message)}</div>
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
  `;
}

function renderRefreshRuns() {
  if (state.refreshRuns.length === 0) {
    elements.refreshRunList.innerHTML = `<p class="empty">No refresh runs yet.</p>`;
    return;
  }

  elements.refreshRunList.innerHTML = state.refreshRuns
    .map(
      (run) => `
        <div class="refresh-run-row">
          <div>
            <strong>${escapeHtml(formatRelative(run.observedAt))}</strong>
            <div class="refresh-run-detail">${escapeHtml(formatRefreshRunDetail(run))}</div>
            ${renderRefreshRunErrors(run)}
          </div>
          <span class="badge ${
            (run.errors?.length ?? 0) > 0 ? "warning" : "healthy"
          }">${
            (run.errors?.length ?? 0) > 0 ? "warning" : "pass"
          }</span>
        </div>
      `
    )
    .join("");
}

function renderRefreshRunErrors(run) {
  if (!run.errors || run.errors.length === 0) {
    return "";
  }

  return `
    <div class="refresh-run-errors">
      ${run.errors.map((error) => `<div>${escapeHtml(error)}</div>`).join("")}
    </div>
  `;
}

function groupDoctorChecks(checks) {
  const groups = new Map();

  for (const check of checks) {
    const key = `${check.provider}:${check.agent}`;
    const agent = state.agents.find(
      (item) => item.provider === check.provider && item.agent === check.agent
    );

    if (!groups.has(key)) {
      groups.set(key, {
        displayName: agent?.displayName ?? check.agent,
        status: check.status,
        checks: []
      });
    }

    const group = groups.get(key);
    group.checks.push(check);
    group.status = mostSevereDoctorCheckStatus([group.status, check.status]);
  }

  return [...groups.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}

function mostSevereDoctorCheckStatus(statuses) {
  const severity = {
    fail: 3,
    warn: 2,
    info: 1,
    pass: 0
  };

  return statuses
    .slice()
    .sort((left, right) => severity[right] - severity[left])[0];
}

function formatRefreshRunDetail(run) {
  return [
    `${run.snapshotsSaved} snapshots`,
    `${run.usageEventsSaved} usage events`,
    `${run.doctorChecksSaved} doctor checks`,
    `${run.resetEventsSaved} reset events`,
    `${run.adapterCount} adapters`
  ].join(" / ");
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
    ${renderRealDataSteps(status)}

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
        formatLatestSnapshotStatus(status),
        status.latestHasRateLimits ? "healthy" : "stale"
      )}
      ${settingsRow(
        "Readiness",
        status.readinessLabel ?? "Unknown",
        status.nextAction ?? "Run Doctor for setup details.",
        readinessBadgeClass(status.readiness),
        status.readiness ?? "unknown"
      )}
      ${renderSetupChecks(status.checks)}
    </div>

    ${renderCommandBlock("Preview command", status.previewCommand)}
    ${renderCommandBlock("Install command", status.writeCommand)}

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

function renderRealDataSteps(status) {
  const steps = [
    {
      badge: "1",
      title: "Build CLI",
      detail: "Required before the installed statusline command can run.",
      command: "npm run build",
      state: "info"
    },
    {
      badge: "2",
      title: "Test sink",
      detail: "Uses temporary files and a fake rate_limits payload; no real Claude data is read.",
      command:
        status.selfTestCommand ??
        "node dist/index.js claude-statusline-sink --self-test",
      state: "info"
    },
    {
      badge: "3",
      title: "Install statusline",
      detail: status.statusLineManagedByApp
        ? "Claude Code is configured to call the AIQD statusline sink."
        : "Writes the managed statusline command into Claude Code settings.",
      command: status.writeCommand,
      state: status.statusLineManagedByApp ? "pass" : "warn"
    },
    {
      badge: "4",
      title: "Refresh real data",
      detail: status.readiness === "ready"
        ? "Fresh Claude Code rate limits have been received."
        : "Open Claude Code, then refresh the dashboard or run Doctor.",
      command: "node dist/index.js doctor",
      state: status.readiness === "ready" ? "pass" : "info"
    }
  ];

  return `
    <div class="setup-flow" aria-label="Claude Code real data setup">
      ${steps
        .map(
          (step) => `
            <div class="setup-step">
              <span class="step-marker">${escapeHtml(step.badge)}</span>
              <div>
                <strong>${escapeHtml(step.title)}</strong>
                <div class="settings-detail">${escapeHtml(step.detail)}</div>
                ${renderInlineCommand(step.command)}
              </div>
              <span class="badge ${doctorBadgeClass(step.state)}">${escapeHtml(
                step.state
              )}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSetupChecks(checks) {
  if (!checks || checks.length === 0) {
    return "";
  }

  return checks
    .map((check) =>
      settingsRow(
        check.label,
        check.message,
        [check.detail, check.action].filter(Boolean).join("\n"),
        doctorBadgeClass(check.status),
        check.status
      )
    )
    .join("");
}

function formatLatestSnapshotStatus(status) {
  const parts = [];

  if (status.latestObservedAt) {
    parts.push(`Last observed ${formatRelative(status.latestObservedAt)}`);
  } else {
    parts.push(status.latestPath);
  }

  if (status.latestWindowTypes?.length > 0) {
    parts.push(`Windows ${status.latestWindowTypes.map(windowLabel).join(", ")}`);
  }

  if (typeof status.latestAgeSeconds === "number") {
    parts.push(`Age ${formatDuration(status.latestAgeSeconds)}`);
  }

  return parts.join("\n");
}

function renderPathSettings() {
  const status = state.pathsStatus;

  if (!status) {
    elements.pathsContent.innerHTML = `<p class="empty">Path setup unavailable.</p>`;
    return;
  }

  const errorRows = (status.loadErrors ?? [])
    .map((error) =>
      settingsRow("Config warning", "Check file", error, "warning")
    )
    .join("");
  const agentRows = (status.agents ?? []).map(renderPathAgentRow).join("");
  const configuredPathRows = (status.agents ?? [])
    .flatMap((agent) =>
      (agent.configuredDataPaths ?? []).map((path) =>
        settingsRow(
          agent.displayName,
          path.readable ? "Readable" : path.exists ? "Not readable" : "Not found",
          path.path,
          path.readable ? "healthy" : "warning"
        )
      )
    )
    .join("");

  elements.pathsContent.innerHTML = `
    <div class="settings-list">
      ${settingsRow(
        "Config file",
        status.configExists ? "Found" : "Not found",
        status.configPath,
        status.configExists ? "healthy" : "stale"
      )}
      ${errorRows}
      ${agentRows}
    </div>
    ${renderCommandBlock("List command", status.listCommand)}
    ${
      configuredPathRows
        ? `<div class="settings-list">${configuredPathRows}</div>`
        : ""
    }
  `;
}

function renderActionHint(action) {
  const command = extractCommand(action);

  if (!command) {
    return `<p class="agent-empty-action">${escapeHtml(action)}</p>`;
  }

  const prefix = action.slice(0, action.length - command.length).trim();

  return `
    <div class="agent-empty-action">
      ${prefix ? `<span>${escapeHtml(prefix)}</span>` : ""}
      ${renderInlineCommand(command)}
    </div>
  `;
}

function renderPathAgentRow(agent) {
  const configuredCount = agent.configuredDataPaths?.length ?? 0;
  const value =
    configuredCount === 0 ? "Default paths" : `${configuredCount} configured`;

  return `
    <div class="settings-row">
      <strong>${escapeHtml(agent.displayName)}</strong>
      <div>
        <div>${escapeHtml(value)}</div>
        <div class="inline-command-list">
          ${renderInlineCommand(agent.addCommand)}
          ${renderInlineCommand(agent.removeCommand)}
        </div>
      </div>
      <span class="badge ${configuredCount === 0 ? "stale" : "healthy"}">${escapeHtml(
        value
      )}</span>
    </div>
  `;
}

function renderCommandBlock(label, command) {
  return `
    <div class="command-block">
      <div class="command-header">
        <div class="label">${escapeHtml(label)}</div>
        ${renderCopyButton(command)}
      </div>
      <code class="command-box">${escapeHtml(command)}</code>
    </div>
  `;
}

function renderInlineCommand(command) {
  return `
    <div class="inline-command">
      <code>${escapeHtml(command)}</code>
      ${renderCopyButton(command)}
    </div>
  `;
}

function renderCopyButton(text) {
  return `
    <button
      class="copy-button"
      type="button"
      data-copy-text="${escapeHtml(text)}"
      title="Copy command"
      aria-label="Copy command"
    >Copy</button>
  `;
}

function extractCommand(value) {
  return /(node dist\/index\.js .+)$/.exec(value)?.[1];
}

async function copyText(text, button) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // Fall back for local browser contexts without clipboard permission.
    }
  }

  const selected = selectCommandText(button);

  if (typeof document.execCommand === "function") {
    try {
      if (document.execCommand("copy")) {
        clearCommandSelection();
        return "copied";
      }
    } catch {
      // Leaving the visible command selected is still useful.
    }
  }

  return selected ? "selected" : "failed";
}

function selectCommandText(button) {
  const container = button.closest(".command-block, .inline-command");
  const code = container?.querySelector("code");
  const selection = window.getSelection();

  if (!code || !selection) {
    return false;
  }

  const range = document.createRange();
  range.selectNodeContents(code);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function clearCommandSelection() {
  window.getSelection()?.removeAllRanges();
}

function showCopyState(button, result) {
  const originalText = button.dataset.defaultText ?? button.textContent ?? "Copy";
  const label =
    result === "copied" ? "Copied" : result === "selected" ? "Selected" : "Copy failed";

  button.dataset.defaultText = originalText;
  button.textContent = label;
  button.classList.remove("copied", "selected", "failed");
  button.classList.add(result);

  const existingTimer = copyResetTimers.get(button);

  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  const resetTimer = window.setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove(result);
    copyResetTimers.delete(button);
  }, 1200);

  copyResetTimers.set(button, resetTimer);
}

function settingsRow(label, value, detail, badgeClass, badgeLabel = value) {
  return `
    <div class="settings-row">
      <strong>${escapeHtml(label)}</strong>
      <div>
        <div>${escapeHtml(value)}</div>
        <div class="settings-detail">${escapeHtml(detail)}</div>
      </div>
      <span class="badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
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
      ? `${formatTimestamp(event.previousResetAt)} -> ${formatTimestamp(
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

function renderResetValue(value) {
  if (!value) {
    return `<span class="reset-unavailable">No reported reset</span>`;
  }

  return `
    <span class="reset-value">
      <time datetime="${escapeHtml(value)}">${escapeHtml(formatRelative(value))}</time>
      <span class="reset-absolute">${escapeHtml(formatTimestamp(value))}</span>
    </span>
  `;
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

function formatTimestamp(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short"
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

function readinessBadgeClass(status) {
  if (status === "ready") {
    return "healthy";
  }

  if (status === "needs_attention") {
    return "warning";
  }

  if (status === "waiting_for_data") {
    return "stale";
  }

  return "warning";
}

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatDuration(seconds) {
  if (seconds >= 86400) {
    return `${Math.round(seconds / 86400)}d`;
  }

  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)}h`;
  }

  if (seconds >= 60) {
    return `${Math.round(seconds / 60)}m`;
  }

  return `${seconds}s`;
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
