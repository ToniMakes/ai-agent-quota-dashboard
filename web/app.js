const state = {
  agents: [],
  codexSnapshotSaveStatus: undefined,
  codexSnapshotStatus: undefined,
  doctorChecks: [],
  pathsStatus: undefined,
  refreshRuns: [],
  resetEvents: [],
  setupStatus: undefined,
  generatedAt: undefined
};

const elements = {
  agentGrid: document.querySelector("#agent-grid"),
  codexSnapshotContent: document.querySelector("#codex-snapshot-content"),
  doctorList: document.querySelector("#doctor-list"),
  eventList: document.querySelector("#event-list"),
  lastRefresh: document.querySelector("#last-refresh"),
  pathsContent: document.querySelector("#paths-content"),
  realDataContent: document.querySelector("#real-data-content"),
  realDataScore: document.querySelector("#real-data-score"),
  refreshButton: document.querySelector("#refresh-button"),
  refreshRunList: document.querySelector("#refresh-run-list"),
  resetList: document.querySelector("#reset-list"),
  settingsContent: document.querySelector("#settings-content"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view")
};

const copyResetTimers = new WeakMap();
const statuslineWatchIntervalMs = 10_000;
let statuslineWatchTimer;
let statuslineWatchInFlight = false;

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

  if (button instanceof HTMLButtonElement) {
    const text = button.dataset.copyText;

    if (!text) {
      return;
    }

    const result = await copyText(text, button);
    showCopyState(button, result);
    return;
  }

  const scrollButton = target.closest("[data-scroll-target]");

  if (!(scrollButton instanceof HTMLButtonElement)) {
    return;
  }

  const selector = scrollButton.dataset.scrollTarget;
  const scrollTarget = selector ? document.querySelector(selector) : undefined;

  scrollTarget?.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.addEventListener("submit", async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLFormElement) || target.id !== "codex-snapshot-form") {
    return;
  }

  event.preventDefault();
  await saveCodexSnapshotForm(target);
});

await load();

async function load() {
  const [
    agentsResponse,
    codexSnapshotResponse,
    doctorResponse,
    eventsResponse,
    pathsResponse,
    refreshRunsResponse,
    setupResponse
  ] = await Promise.all([
    fetch("/api/agents"),
    fetch("/api/setup/codex-snapshot"),
    fetch("/api/doctor"),
    fetch("/api/reset-events"),
    fetch("/api/setup/local-paths"),
    fetch("/api/refresh-runs"),
    fetch("/api/setup/claude-statusline")
  ]);
  const agentsPayload = await agentsResponse.json();
  const codexSnapshotPayload = await codexSnapshotResponse.json();
  const doctorPayload = await doctorResponse.json();
  const eventsPayload = await eventsResponse.json();
  const pathsPayload = await pathsResponse.json();
  const refreshRunsPayload = await refreshRunsResponse.json();
  const setupPayload = await setupResponse.json();

  state.agents = agentsPayload.agents ?? [];
  state.codexSnapshotStatus = codexSnapshotPayload.status;
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
  renderRealDataOverview();
  renderCodexSnapshotSettings();
  renderSettings();
  renderPathSettings();
  scheduleStatuslineWatch();
}

function scheduleStatuslineWatch() {
  if (statuslineWatchTimer) {
    window.clearTimeout(statuslineWatchTimer);
    statuslineWatchTimer = undefined;
  }

  if (!shouldWatchForClaudeStatusline()) {
    return;
  }

  statuslineWatchTimer = window.setTimeout(
    pollClaudeStatusline,
    statuslineWatchIntervalMs
  );
}

function shouldWatchForClaudeStatusline() {
  return (
    state.setupStatus?.readiness === "waiting_for_data" ||
    state.agents.some(
      (agent) => agent.emptyState?.reason === "waiting_for_statusline_data"
    )
  );
}

async function pollClaudeStatusline() {
  if (statuslineWatchInFlight) {
    return;
  }

  statuslineWatchInFlight = true;

  try {
    const setupResponse = await fetch("/api/setup/claude-statusline");
    const setupPayload = await setupResponse.json();

    state.setupStatus = setupPayload.status;

    if (state.setupStatus?.latestHasRateLimits) {
      await fetch("/api/refresh", { method: "POST" });
      await load();
      return;
    }

    render();
  } catch {
    scheduleStatuslineWatch();
  } finally {
    statuslineWatchInFlight = false;
  }
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

function renderCodexSnapshotSettings() {
  const status = state.codexSnapshotStatus;

  if (!status) {
    elements.codexSnapshotContent.innerHTML = `<p class="empty">Codex snapshot status unavailable.</p>`;
    return;
  }

  elements.codexSnapshotContent.innerHTML = `
    ${renderCodexSnapshotSteps(status)}
    ${renderCodexSnapshotForm(status)}

    <div class="settings-list">
      ${settingsRow(
        "Snapshot file",
        status.snapshotExists ? "Found" : "Not recorded",
        status.snapshotPath,
        status.snapshotExists ? "healthy" : "stale"
      )}
      ${settingsRow(
        "Latest quota",
        formatCodexSnapshotValue(status),
        formatCodexSnapshotDetail(status),
        codexSnapshotBadgeClass(status.readiness)
      )}
      ${settingsRow(
        "Readiness",
        status.readinessLabel ?? "Unknown",
        status.nextAction ?? "Record a visible Codex quota value.",
        codexSnapshotBadgeClass(status.readiness),
        status.readiness ?? "unknown"
      )}
      ${renderSetupChecks(status.checks)}
    </div>

    ${renderCommandBlock("Record command", status.writeCommand)}
    ${renderCommandBlock("Help command", status.helpCommand)}

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

function renderRealDataOverview() {
  const items = buildRealDataOverviewItems();
  const sourceItems = items.filter((item) => item.countsTowardReady);
  const readyCount = sourceItems.filter((item) => item.state === "pass").length;
  const totalCount = sourceItems.length;
  const nextItem =
    items.find((item) => item.state === "warn") ??
    items.find((item) => item.state === "info") ??
    items.find((item) => item.state === "stale");

  if (elements.realDataScore) {
    elements.realDataScore.textContent = `${readyCount}/${totalCount} ready`;
    elements.realDataScore.className = `badge ${
      readyCount === totalCount ? "healthy" : "warning"
    }`;
  }

  if (!elements.realDataContent) {
    return;
  }

  elements.realDataContent.innerHTML = `
    <div class="real-data-summary">
      <div class="setup-score">
        <strong>${readyCount}/${totalCount}</strong>
        <span>quota sources ready</span>
      </div>
      <div>
        <strong>${escapeHtml(realDataSummaryTitle(readyCount, totalCount))}</strong>
        <div class="settings-detail">${escapeHtml(
          nextItem?.nextAction ?? "Both primary quota sources have usable local data."
        )}</div>
        ${nextItem?.command ? renderInlineCommand(nextItem.command) : ""}
      </div>
    </div>
    <div class="setup-overview-list">
      ${items.map(renderRealDataOverviewItem).join("")}
    </div>
  `;
}

function buildRealDataOverviewItems() {
  return [
    buildCodexOverviewItem(),
    buildClaudeOverviewItem(),
    buildPathOverviewItem()
  ];
}

function buildCodexOverviewItem() {
  const status = state.codexSnapshotStatus;
  const ready = status?.readiness === "ready";
  const needsAttention =
    status?.readiness === "expired" || status?.readiness === "needs_attention";
  const detailParts = [];

  if (typeof status?.latestRemainingPercent === "number") {
    detailParts.push(`${Math.round(status.latestRemainingPercent)}% remaining`);
  }

  if (status?.latestResetAt) {
    detailParts.push(`reported reset ${formatRelative(status.latestResetAt)}`);
  }

  return {
    actionLabel: "Codex details",
    command: ready ? undefined : "/status",
    countsTowardReady: true,
    detail:
      detailParts.length > 0
        ? detailParts.join(" / ")
        : "Save the visible Codex /status or Usage value in the form below.",
    label: "Codex",
    nextAction: ready
      ? "Codex manual quota is ready for the dashboard."
      : needsAttention
        ? "Update the Codex manual snapshot with the currently visible quota value."
        : "Open Codex /status, then save the visible remaining percent and reset time below.",
    state: ready ? "pass" : needsAttention ? "warn" : "info",
    status: status?.readinessLabel ?? "Waiting for visible quota",
    target: "#codex-snapshot-content"
  };
}

function buildClaudeOverviewItem() {
  const status = state.setupStatus;
  const ready = status?.readiness === "ready";
  const waiting = status?.readiness === "waiting_for_data";
  const detailParts = [];

  if (status?.latestWindowTypes?.length > 0) {
    detailParts.push(`windows ${status.latestWindowTypes.map(windowLabel).join(", ")}`);
  }

  if (typeof status?.latestAgeSeconds === "number") {
    detailParts.push(`age ${formatDuration(status.latestAgeSeconds)}`);
  }

  return {
    actionLabel: "Claude details",
    command: ready || waiting ? undefined : status?.writeCommand,
    countsTowardReady: true,
    detail:
      detailParts.length > 0
        ? detailParts.join(" / ")
        : status?.nextAction ?? "Install the statusline sink, then open Claude Code once.",
    label: "Claude Code",
    nextAction:
      status?.nextAction ?? "Install the statusline sink, then open Claude Code once.",
    state: ready ? "pass" : waiting ? "info" : "warn",
    status: status?.readinessLabel ?? "Setup status unavailable",
    target: "#settings-content"
  };
}

function buildPathOverviewItem() {
  const status = state.pathsStatus;
  const hasLoadErrors = (status?.loadErrors?.length ?? 0) > 0;
  const configuredCount = (status?.agents ?? []).reduce(
    (count, agent) => count + (agent.configuredDataPaths?.length ?? 0),
    0
  );

  return {
    actionLabel: "Path details",
    command: hasLoadErrors ? status?.listCommand : undefined,
    countsTowardReady: false,
    detail: hasLoadErrors
      ? status?.loadErrors?.join("\n") ?? "Local path config has warnings."
      : configuredCount > 0
        ? `${configuredCount} configured scan root(s)`
        : "Default local scan paths are active.",
    label: "Local paths",
    nextAction: hasLoadErrors
      ? "Fix the local path config warning before relying on configured scan roots."
      : "Path checks are available if a source needs a custom scan root.",
    state: hasLoadErrors ? "warn" : "pass",
    status: hasLoadErrors ? "Check config" : "Ready",
    target: "#paths-content"
  };
}

function renderRealDataOverviewItem(item) {
  return `
    <div class="setup-overview-row">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <div>${escapeHtml(item.status)}</div>
        <div class="settings-detail">${escapeHtml(item.detail)}</div>
        ${item.command ? renderInlineCommand(item.command) : ""}
      </div>
      <div class="setup-overview-actions">
        <span class="badge ${doctorBadgeClass(item.state)}">${escapeHtml(
          item.state
        )}</span>
        <button
          class="copy-button"
          type="button"
          data-scroll-target="${escapeHtml(item.target)}"
        >${escapeHtml(item.actionLabel)}</button>
      </div>
    </div>
  `;
}

function realDataSummaryTitle(readyCount, totalCount) {
  if (readyCount === totalCount) {
    return "Primary quota sources are ready";
  }

  if (readyCount === 0) {
    return "No primary quota source is ready yet";
  }

  return "One primary quota source is ready";
}

function renderCodexSnapshotForm(status) {
  const remainingValue =
    typeof status.latestRemainingPercent === "number"
      ? status.latestRemainingPercent
      : "";
  const resetValue = status.latestResetAt
    ? toDateTimeLocalValue(status.latestResetAt)
    : "";
  const saveStatus = state.codexSnapshotSaveStatus;

  return `
    <form id="codex-snapshot-form" class="settings-form">
      <div class="settings-form-grid">
        <label class="form-field">
          <span>Remaining %</span>
          <input
            name="remainingPercent"
            type="number"
            min="0"
            max="100"
            step="0.1"
            inputmode="decimal"
            value="${escapeHtml(remainingValue)}"
            required
          >
        </label>
        <label class="form-field">
          <span>Reported reset</span>
          <input
            name="resetAt"
            type="datetime-local"
            value="${escapeHtml(resetValue)}"
            required
          >
        </label>
        <label class="form-field">
          <span>Label</span>
          <input
            name="planLabel"
            type="text"
            maxlength="80"
            value="Codex visible status"
          >
        </label>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">Save snapshot</button>
        <span
          class="form-status ${saveStatus?.kind ?? ""}"
          data-codex-snapshot-form-status
        >${escapeHtml(saveStatus?.message ?? "")}</span>
      </div>
    </form>
  `;
}

async function saveCodexSnapshotForm(form) {
  const remainingInput = formField(form, "remainingPercent");
  const resetInput = formField(form, "resetAt");
  const labelInput = formField(form, "planLabel");
  const button = form.querySelector("button[type='submit']");

  if (!remainingInput || !resetInput) {
    return;
  }

  const remainingPercent = Number(remainingInput.value);
  const resetDate = resetInput.value ? new Date(resetInput.value) : undefined;

  if (!Number.isFinite(remainingPercent)) {
    setCodexSnapshotFormStatus(
      form,
      "Remaining percent must be a number.",
      "error"
    );
    return;
  }

  if (!resetDate || Number.isNaN(resetDate.getTime())) {
    setCodexSnapshotFormStatus(form, "Reported reset must be a valid time.", "error");
    return;
  }

  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
    button.textContent = "Saving";
  }

  setCodexSnapshotFormStatus(form, "Saving snapshot", "pending");

  try {
    const response = await fetch("/api/setup/codex-snapshot", {
      body: JSON.stringify({
        planLabel: labelInput?.value.trim() || undefined,
        remainingPercent,
        resetAt: resetDate.toISOString()
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error ?? "Snapshot could not be saved.");
    }

    state.codexSnapshotSaveStatus = {
      kind: "success",
      message: "Snapshot saved and dashboard refreshed."
    };
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setCodexSnapshotFormStatus(form, message, "error");
  } finally {
    if (button instanceof HTMLButtonElement) {
      button.disabled = false;
      button.textContent = "Save snapshot";
    }
  }
}

function formField(form, name) {
  const field = form.elements.namedItem(name);

  return field instanceof HTMLInputElement ? field : undefined;
}

function setCodexSnapshotFormStatus(form, message, kind) {
  const statusElement = form.querySelector("[data-codex-snapshot-form-status]");

  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.className = `form-status ${kind}`;
}

function renderCodexSnapshotSteps(status) {
  const steps = [
    {
      badge: "1",
      title: "Check visible status",
      detail: "Use Codex CLI /status or Codex Settings > Usage.",
      command: "/status",
      state: status.latestHasQuota ? "pass" : "info"
    },
    {
      badge: "2",
      title: "Record snapshot",
      detail: status.latestHasQuota
        ? "A structured manual snapshot is available."
        : "Write only the visible quota value and reported reset time.",
      command: status.writeCommand,
      state: status.latestHasQuota ? "pass" : "warn"
    },
    {
      badge: "3",
      title: "Refresh dashboard",
      detail:
        status.readiness === "ready"
          ? "The next refresh can load the Codex snapshot."
          : "Refresh after recording a visible Codex quota value.",
      command: "node dist/index.js doctor",
      state: status.readiness === "ready" ? "pass" : "info"
    }
  ];

  return `
    <div class="setup-flow" aria-label="Codex manual snapshot setup">
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

function formatCodexSnapshotValue(status) {
  if (typeof status.latestRemainingPercent === "number") {
    return `${Math.round(status.latestRemainingPercent)}% remaining`;
  }

  if (typeof status.latestUsedPercent === "number") {
    return `${Math.round(status.latestUsedPercent)}% used`;
  }

  return status.snapshotExists ? "No usable quota" : "Not recorded";
}

function formatCodexSnapshotDetail(status) {
  if (!status.latestHasQuota) {
    return status.snapshotPath;
  }

  const parts = [];

  if (typeof status.latestUsedPercent === "number") {
    parts.push(`Used ${Math.round(status.latestUsedPercent)}%`);
  }

  if (status.latestResetAt) {
    parts.push(`Reported reset ${formatRelative(status.latestResetAt)}`);
    parts.push(formatTimestamp(status.latestResetAt));
  }

  if (status.latestObservedAt) {
    parts.push(`Observed ${formatRelative(status.latestObservedAt)}`);
  }

  if (typeof status.latestAgeSeconds === "number") {
    parts.push(`Age ${formatDuration(status.latestAgeSeconds)}`);
  }

  if (status.latestSource || status.latestConfidence) {
    parts.push(
      [sourceLabel(status.latestSource), confidenceLabel(status.latestConfidence)]
        .filter(Boolean)
        .join(" / ")
    );
  }

  return parts.filter(Boolean).join("\n");
}

function codexSnapshotBadgeClass(readiness) {
  if (readiness === "ready") {
    return "healthy";
  }

  if (readiness === "expired" || readiness === "needs_attention") {
    return "warning";
  }

  return "stale";
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

function toDateTimeLocalValue(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 16);
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
