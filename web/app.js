const languageStorageKey = "aiqd.language";

let currentLanguage = resolveInitialLanguage();

const state = {
  agents: [],
  claudeCheckFeedback: undefined,
  codexSnapshotFormDraft: undefined,
  codexSnapshotSaveStatus: undefined,
  codexSnapshotStatus: undefined,
  desktopShortcutsStatus: undefined,
  doctorChecks: [],
  pathsStatus: undefined,
  refreshRuns: [],
  refreshStatus: undefined,
  resetEvents: [],
  setupStatus: undefined,
  trialReadiness: undefined,
  generatedAt: undefined
};

const elements = {
  agentGrid: document.querySelector("#agent-grid"),
  codexSnapshotContent: document.querySelector("#codex-snapshot-content"),
  desktopShortcutsContent: document.querySelector("#desktop-shortcuts-content"),
  doctorChecklist: document.querySelector("#doctor-checklist"),
  doctorChecklistScore: document.querySelector("#doctor-checklist-score"),
  doctorList: document.querySelector("#doctor-list"),
  eventList: document.querySelector("#event-list"),
  languageToggle: document.querySelector("#language-toggle"),
  lastRefresh: document.querySelector("#last-refresh"),
  pathsContent: document.querySelector("#paths-content"),
  realDataContent: document.querySelector("#real-data-content"),
  realDataScore: document.querySelector("#real-data-score"),
  refreshButton: document.querySelector("#refresh-button"),
  refreshStatus: document.querySelector("#refresh-status"),
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

elements.languageToggle?.addEventListener("click", () => {
  currentLanguage = currentLanguage === "zh" ? "en" : "zh";
  window.localStorage?.setItem(languageStorageKey, currentLanguage);
  render();
});

elements.refreshButton.addEventListener("click", () => {
  void runRefresh(tx("Dashboard refreshed.", "仪表盘已刷新。"));
});

document.addEventListener("input", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const form = target.closest("#codex-snapshot-form");

  if (form instanceof HTMLFormElement) {
    saveCodexSnapshotDraft(form);
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const form = target.closest("#codex-snapshot-form");

  if (form instanceof HTMLFormElement) {
    saveCodexSnapshotDraft(form);
  }
});

for (const tab of elements.tabs) {
  tab.addEventListener("click", () => {
    activateView(tab.dataset.view, { updateUrl: true });
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

  const refreshActionButton = target.closest("[data-refresh-action]");

  if (refreshActionButton instanceof HTMLButtonElement) {
    await runRefresh(tx("Checklist refresh completed.", "清单刷新完成。"));
    return;
  }

  const claudeCheckActionButton = target.closest("[data-claude-check-action]");

  if (claudeCheckActionButton instanceof HTMLButtonElement) {
    await runClaudeStatuslineCheck();
    return;
  }

  const navigationButton = target.closest("[data-open-view], [data-scroll-target]");

  if (!(navigationButton instanceof HTMLButtonElement)) {
    return;
  }

  const viewName = navigationButton.dataset.openView;

  if (viewName) {
    activateView(viewName, { updateUrl: true });
  }

  const selector = navigationButton.dataset.scrollTarget;

  if (!selector) {
    return;
  }

  scrollToSelector(selector);
});

document.addEventListener("submit", async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLFormElement) || target.id !== "codex-snapshot-form") {
    return;
  }

  event.preventDefault();
  await saveCodexSnapshotForm(target);
});

activateView(requestedViewName());

await load();
scrollToRequestedTarget();

function resolveInitialLanguage() {
  const savedLanguage = window.localStorage?.getItem(languageStorageKey);

  if (savedLanguage === "zh" || savedLanguage === "en") {
    return savedLanguage;
  }

  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function locale() {
  return currentLanguage === "zh" ? "zh-CN" : "en-US";
}

function tx(english, chinese, values = {}) {
  const template = currentLanguage === "zh" ? chinese : english;

  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-Hans" : "en";
  document.title = tx("AI Agent Quota", "AI Agent Quota");

  if (elements.languageToggle) {
    elements.languageToggle.textContent = currentLanguage === "zh" ? "EN" : "中文";
  }

  for (const item of document.querySelectorAll("[data-i18n-en]")) {
    item.textContent =
      currentLanguage === "zh" ? item.dataset.i18nZh : item.dataset.i18nEn;
  }

  for (const item of document.querySelectorAll("[data-i18n-title-en]")) {
    const value =
      currentLanguage === "zh"
        ? item.dataset.i18nTitleZh
        : item.dataset.i18nTitleEn;

    if (value) {
      item.setAttribute("title", value);
    }
  }

  for (const item of document.querySelectorAll("[data-i18n-aria-label-en]")) {
    const value =
      currentLanguage === "zh"
        ? item.dataset.i18nAriaLabelZh
        : item.dataset.i18nAriaLabelEn;

    if (value) {
      item.setAttribute("aria-label", value);
    }
  }
}

function activateView(viewName, options = {}) {
  if (!viewName || !isKnownView(viewName)) {
    return;
  }

  for (const item of elements.tabs) {
    item.classList.toggle("is-active", item.dataset.view === viewName);
  }

  for (const view of elements.views) {
    view.classList.toggle("is-active", view.id === `${viewName}-view`);
  }

  if (options.updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", viewName);
    window.history.replaceState({}, "", url);
  }
}

function requestedViewName() {
  const params = new URLSearchParams(window.location.search);
  const queryView = params.get("view");

  if (queryView) {
    return queryView;
  }

  const hashView = window.location.hash.replace("#", "");

  return isKnownView(hashView) ? hashView : "dashboard";
}

function isKnownView(viewName) {
  return [...elements.tabs].some((tab) => tab.dataset.view === viewName);
}

function requestedTargetId() {
  const target = window.location.hash.replace("#", "");

  return target && !isKnownView(target) ? target : "";
}

function scrollToRequestedTarget() {
  const targetId = requestedTargetId();

  if (!targetId) {
    return;
  }

  window.requestAnimationFrame(() => {
    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

function scrollToSelector(selector) {
  window.requestAnimationFrame(() => {
    const scrollTarget = document.querySelector(selector);
    scrollTarget?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function load() {
  const [
    agentsResponse,
    codexSnapshotResponse,
    desktopShortcutsResponse,
    doctorResponse,
    eventsResponse,
    pathsResponse,
    refreshRunsResponse,
    setupResponse,
    trialReadinessResponse
  ] = await Promise.all([
    fetch("/api/agents"),
    fetch("/api/setup/codex-snapshot"),
    fetch("/api/setup/desktop-shortcuts"),
    fetch("/api/doctor"),
    fetch("/api/reset-events"),
    fetch("/api/setup/local-paths"),
    fetch("/api/refresh-runs"),
    fetch("/api/setup/claude-statusline"),
    fetch("/api/trial-readiness")
  ]);
  const agentsPayload = await agentsResponse.json();
  const codexSnapshotPayload = await codexSnapshotResponse.json();
  const desktopShortcutsPayload = await desktopShortcutsResponse.json();
  const doctorPayload = await doctorResponse.json();
  const eventsPayload = await eventsResponse.json();
  const pathsPayload = await pathsResponse.json();
  const refreshRunsPayload = await refreshRunsResponse.json();
  const setupPayload = await setupResponse.json();
  const trialReadinessPayload = await trialReadinessResponse.json();

  state.agents = agentsPayload.agents ?? [];
  state.codexSnapshotStatus = codexSnapshotPayload.status;
  state.desktopShortcutsStatus = desktopShortcutsPayload.status;
  state.doctorChecks = doctorPayload.checks ?? [];
  state.resetEvents = eventsPayload.events ?? [];
  state.pathsStatus = pathsPayload.status;
  state.refreshRuns = refreshRunsPayload.runs ?? [];
  state.setupStatus = setupPayload.status;
  state.trialReadiness = trialReadinessPayload.readiness;
  state.generatedAt = agentsPayload.generatedAt;

  render();
}

function render() {
  applyStaticTranslations();
  elements.lastRefresh.textContent = tx("Last refresh: {time}", "上次刷新：{time}", {
    time: formatRelative(state.generatedAt)
  });
  renderRefreshStatus();
  renderAgents();
  renderResets();
  renderEvents();
  renderDoctorChecklist();
  renderDoctor();
  renderRefreshRuns();
  renderRealDataOverview();
  renderCodexSnapshotSettings();
  renderSettings();
  renderPathSettings();
  renderDesktopShortcutsSettings();
  scheduleStatuslineWatch();
}

async function runRefresh(successMessage) {
  if (elements.refreshButton.disabled) {
    return undefined;
  }

  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = tx("Refreshing", "刷新中");
  state.refreshStatus = {
    kind: "pending",
    message: tx("Refreshing local quota sources.", "正在刷新本地额度数据源。")
  };
  renderRefreshStatus();

  try {
    const result = await postRefresh();
    state.refreshStatus = refreshStatusFromResult(result, successMessage);
    await load();
    return result;
  } catch (error) {
    state.refreshStatus = {
      detail: error instanceof Error ? error.message : String(error),
      kind: "error",
      message: tx("Refresh failed.", "刷新失败。")
    };
    renderRefreshStatus();
    return undefined;
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = tx("Refresh", "刷新");
  }
}

async function runClaudeStatuslineCheck() {
  state.claudeCheckFeedback = undefined;
  const result = await runRefresh(
    tx("Claude Code data check completed.", "Claude Code 数据检查完成。")
  );

  if (!result) {
    return;
  }

  if (state.setupStatus?.latestHasRateLimits) {
    state.claudeCheckFeedback = {
      kind: "success",
      message: tx(
        "Received Claude Code quota data. Continue to verify the dashboard.",
        "已收到 Claude Code 额度数据。继续验证仪表盘。"
      )
    };
    state.refreshStatus = {
      kind: "success",
      message: state.claudeCheckFeedback.message
    };
    render();
    return;
  }

  state.claudeCheckFeedback = {
    detail: state.setupStatus?.latestPath,
    kind: "warning",
    message: tx(
      "Checked, but no Claude Code statusline data was received. Open Claude Code in a CLI/terminal session, not the Claude desktop app, then try again.",
      "已检查，但还没有收到 Claude Code statusline 数据。请打开 Claude Code CLI/终端会话，不是普通 Claude 桌面应用，然后再试。"
    )
  };
  state.refreshStatus = state.claudeCheckFeedback;
  render();
}

async function postRefresh() {
  const response = await fetch("/api/refresh", { method: "POST" });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? tx("Refresh request failed.", "刷新请求失败。"));
  }

  return payload;
}

function refreshStatusFromResult(result, successMessage) {
  const errors = result.errors ?? [];
  const detail = formatRefreshStatusDetail(result);

  if (errors.length > 0) {
    return {
      detail: [detail, ...errors].filter(Boolean).join("\n"),
      kind: "warning",
      message: tx(
        "{message} {count} warning{plural}.",
        "{message} 有 {count} 条警告。",
        {
          count: errors.length,
          message: successMessage,
          plural: errors.length === 1 ? "" : "s"
        }
      )
    };
  }

  return {
    detail,
    kind: "success",
    message: successMessage
  };
}

function formatRefreshStatusDetail(result) {
  if (typeof result.snapshotsSaved !== "number") {
    return "";
  }

  return formatRefreshRunDetail(result);
}

function renderRefreshStatus() {
  if (!elements.refreshStatus) {
    return;
  }

  const status = state.refreshStatus;

  if (!status) {
    elements.refreshStatus.textContent = "";
    elements.refreshStatus.className = "refresh-status";
    elements.refreshStatus.removeAttribute("title");
    return;
  }

  elements.refreshStatus.textContent = status.message;
  elements.refreshStatus.className = `refresh-status ${status.kind}`;

  if (status.detail) {
    elements.refreshStatus.title = status.detail;
  } else {
    elements.refreshStatus.removeAttribute("title");
  }
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
      state.claudeCheckFeedback = undefined;
      await runRefresh(
        tx("Claude Code quota data received.", "已收到 Claude Code 额度数据。")
      );
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
    elements.agentGrid.innerHTML = `<p class="empty">${escapeHtml(
      tx("No agents configured.", "尚未配置 Agent。")
    )}</p>`;
    return;
  }

  elements.agentGrid.innerHTML = state.agents.map(renderAgentCard).join("");
}

function renderAgentCard(agent) {
  const primary = agent.primarySnapshot;
  const remaining = formatRemaining(primary);
  const status = agent.status ?? "unknown";
  const source = primary
    ? sourceLabel(primary.source)
    : tx("Unavailable", "不可用");
  const confidence = primary ? confidenceLabel(primary.confidence) : statusLabel("unknown");
  const meterValue = clamp(primary?.remainingPercent ?? 0, 0, 100);

  return `
    <article class="agent-card">
      <div class="agent-card-header">
        <div>
          <h3 class="agent-name">${escapeHtml(agent.displayName)}</h3>
          <p class="agent-provider">${escapeHtml(agent.provider)}</p>
        </div>
        <span class="badge ${status}">${escapeHtml(statusLabel(status))}</span>
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
          <span class="label">${escapeHtml(tx("Source", "来源"))}</span>
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
      <span class="label">${escapeHtml(tx("Observed", "观测时间"))}</span>
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
    return `<span class="freshness-note">${escapeHtml(
      tx("marked stale by source", "数据源标记为过期")
    )}</span>`;
  }

  if (snapshot.expiresAt && Date.parse(snapshot.expiresAt) <= Date.now()) {
    return `<span class="freshness-note">${escapeHtml(
      tx("expired observation", "观测值已过期")
    )}</span>`;
  }

  return "";
}

function renderSnapshotLines(agent) {
  const snapshots = agent.snapshots;

  if (!snapshots || snapshots.length === 0) {
    const emptyState = agent.emptyState;
    const action =
      emptyState?.action ??
      tx(
        "Open Doctor for source checks and refresh history.",
        "打开诊断查看数据源检查和刷新历史。"
      );
    const emptyText = agentEmptyText(agent);

    return `
      <div class="agent-empty-state">
        <strong>${escapeHtml(emptyText.title)}</strong>
        <p>${escapeHtml(emptyText.detail)}</p>
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
            <span class="quota-reset">${escapeHtml(
              tx("reported reset", "报告 reset")
            )} ${renderResetValue(snapshot.resetAt)}</span>
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
    elements.resetList.innerHTML = `<p class="empty">${escapeHtml(
      tx("No reset data.", "还没有 reset 数据。")
    )}</p>`;
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
    elements.doctorList.innerHTML = `<p class="empty">${escapeHtml(
      tx("No doctor checks yet.", "还没有诊断检查。")
    )}</p>`;
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
          statusLabel(group.status)
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
        statusLabel(check.status)
      )}</span>
    </div>
  `;
}

function renderDoctorChecklist() {
  if (!elements.doctorChecklist) {
    return;
  }

  const items = buildDoctorChecklistItems();
  const sourceItems = items.filter((item) => item.countsTowardReady);
  const readyCount = sourceItems.filter((item) => item.state === "pass").length;
  const totalCount = sourceItems.length;
  const hasSupportingIssue = items.some(
    (item) =>
      !item.countsTowardReady && (item.state === "fail" || item.state === "warn")
  );
  const nextItem =
    items.find((item) => item.state === "fail") ??
    items.find((item) => item.state === "warn") ??
    items.find((item) => item.state === "info");

  if (elements.doctorChecklistScore) {
    elements.doctorChecklistScore.textContent = tx(
      "{ready}/{total} ready",
      "{ready}/{total} 就绪",
      {
        ready: readyCount,
        total: totalCount
      }
    );
    elements.doctorChecklistScore.className = `badge ${
      readyCount === totalCount && !hasSupportingIssue ? "healthy" : "warning"
    }`;
  }

  elements.doctorChecklist.innerHTML = `
    <div class="real-data-summary doctor-checklist-summary">
      <div class="setup-score">
        <strong>${readyCount}/${totalCount}</strong>
        <span>${escapeHtml(tx("quota sources ready", "额度来源就绪"))}</span>
      </div>
      <div>
        <strong>${escapeHtml(
          doctorChecklistSummaryTitle(readyCount, totalCount, hasSupportingIssue)
        )}</strong>
        <div class="settings-detail">${escapeHtml(
          nextItem?.nextAction ??
            tx(
              "Real-data sources are ready for a local trial.",
              "真实数据来源已经可以用于本地试用。"
            )
        )}</div>
        ${nextItem?.command ? renderInlineCommand(nextItem.command) : ""}
      </div>
    </div>
    <div class="setup-overview-list doctor-checklist-list">
      ${items.map(renderDoctorChecklistItem).join("")}
    </div>
  `;
}

function buildDoctorChecklistItems() {
  return [
    buildDoctorCodexChecklistItem(),
    buildDoctorClaudeChecklistItem(),
    buildDoctorRefreshChecklistItem(),
    buildDoctorPathChecklistItem()
  ];
}

function buildDoctorCodexChecklistItem() {
  const item = buildCodexOverviewItem();

  return {
    ...item,
    actionLabel: item.state === "pass" ? tx("Review", "查看") : tx("Settings", "设置"),
    actionView: "settings",
    label: tx("Codex manual snapshot", "Codex 手动快照"),
    target: "#codex-snapshot-content"
  };
}

function buildDoctorClaudeChecklistItem() {
  const item = buildClaudeOverviewItem();

  return {
    ...item,
    actionLabel: item.state === "pass" ? tx("Review", "查看") : tx("Settings", "设置"),
    actionView: "settings",
    label: tx("Claude Code statusline", "Claude Code 状态栏"),
    target: "#settings-content"
  };
}

function buildDoctorRefreshChecklistItem() {
  const latestRun = state.refreshRuns
    .slice()
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];

  if (!latestRun) {
    return {
      actionLabel: tx("Refresh now", "立即刷新"),
      countsTowardReady: false,
      detail: tx(
        "No local refresh run has been recorded in this workspace yet.",
        "这个工作区还没有记录过本地刷新。"
      ),
      label: tx("Refresh pipeline", "刷新流程"),
      nextAction: tx(
        "Run one refresh after setting up at least one quota source.",
        "至少设置好一个额度来源后，运行一次刷新。"
      ),
      refreshAction: true,
      state: "info",
      status: tx("Not run yet", "尚未运行")
    };
  }

  const hasErrors = (latestRun.errors?.length ?? 0) > 0;

  return {
    actionLabel: hasErrors ? tx("View details", "查看详情") : tx("Refresh now", "立即刷新"),
    actionView: hasErrors ? "doctor" : undefined,
    countsTowardReady: false,
    detail: formatRefreshRunDetail(latestRun),
    label: tx("Refresh pipeline", "刷新流程"),
    nextAction: hasErrors
      ? tx(
          "Review the latest refresh errors before relying on the dashboard.",
          "先查看最近一次刷新错误，再依赖仪表盘结果。"
        )
      : tx(
          "Refresh is recording source diagnostics and saved-count summaries.",
          "刷新流程正在记录来源诊断和保存数量摘要。"
        ),
    refreshAction: !hasErrors,
    state: hasErrors ? "warn" : "pass",
    status: tx("Last run {time}", "上次运行：{time}", {
      time: formatRelative(latestRun.observedAt)
    }),
    target: hasErrors ? "#refresh-run-list" : undefined
  };
}

function buildDoctorPathChecklistItem() {
  const item = buildPathOverviewItem();

  return {
    ...item,
    actionLabel: tx("Path settings", "路径设置"),
    actionView: "settings",
    label: tx("Local path config", "本地路径配置"),
    target: "#paths-content"
  };
}

function renderDoctorChecklistItem(item) {
  return `
    <div class="setup-overview-row doctor-checklist-row">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <div>${escapeHtml(item.status)}</div>
        <div class="settings-detail">${escapeHtml(item.detail)}</div>
        ${item.command ? renderInlineCommand(item.command) : ""}
      </div>
      <div class="setup-overview-actions doctor-checklist-actions">
        <span class="badge ${doctorBadgeClass(item.state)}">${escapeHtml(
          statusLabel(item.state)
        )}</span>
        ${renderDoctorChecklistAction(item)}
      </div>
    </div>
  `;
}

function renderDoctorChecklistAction(item) {
  if (item.refreshAction) {
    return `
      <button class="copy-button" type="button" data-refresh-action="true">
        ${escapeHtml(item.actionLabel)}
      </button>
    `;
  }

  if (!item.actionView && !item.target) {
    return "";
  }

  return `
    <button
      class="copy-button"
      type="button"
      ${item.actionView ? `data-open-view="${escapeHtml(item.actionView)}"` : ""}
      ${item.target ? `data-scroll-target="${escapeHtml(item.target)}"` : ""}
    >${escapeHtml(item.actionLabel)}</button>
  `;
}

function doctorChecklistSummaryTitle(readyCount, totalCount, hasSupportingIssue) {
  if (readyCount === totalCount && hasSupportingIssue) {
    return tx(
      "Quota sources are ready; review setup warnings",
      "额度来源已就绪；请查看设置警告"
    );
  }

  if (readyCount === totalCount) {
    return tx("Ready for a real-data trial", "真实数据试用已准备好");
  }

  if (readyCount === 0) {
    return tx("Real-data setup is not ready yet", "真实数据设置尚未就绪");
  }

  return tx("One quota source is ready", "已有一个额度来源就绪");
}

function renderRefreshRuns() {
  if (state.refreshRuns.length === 0) {
    elements.refreshRunList.innerHTML = `<p class="empty">${escapeHtml(
      tx("No refresh runs yet.", "还没有刷新记录。")
    )}</p>`;
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
            (run.errors?.length ?? 0) > 0
              ? escapeHtml(statusLabel("warning"))
              : escapeHtml(statusLabel("pass"))
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
    tx("{count} snapshots", "{count} 个快照", { count: run.snapshotsSaved }),
    tx("{count} usage events", "{count} 条使用事件", {
      count: run.usageEventsSaved
    }),
    tx("{count} doctor checks", "{count} 条诊断检查", {
      count: run.doctorChecksSaved
    }),
    tx("{count} reset events", "{count} 条 reset 事件", {
      count: run.resetEventsSaved
    }),
    tx("{count} adapters", "{count} 个适配器", { count: run.adapterCount })
  ].join(" / ");
}

function renderEvents() {
  if (state.resetEvents.length === 0) {
    elements.eventList.innerHTML = `<p class="empty">${escapeHtml(
      tx("No reset changes observed yet.", "还没有观测到 reset 变化。")
    )}</p>`;
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
    elements.codexSnapshotContent.innerHTML = `<p class="empty">${escapeHtml(
      tx("Codex snapshot status unavailable.", "Codex 快照状态不可用。")
    )}</p>`;
    return;
  }

  if (shouldKeepActiveCodexSnapshotForm()) {
    return;
  }

  elements.codexSnapshotContent.innerHTML = `
    ${renderCodexSnapshotSteps(status)}
    ${renderCodexSnapshotForm(status)}

    ${renderAdvancedDetails(
      tx("Codex technical details", "Codex 技术细节"),
      `
        <div class="settings-list">
          ${settingsRow(
            tx("Snapshot file", "快照文件"),
            status.snapshotExists ? tx("Found", "已找到") : tx("Not recorded", "未记录"),
            status.snapshotPath,
            status.snapshotExists ? "healthy" : "stale"
          )}
          ${settingsRow(
            tx("Latest quota", "最新额度"),
            formatCodexSnapshotValue(status),
            formatCodexSnapshotDetail(status),
            codexSnapshotBadgeClass(status.readiness)
          )}
          ${settingsRow(
            tx("Readiness", "就绪状态"),
            localizedReadinessLabel(status.readinessLabel) ?? tx("Unknown", "未知"),
            localizedNextAction(status.nextAction) ??
              tx("Record a visible Codex quota value.", "记录一个可见的 Codex 额度值。"),
            codexSnapshotBadgeClass(status.readiness),
            statusLabel(status.readiness ?? "unknown")
          )}
          ${renderSetupChecks(status.checks)}
        </div>

        ${renderCommandBlock(tx("Record command", "记录命令"), status.writeCommand)}
        ${renderCommandBlock(tx("Help command", "帮助命令"), status.helpCommand)}

        ${renderFieldPills(
          tx("Stored", "已保存"),
          status.savedFields,
          "healthy"
        )}
        ${renderFieldPills(
          tx("Not stored", "未保存"),
          status.notSavedFields,
          "stale"
        )}
      `
    )}
  `;
}

function renderRealDataOverview() {
  const items = buildRealDataOverviewItems();
  const readiness = state.trialReadiness;
  const sourceItems = items.filter((item) => item.countsTowardReady);
  const readyCount = sourceItems.filter((item) => item.state === "pass").length;
  const totalCount = sourceItems.length;

  if (elements.realDataScore) {
    elements.realDataScore.textContent = readiness
      ? readiness.ok
        ? tx("ready", "就绪")
        : tx("not ready", "未就绪")
      : tx("{ready}/{total} ready", "{ready}/{total} 就绪", {
          ready: readyCount,
          total: totalCount
        });
    elements.realDataScore.className = `badge ${
      readiness?.ok || (!readiness && readyCount === totalCount)
        ? "healthy"
        : "warning"
    }`;
  }

  if (!elements.realDataContent) {
    return;
  }

  elements.realDataContent.innerHTML = `
    ${renderInitialSetupFlow(items, readiness)}

    ${renderAdvancedDetails(
      tx("Advanced readiness details", "高级就绪详情"),
      `
        ${readiness ? renderTrialReadinessChecks(readiness) : ""}
        <div class="setup-overview-list">
          ${items.map(renderRealDataOverviewItem).join("")}
        </div>
        ${readiness ? renderInlineCommand("npm run trial:ready") : ""}
      `
    )}
  `;
}

function renderTrialReadinessChecks(readiness) {
  const checks = readiness.checks ?? [];

  if (checks.length === 0) {
    return "";
  }

  return `
    <div class="setup-overview-list trial-readiness-list">
      ${checks.map(renderTrialReadinessCheck).join("")}
    </div>
  `;
}

function renderTrialReadinessCheck(check) {
  const text = localizedReadinessCheck(check);

  return `
    <div class="setup-overview-row trial-readiness-row">
      <div>
        <strong>${escapeHtml(readinessDisplayName(check))}</strong>
        <div>${escapeHtml(text.message)}</div>
        ${
          text.action
            ? `<div class="settings-detail">${escapeHtml(text.action)}</div>`
            : ""
        }
      </div>
      <span class="badge ${doctorBadgeClass(check.status)}">${escapeHtml(
        statusLabel(check.status)
      )}</span>
    </div>
  `;
}

function readinessDisplayName(check) {
  if (!check?.displayName || currentLanguage !== "zh") {
    return check?.displayName;
  }

  const labels = {
    Mode: "模式"
  };

  return labels[check.displayName] ?? check.displayName;
}

function renderInitialSetupFlow(items, readiness) {
  const model = buildInitialSetupModel(items, readiness);

  return `
    <div class="initial-setup-flow" aria-label="${escapeHtml(
      tx("Initial real-data setup steps", "真实数据初始配置步骤")
    )}">
      <div class="setup-flow-intro">
        <strong>${escapeHtml(
          tx("First-time setup", "首次设置")
        )}</strong>
        <p>${escapeHtml(
          tx(
            "Complete these steps once. The dashboard will show real Codex and Claude Code quota after the check passes.",
            "按下面步骤做一次。检查通过后，仪表盘会显示真实的 Codex 和 Claude Code 额度。"
          )
        )}</p>
      </div>
      ${renderSetupCurrentAction(model)}
      <div class="guided-step-list">
        ${model.steps.map(renderGuidedStep).join("")}
      </div>
    </div>
  `;
}

function buildInitialSetupModel(items, readiness) {
  const codex = items.find((item) => item.id === "codex");
  const claude = items.find((item) => item.id === "claude-code");
  const codexComplete = codex?.state === "pass";
  const claudeComplete = claude?.state === "pass";
  const claudeManaged = Boolean(state.setupStatus?.statusLineManagedByApp);
  const claudeWaiting = claudeManaged && !claudeComplete;
  const claudeCliAvailable = Boolean(state.setupStatus?.claudeCliAvailable);
  const claudeCliOpenCommand =
    state.setupStatus?.claudeCliOpenCommand ??
    "Set-Location -LiteralPath 'C:\\path\\to\\your-project'\nclaude";
  const claudeCliExampleProjectOpenCommand =
    state.setupStatus?.claudeCliExampleProjectOpenCommand ??
    claudeCliOpenCommand;
  const claudeCliInstallCommand =
    state.setupStatus?.claudeCliInstallCommand ??
    "irm https://claude.ai/install.ps1 | iex";
  const claudeCliHelper = claudeWaiting
    ? {
        commands: [
          ...(claudeCliAvailable
            ? []
            : [
                {
                  command: claudeCliInstallCommand,
                  label: tx(
                    "If not installed, run this in PowerShell",
                    "如果未安装，在 PowerShell 里运行"
                  )
                }
              ]),
          {
            command: "claude --version",
            label: tx("Check the CLI command", "检查 CLI 命令是否可用")
          },
          {
            command: claudeCliExampleProjectOpenCommand,
            label: tx("Try with this project", "用当前项目试一次")
          },
          {
            command: "claude",
            label: tx(
              "Run when terminal is already in a project",
              "终端已经在项目里时运行"
            )
          }
        ],
        detail: claudeCliAvailable
          ? tx(
              "A project folder is the folder Claude Code will work inside. Choose any code folder you are comfortable letting Claude read, then open a terminal in that folder and run claude.",
              "项目文件夹就是 Claude Code 将要工作的文件夹。选择一个你愿意让 Claude 读取的代码文件夹，在这个文件夹里打开终端，然后运行 claude。"
            )
          : tx(
              "AIQD did not find the claude command on PATH. Install Claude Code CLI first, then open a terminal in a project folder and run claude.",
              "AIQD 没有在 PATH 里找到 claude 命令。先安装 Claude Code CLI，然后在项目文件夹里打开终端并运行 claude。"
            ),
        methods: [
          {
            steps: [
              tx(
                "Open the project folder in File Explorer.",
                "在资源管理器里打开你的项目文件夹。"
              ),
              tx(
                "Click the address bar, type powershell, then press Enter.",
                "点击顶部地址栏，输入 powershell，然后按 Enter。"
              ),
              tx(
                "The terminal opens inside that folder. Type claude and press Enter.",
                "新终端会自动进入这个文件夹；输入 claude 并回车。"
              )
            ],
            title: tx(
              "Easiest: open terminal from the folder",
              "最简单：从文件夹打开终端"
            )
          },
          {
            steps: [
              tx(
                "Open PowerShell or Windows Terminal.",
                "打开 PowerShell 或 Windows Terminal。"
              ),
              tx(
                "Paste the project command below to enter a folder.",
                "粘贴下面的项目命令，进入一个项目文件夹。"
              ),
              tx(
                "When the prompt changes to that folder, run claude.",
                "看到提示符路径变成该文件夹后，运行 claude。"
              )
            ],
            title: tx(
              "Alternative: enter the folder from terminal",
              "另一种：从终端进入文件夹"
            )
          }
        ],
        title: tx(
          "How do I open Claude Code CLI?",
          "怎么打开 Claude Code CLI？"
        )
      }
    : undefined;
  const claudeWaitingNotice =
    state.claudeCheckFeedback ??
    (claudeWaiting
      ? {
          detail: state.setupStatus?.latestPath,
          kind: "warning",
          message: claudeCliAvailable
            ? tx(
                "Current check: no Claude Code statusline file has been received yet. Open a terminal in a project and run claude.",
                "当前检测结果：还没有收到 Claude Code statusline 文件。请在项目文件夹里打开终端并运行 claude。"
              )
            : tx(
                "Current check: no Claude Code statusline file has been received yet, and AIQD did not find the claude command on PATH.",
                "当前检测结果：还没有收到 Claude Code statusline 文件，并且 AIQD 没有在 PATH 里找到 claude 命令。"
              )
        }
      : undefined);
  const readinessComplete = Boolean(readiness?.ok);
  const steps = [
    {
      actionLabel: codexComplete
        ? tx("Review Codex", "查看 Codex")
        : tx("Go to Codex form", "去填写 Codex 表单"),
      actionTitle: tx(
        "Fill the Codex value you can see",
        "填写你能看见的 Codex 额度"
      ),
      checklist: [
        tx(
          "Open Codex /status or Settings > Usage.",
          "打开 Codex 的 /status 或 Settings > Usage。"
        ),
        tx(
          "Copy the remaining percent into the Codex form below.",
          "把剩余百分比填到下面的 Codex 表单。"
        ),
        tx(
          "Choose the reset date. Leave reset time blank if Codex only shows a date.",
          "选择 reset 日期；如果 Codex 只显示日期，时间留空。"
        )
      ],
      complete: codexComplete,
      detail: tx(
        "Copy the visible Codex remaining percent and reset date. Leave reset time blank if Codex only shows a date.",
        "填写 Codex 显示的剩余百分比和 reset 日期；如果 Codex 只显示日期，时间可以留空。"
      ),
      id: "codex",
      number: "1",
      outcome: tx(
        "After saving, AIQD can use this Codex value and will move you to Claude Code.",
        "保存后，AIQD 就能使用这条 Codex 额度，并带你进入 Claude Code 步骤。"
      ),
      progressDetail: codexComplete
        ? buildCodexDoneDetail(codex)
        : tx("Not filled yet.", "还没有填写。"),
      status: codexComplete
        ? tx("Done", "已完成")
        : codex?.status ?? tx("Waiting for visible quota", "等待可见额度"),
      target: "#codex-snapshot-content",
      title: tx("Codex snapshot", "Codex 快照"),
      why: tx(
        "Codex currently has no official local quota API, so AIQD needs one value you can see yourself.",
        "Codex 目前没有官方本地额度 API，所以 AIQD 需要一条你自己能看见的额度值。"
      )
    },
    {
      actionLabel: claudeComplete
        ? tx("Review Claude", "查看 Claude")
        : claudeManaged
          ? tx(
              "I opened Claude Code CLI; check now",
              "我已打开 Claude Code CLI，检查是否收到数据"
            )
          : tx("Open Claude setup", "打开 Claude 设置"),
      actionTitle: claudeManaged
        ? tx(
            "Open Claude Code CLI once",
            "打开 Claude Code CLI 一次"
          )
        : tx("Turn on Claude Code data capture", "启用 Claude Code 数据接入"),
      checklist: claudeManaged
        ? [
            tx(
              "Open PowerShell, Windows Terminal, or VS Code Terminal.",
              "打开 PowerShell、Windows Terminal 或 VS Code 终端。"
            ),
            tx(
              "Enter a project folder and run claude. This opens Claude Code CLI.",
              "进入一个项目文件夹并运行 claude，这才是打开 Claude Code CLI。"
            ),
            tx(
              "After Claude Code shows a statusline once, come back and click the check button.",
              "等 Claude Code 显示过一次 statusline 后，回到这里点击检查按钮。"
            )
          ]
        : [
            tx(
              "Open the Claude Code setup section below.",
              "打开下面的 Claude Code 设置区域。"
            ),
            tx(
              "Review the generated local command.",
              "检查生成的本地命令。"
            ),
            tx(
              "Install it only if you approve the change.",
              "确认后再安装。"
            )
          ],
      complete: claudeComplete,
      detail: claudeManaged
        ? tx(
            "Open Claude Code from a CLI/terminal session, then come back and check whether AIQD received quota data.",
            "从 CLI/终端会话打开 Claude Code，然后回到这里检查 AIQD 是否收到额度数据。"
          )
        : tx(
            "Review the generated command, then install the local statusline hook only if you approve it.",
            "先检查生成的命令；只有你确认后才安装本地 statusline hook。"
      ),
      id: "claude-code",
      helper: claudeCliHelper,
      number: "2",
      outcome: tx(
        "When data is received, this step becomes done and the next step verifies the dashboard.",
        "收到数据后，这一步会变成完成，下一步会验证仪表盘。"
      ),
      progressDetail: claudeComplete
        ? tx("Claude Code quota data received.", "已收到 Claude Code 额度数据。")
        : claudeManaged
          ? tx(
              "Waiting for Claude Code CLI statusline data.",
              "正在等待 Claude Code CLI statusline 数据。"
            )
          : tx("Setup is not enabled yet.", "尚未启用设置。"),
      claudeCheckAction: claudeWaiting,
      notice: claudeWaitingNotice,
      secondaryActionLabel:
        claudeWaiting
          ? tx("Show setup details", "查看设置细节")
          : undefined,
      secondaryTarget:
        claudeWaiting
          ? "#settings-content"
          : undefined,
      status: claudeComplete
        ? tx("Done", "已完成")
        : claude?.status ?? tx("Waiting for Claude Code data", "等待 Claude Code 数据"),
      target: "#settings-content",
      title: tx("Claude Code data", "Claude Code 数据"),
      why: tx(
        "Claude Code exposes quota through official statusline fields; AIQD saves only those rate-limit fields.",
        "Claude Code 通过官方 statusline 字段暴露额度；AIQD 只保存这些 rate-limit 字段。"
      )
    },
    {
      actionLabel: readinessComplete
        ? tx("Open dashboard", "打开仪表盘")
        : tx("Verify real data", "验证真实数据"),
      actionTitle: tx(
        "Verify the dashboard is using real data",
        "验证仪表盘正在使用真实数据"
      ),
      checklist: [
        tx(
          "Make sure Codex and Claude Code both show done.",
          "确认 Codex 和 Claude Code 都显示完成。"
        ),
        tx(
          "Run the check from this page.",
          "在这个页面运行检查。"
        ),
        tx(
          "Open Dashboard after it passes.",
          "通过后打开仪表盘。"
        )
      ],
      complete: readinessComplete,
      detail: tx(
        "Refresh once both sources are ready. This confirms the dashboard is using real, non-demo data.",
        "两项数据都就绪后刷新检查，确认仪表盘使用的是真实、非 demo 数据。"
      ),
      id: "verify",
      number: "3",
      outcome: tx(
        "After it passes, the dashboard can show real remaining quota and reset dates.",
        "通过后，仪表盘会显示真实剩余额度和 reset 日期。"
      ),
      progressDetail: readinessComplete
        ? tx("Real-data check passed.", "真实数据检查已通过。")
        : codexComplete && claudeComplete
          ? tx("Ready to run the final check.", "可以运行最后检查。")
          : tx("Locked until Codex and Claude Code are done.", "等 Codex 和 Claude Code 完成后再进行。"),
      refreshAction: !readinessComplete,
      status: readinessComplete
        ? tx("Ready for trial", "可以开始试用")
        : codexComplete && claudeComplete
          ? tx("Ready to verify", "可以验证")
          : tx("Finish steps 1 and 2 first", "先完成第 1 和第 2 步"),
      target: "#real-data-content",
      title: tx("Verify dashboard", "验证仪表盘"),
      why: tx(
        "The final check prevents stale or demo data from looking trustworthy.",
        "最后检查可以避免过期数据或 demo 数据看起来像可信真实额度。"
      )
    }
  ];
  const currentStep = steps.find((step) => !step.complete) ?? steps[steps.length - 1];

  for (const step of steps) {
    step.current = step === currentStep && !step.complete;
    step.state = step.complete ? "pass" : step.current ? "warn" : "info";
  }

  const completedCount = steps.filter((step) => step.complete).length;

  return {
    completedCount,
    currentStep,
    remainingCount: steps.length - completedCount,
    steps,
    totalCount: steps.length
  };
}

function buildCodexDoneDetail(codex) {
  return codex?.detail ?? tx("Codex value is saved.", "Codex 额度已保存。");
}

function renderSetupCurrentAction(model) {
  const step = model.currentStep;
  const allDone = model.completedCount === model.totalCount;
  const remainingLabel = allDone
    ? tx("All steps done", "全部完成")
    : tx("{count} step(s) left", "还剩 {count} 步", {
        count: model.remainingCount
      });

  return `
    <section class="current-step-panel ${allDone ? "complete" : ""}">
      <div class="current-step-copy">
        <span class="guide-kicker">${escapeHtml(
          allDone
            ? tx("Ready", "已就绪")
            : tx("Current step {number}/{total}", "当前步骤 {number}/{total}", {
                number: step.number,
                total: model.totalCount
              })
        )}</span>
        <strong>${escapeHtml(
          allDone
            ? tx("Real-data dashboard is ready", "真实数据仪表盘已就绪")
            : step.actionTitle
        )}</strong>
        ${
          allDone
            ? `<p>${escapeHtml(
                tx(
                  "Open the dashboard and refresh before making decisions from the numbers.",
                  "打开仪表盘，并在根据数字做判断前刷新一次。"
                )
              )}</p>`
            : renderActionChecklist(step.checklist)
        }
        ${allDone ? "" : renderStepHelper(step.helper)}
        ${allDone ? "" : renderStepNotice(step.notice)}
        <p class="outcome-note">${escapeHtml(
          allDone
            ? tx(
                "Result: you can now read real quota and reset dates.",
                "结果：现在可以查看真实额度和 reset 日期。"
              )
            : tx("Result: {result}", "结果：{result}", {
                result: step.outcome
              })
        )}</p>
      </div>
      <div class="current-step-actions">
        <span>${escapeHtml(
          tx("Progress: {done}/{total} done, {left}", "进度：已完成 {done}/{total}，{left}", {
            done: model.completedCount,
            left: remainingLabel,
            total: model.totalCount
          })
        )}</span>
        ${renderGuidedStepAction(step, allDone)}
        ${renderGuidedSecondaryAction(step)}
      </div>
    </section>
  `;
}

function renderStepHelper(helper) {
  if (!helper) {
    return "";
  }

  return `
    <div class="step-helper">
      <strong>${escapeHtml(helper.title)}</strong>
      <p>${escapeHtml(helper.detail)}</p>
      ${renderStepHelperMethods(helper.methods)}
      <div class="step-helper-commands">
        ${helper.commands
          .map(
            (item) => `
              <div class="step-helper-command">
                <span>${escapeHtml(item.label)}</span>
                <code>${escapeHtml(item.command)}</code>
                ${renderCopyButton(item.command)}
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderStepHelperMethods(methods = []) {
  if (!methods.length) {
    return "";
  }

  return `
    <div class="step-helper-methods">
      ${methods
        .map(
          (method) => `
            <article class="step-helper-method">
              <strong>${escapeHtml(method.title)}</strong>
              <ol>
                ${method.steps
                  .map((step) => `<li>${escapeHtml(step)}</li>`)
                  .join("")}
              </ol>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStepNotice(notice) {
  if (!notice?.message) {
    return "";
  }

  return `
    <p class="step-notice ${escapeHtml(notice.kind ?? "info")}" ${
      notice.detail ? `title="${escapeHtml(notice.detail)}"` : ""
    }>${escapeHtml(notice.message)}</p>
  `;
}

function renderActionChecklist(items = []) {
  if (!items.length) {
    return "";
  }

  return `
    <div class="action-checklist">
      ${items
        .map(
          (item, index) => `
            <div class="action-step">
              <span>${escapeHtml(String(index + 1))}</span>
              <p>${escapeHtml(item)}</p>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderGuidedStep(step) {
  return `
    <article class="guided-step ${step.current ? "is-current" : ""} ${
      step.complete ? "is-complete" : ""
    }">
      <div class="guided-step-marker">
        <span class="step-marker">${escapeHtml(step.number)}</span>
      </div>
      <div>
        <strong>${escapeHtml(step.title)}</strong>
        <p>${escapeHtml(step.progressDetail ?? step.detail)}</p>
      </div>
      <div class="guided-step-state">
        <span class="badge ${doctorBadgeClass(step.state)}">${escapeHtml(
          step.complete
            ? tx("Done", "完成")
            : step.current
              ? tx("Now", "当前")
              : tx("Later", "稍后")
        )}</span>
        <span>${escapeHtml(step.status)}</span>
      </div>
    </article>
  `;
}

function renderGuidedStepAction(step, allDone = false, className = "button") {
  if (allDone) {
    return `
      <button class="${className}" type="button" data-open-view="dashboard">
        ${escapeHtml(tx("Open dashboard", "打开仪表盘"))}
      </button>
    `;
  }

  return `
    <button
      class="${className}"
      type="button"
      ${step.claudeCheckAction ? "data-claude-check-action" : ""}
      ${step.refreshAction ? "data-refresh-action" : ""}
      ${step.target ? `data-scroll-target="${escapeHtml(step.target)}"` : ""}
    >${escapeHtml(step.actionLabel)}</button>
  `;
}

function renderGuidedSecondaryAction(step) {
  if (!step.secondaryActionLabel || !step.secondaryTarget) {
    return "";
  }

  return `
    <button
      class="copy-button"
      type="button"
      data-scroll-target="${escapeHtml(step.secondaryTarget)}"
    >${escapeHtml(step.secondaryActionLabel)}</button>
  `;
}

function localizedReadinessCheck(check) {
  if (currentLanguage !== "zh") {
    return {
      action: check.action,
      message: check.message
    };
  }

  if (check.agent === "codex" && check.status === "fail") {
    return {
      action: "打开 Codex 的 /status 或 Settings > Usage，把可见剩余百分比和 reset 时间保存到 Codex 手动快照。",
      message: "Codex 还没有可用于试用的真实额度快照。"
    };
  }

  if (check.agent === "claude-code" && check.status === "fail") {
    return {
      action: "安装本地 statusline sink 后，从 CLI/终端项目会话打开 Claude Code；普通 Claude 桌面应用不会发送这些字段。",
      message: "Claude Code 还没有收到真实额度数据。"
    };
  }

  if (check.agent === "doctor" && check.status === "fail") {
    return {
      action: "打开诊断页查看失败项，然后重新刷新。",
      message: "本地诊断还有失败项。"
    };
  }

  return {
    action: check.action,
    message: check.message
  };
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
    detailParts.push(
      tx("{percent}% remaining", "剩余 {percent}%", {
        percent: Math.round(status.latestRemainingPercent)
      })
    );
  }

  if (status?.latestResetAt) {
    detailParts.push(
      tx("reported reset {time}", "报告 reset：{time}", {
        time: formatRelative(status.latestResetAt)
      })
    );
  }

  return {
    actionLabel: tx("Codex details", "Codex 详情"),
    command: ready ? undefined : "/status",
    countsTowardReady: true,
    detail:
      detailParts.length > 0
        ? detailParts.join(" / ")
        : tx(
            "Save the visible Codex /status or Usage value in the form below.",
            "把 Codex /status 或 Usage 页面可见的额度值保存到下方表单。"
          ),
    id: "codex",
    label: "Codex",
    nextAction: ready
      ? tx(
          "Codex manual quota is ready for the dashboard.",
          "Codex 手动额度已经可用于仪表盘。"
        )
      : needsAttention
        ? tx(
            "Update the Codex manual snapshot with the currently visible quota value.",
            "用当前可见的额度值更新 Codex 手动快照。"
          )
        : tx(
            "Open Codex /status, then save the visible remaining percent and reset time below.",
            "打开 Codex /status，然后把可见的剩余百分比和 reset 时间保存到下方。"
          ),
    state: ready ? "pass" : needsAttention ? "warn" : "info",
    status: localizedReadinessLabel(status?.readinessLabel) ??
      tx("Waiting for visible quota", "等待可见额度"),
    target: "#codex-snapshot-content"
  };
}

function buildClaudeOverviewItem() {
  const status = state.setupStatus;
  const ready = status?.readiness === "ready";
  const waiting = status?.readiness === "waiting_for_data";
  const detailParts = [];

  if (status?.latestWindowTypes?.length > 0) {
    detailParts.push(
      tx("windows {windows}", "窗口：{windows}", {
        windows: status.latestWindowTypes.map(windowLabel).join(", ")
      })
    );
  }

  if (typeof status?.latestAgeSeconds === "number") {
    detailParts.push(
      tx("age {age}", "数据年龄：{age}", {
        age: formatDuration(status.latestAgeSeconds)
      })
    );
  }

  return {
    actionLabel: tx("Claude details", "Claude 详情"),
    command: ready || waiting ? undefined : status?.writeCommand,
    countsTowardReady: true,
    detail:
      detailParts.length > 0
        ? detailParts.join(" / ")
        : localizedNextAction(status?.nextAction) ??
          tx(
            "Install the statusline sink, then open Claude Code from a CLI/terminal session.",
            "安装 statusline sink，然后从 CLI/终端会话打开 Claude Code。"
          ),
    id: "claude-code",
    label: "Claude Code",
    nextAction:
      localizedNextAction(status?.nextAction) ??
      tx(
        "Install the statusline sink, then open Claude Code from a CLI/terminal session.",
        "安装 statusline sink，然后从 CLI/终端会话打开 Claude Code。"
      ),
    state: ready ? "pass" : waiting ? "info" : "warn",
    status:
      localizedReadinessLabel(status?.readinessLabel) ??
      tx("Setup status unavailable", "设置状态不可用"),
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
    actionLabel: tx("Path details", "路径详情"),
    command: hasLoadErrors ? status?.listCommand : undefined,
    countsTowardReady: false,
    detail: hasLoadErrors
      ? status?.loadErrors?.join("\n") ??
        tx("Local path config has warnings.", "本地路径配置有警告。")
      : configuredCount > 0
        ? tx("{count} configured scan root(s)", "已配置 {count} 个扫描根目录", {
            count: configuredCount
          })
        : tx("Default local scan paths are active.", "默认本地扫描路径已启用。"),
    id: "local-paths",
    label: tx("Local paths", "本地路径"),
    nextAction: hasLoadErrors
      ? tx(
          "Fix the local path config warning before relying on configured scan roots.",
          "先修复本地路径配置警告，再依赖自定义扫描根目录。"
        )
      : tx(
          "Path checks are available if a source needs a custom scan root.",
          "如果某个来源需要自定义扫描根目录，可以在这里检查路径。"
        ),
    state: hasLoadErrors ? "warn" : "pass",
    status: hasLoadErrors ? tx("Check config", "检查配置") : tx("Ready", "就绪"),
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
          statusLabel(item.state)
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
    return tx("Primary quota sources are ready", "主要额度来源已就绪");
  }

  if (readyCount === 0) {
    return tx(
      "No primary quota source is ready yet",
      "还没有主要额度来源就绪"
    );
  }

  return tx("One primary quota source is ready", "已有一个主要额度来源就绪");
}

function renderCodexSnapshotForm(status) {
  const draft = state.codexSnapshotFormDraft;
  const remainingValue =
    draft?.remainingPercent ??
    (typeof status.latestRemainingPercent === "number"
      ? status.latestRemainingPercent
      : "");
  const resetDateValue =
    draft?.resetDate ??
    (status.latestResetAt ? toDateLocalValue(status.latestResetAt) : "");
  const resetTimeValue =
    draft?.resetTime ??
    (status.latestResetAt ? toTimeLocalValue(status.latestResetAt) : "");
  const planLabelValue =
    draft?.planLabel ?? tx("Codex visible status", "Codex 可见状态");
  const saveStatus = state.codexSnapshotSaveStatus;

  return `
    <form id="codex-snapshot-form" class="settings-form">
      <div class="settings-form-grid codex-snapshot-grid">
        <label class="form-field">
          <span>${escapeHtml(tx("Remaining %", "剩余百分比"))}</span>
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
          <span>${escapeHtml(tx("Reset date", "Reset 日期"))}</span>
          <input
            name="resetDate"
            type="date"
            value="${escapeHtml(resetDateValue)}"
            required
          >
        </label>
        <label class="form-field">
          <span>${escapeHtml(tx("Reset time", "Reset 时间"))}</span>
          <input
            name="resetTime"
            type="time"
            step="60"
            value="${escapeHtml(resetTimeValue)}"
          >
          <span class="form-hint">${escapeHtml(
            tx("Optional if Codex only shows a date.", "如果 Codex 只显示日期，这里可以留空。")
          )}</span>
        </label>
        <label class="form-field">
          <span>${escapeHtml(tx("Label", "标签"))}</span>
          <input
            name="planLabel"
            type="text"
            maxlength="80"
            value="${escapeHtml(planLabelValue)}"
          >
        </label>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">${escapeHtml(
          tx("Save snapshot", "保存快照")
        )}</button>
        <span
          class="form-status ${saveStatus?.kind ?? ""}"
          data-codex-snapshot-form-status
        >${escapeHtml(saveStatus?.message ?? "")}</span>
      </div>
      ${renderCodexSnapshotPostSaveActions(saveStatus)}
    </form>
  `;
}

function shouldKeepActiveCodexSnapshotForm() {
  const form = elements.codexSnapshotContent?.querySelector(
    "#codex-snapshot-form"
  );

  return Boolean(
    form &&
      state.codexSnapshotFormDraft?.dirty &&
      form.contains(document.activeElement) &&
      state.codexSnapshotSaveStatus?.kind !== "success"
  );
}

function renderCodexSnapshotPostSaveActions(saveStatus) {
  if (saveStatus?.kind !== "success") {
    return "";
  }

  const model = buildInitialSetupModel(
    buildRealDataOverviewItems(),
    state.trialReadiness
  );
  const step = model.currentStep;
  const allDone = model.completedCount === model.totalCount;

  return `
    <section class="next-step-card" aria-label="${escapeHtml(
      tx("Next setup step", "下一步设置")
    )}">
      <div>
        <span class="guide-kicker">${escapeHtml(
          allDone
            ? tx("Setup complete", "设置完成")
            : tx("Next step {number}/{total}", "下一步 {number}/{total}", {
                number: step.number,
                total: model.totalCount
              })
        )}</span>
        <strong>${escapeHtml(
          allDone
            ? tx("Open the real-data dashboard", "打开真实数据仪表盘")
            : step.actionTitle
        )}</strong>
        ${
          allDone
            ? `<p>${escapeHtml(
                tx(
                  "Both quota sources are ready. Open the dashboard and refresh before relying on the numbers.",
                  "两个额度来源都已就绪。打开仪表盘，并在依赖数字前刷新一次。"
                )
              )}</p>`
            : renderActionChecklist(step.checklist)
        }
        <p class="why-note">${escapeHtml(
          allDone
            ? tx(
                "Why: this is the point where AIQD can show real local quota data.",
                "为什么：到这一步 AIQD 才能显示真实本地额度数据。"
              )
            : tx("Why: {why}", "为什么：{why}", { why: step.why })
        )}</p>
      </div>
      <div class="next-step-actions">
        ${renderGuidedStepAction(step, allDone)}
        ${renderGuidedSecondaryAction(step)}
      </div>
    </section>
  `;
}

async function saveCodexSnapshotForm(form) {
  const remainingInput = formField(form, "remainingPercent");
  const resetDateInput = formField(form, "resetDate");
  const resetTimeInput = formField(form, "resetTime");
  const labelInput = formField(form, "planLabel");
  const button = form.querySelector("button[type='submit']");

  if (!remainingInput || !resetDateInput) {
    return;
  }

  const remainingPercent = Number(remainingInput.value);
  const resetDate = buildResetDateFromForm(
    resetDateInput.value,
    resetTimeInput?.value ?? ""
  );

  if (!Number.isFinite(remainingPercent)) {
    setCodexSnapshotFormStatus(
      form,
      tx("Remaining percent must be a number.", "剩余百分比必须是数字。"),
      "error"
    );
    return;
  }

  if (!resetDate || Number.isNaN(resetDate.getTime())) {
    setCodexSnapshotFormStatus(
      form,
      tx("Reset date must be valid.", "Reset 日期必须有效。"),
      "error"
    );
    return;
  }

  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
    button.textContent = tx("Saving", "保存中");
  }

  setCodexSnapshotFormStatus(form, tx("Saving snapshot", "正在保存快照"), "pending");

  try {
    const response = await fetch("/api/setup/codex-snapshot", {
      body: JSON.stringify({
        planLabel: labelInput?.value.trim() || undefined,
        remainingPercent,
        resetDate: resetDateInput.value,
        resetTime: resetTimeInput?.value || undefined
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.error ?? tx("Snapshot could not be saved.", "快照无法保存。")
      );
    }

    state.codexSnapshotSaveStatus = {
      kind: "success",
      message: codexSnapshotSaveMessage(payload.refreshResult)
    };
    state.codexSnapshotFormDraft = undefined;
    state.refreshStatus = refreshStatusFromResult(
      payload.refreshResult ?? {},
      tx(
        "Codex snapshot saved and dashboard refreshed.",
        "Codex 快照已保存，仪表盘已刷新。"
      )
    );
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setCodexSnapshotFormStatus(form, message, "error");
  } finally {
    if (button instanceof HTMLButtonElement) {
      button.disabled = false;
      button.textContent = tx("Save snapshot", "保存快照");
    }
  }
}

function saveCodexSnapshotDraft(form) {
  state.codexSnapshotFormDraft = {
    dirty: true,
    planLabel: formField(form, "planLabel")?.value ?? "",
    remainingPercent: formField(form, "remainingPercent")?.value ?? "",
    resetDate: formField(form, "resetDate")?.value ?? "",
    resetTime: formField(form, "resetTime")?.value ?? ""
  };
}

function buildResetDateFromForm(resetDateValue, resetTimeValue) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(resetDateValue);

  if (!dateMatch) {
    return undefined;
  }

  const [, yearText, monthText, dayText] = dateMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  let hour = 23;
  let minute = 59;
  let second = 59;
  let millisecond = 999;

  if (resetTimeValue) {
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(resetTimeValue);

    if (!timeMatch) {
      return undefined;
    }

    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
    second = 0;
    millisecond = 0;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return undefined;
  }

  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return undefined;
  }

  return date;
}

function codexSnapshotSaveMessage(refreshResult) {
  if ((refreshResult?.errors?.length ?? 0) > 0) {
    return tx(
      "Snapshot saved; refresh completed with warnings.",
      "快照已保存；刷新完成但有警告。"
    );
  }

  return tx(
    "Snapshot saved; dashboard is ready to check.",
    "快照已保存；现在可以检查仪表盘。"
  );
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
      title: tx("Check visible status", "查看可见状态"),
      detail: tx(
        "Use Codex CLI /status or Codex Settings > Usage.",
        "使用 Codex CLI 的 /status，或打开 Codex Settings > Usage。"
      ),
      command: "/status",
      state: status.latestHasQuota ? "pass" : "info"
    },
    {
      badge: "2",
      title: tx("Record snapshot", "记录快照"),
      detail: status.latestHasQuota
        ? tx(
            "A structured manual snapshot is available.",
            "已经有结构化的手动快照。"
          )
        : tx(
            "Write only the visible quota value and reported reset time.",
            "只写入可见的额度值和报告的 reset 时间。"
          ),
      command: status.writeCommand,
      state: status.latestHasQuota ? "pass" : "warn"
    },
    {
      badge: "3",
      title: tx("Refresh dashboard", "刷新仪表盘"),
      detail:
        status.readiness === "ready"
          ? tx(
              "The next refresh can load the Codex snapshot.",
              "下一次刷新可以读取 Codex 快照。"
            )
          : tx(
              "Refresh after recording a visible Codex quota value.",
              "记录可见 Codex 额度值之后再刷新。"
            ),
      command: "node dist/index.js doctor",
      state: status.readiness === "ready" ? "pass" : "info"
    }
  ];

  return `
    <div class="setup-flow" aria-label="${escapeHtml(
      tx("Codex manual snapshot setup", "Codex 手动快照设置")
    )}">
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
                statusLabel(step.state)
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
    return tx("{percent}% remaining", "剩余 {percent}%", {
      percent: Math.round(status.latestRemainingPercent)
    });
  }

  if (typeof status.latestUsedPercent === "number") {
    return tx("{percent}% used", "已用 {percent}%", {
      percent: Math.round(status.latestUsedPercent)
    });
  }

  return status.snapshotExists
    ? tx("No usable quota", "没有可用额度")
    : tx("Not recorded", "未记录");
}

function formatCodexSnapshotDetail(status) {
  if (!status.latestHasQuota) {
    return status.snapshotPath;
  }

  const parts = [];

  if (typeof status.latestUsedPercent === "number") {
    parts.push(
      tx("Used {percent}%", "已用 {percent}%", {
        percent: Math.round(status.latestUsedPercent)
      })
    );
  }

  if (status.latestResetAt) {
    parts.push(
      tx("Reported reset {time}", "报告 reset：{time}", {
        time: formatRelative(status.latestResetAt)
      })
    );
    parts.push(formatTimestamp(status.latestResetAt));
  }

  if (status.latestObservedAt) {
    parts.push(
      tx("Observed {time}", "观测于 {time}", {
        time: formatRelative(status.latestObservedAt)
      })
    );
  }

  if (typeof status.latestAgeSeconds === "number") {
    parts.push(
      tx("Age {age}", "数据年龄 {age}", {
        age: formatDuration(status.latestAgeSeconds)
      })
    );
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
    elements.settingsContent.innerHTML = `<p class="empty">${escapeHtml(
      tx("Setup status unavailable.", "设置状态不可用。")
    )}</p>`;
    return;
  }

  elements.settingsContent.innerHTML = `
    ${renderRealDataSteps(status)}
    ${renderClaudeStatuslineWaitingNotice(status)}

    ${renderAdvancedDetails(
      tx("Claude Code technical details", "Claude Code 技术细节"),
      `
        <div class="settings-list">
          ${settingsRow(
            tx("Claude Code CLI", "Claude Code CLI"),
            status.claudeCliAvailable ? tx("Found", "已找到") : tx("Not found", "未找到"),
            status.claudeCliAvailable
              ? status.claudeCliPath ?? status.claudeCliCommand ?? "claude"
              : tx("Install command: {command}", "安装命令：{command}", {
                  command: status.claudeCliInstallCommand
                }),
            status.claudeCliAvailable ? "healthy" : "warning"
          )}
          ${settingsRow(
            tx("Claude settings", "Claude 设置"),
            status.settingsExists ? tx("Found", "已找到") : tx("Not found", "未找到"),
            status.settingsPath,
            status.settingsExists ? "healthy" : "stale"
          )}
          ${settingsRow(
            tx("Statusline", "状态栏"),
            status.statusLineConfigured
              ? status.statusLineManagedByApp
                ? tx("Managed by AIQD", "由 AIQD 管理")
                : tx("Configured elsewhere", "由其他配置管理")
              : tx("Not configured", "未配置"),
            status.statusLineCommand ??
              tx("No statusLine command detected", "没有检测到 statusLine 命令"),
            status.statusLineManagedByApp ? "healthy" : "warning"
          )}
          ${settingsRow(
            tx("Snapshot", "快照"),
            status.latestHasRateLimits
              ? tx("Rate limits received", "已收到 rate_limits")
              : tx("Waiting for data", "等待数据"),
            formatLatestSnapshotStatus(status),
            status.latestHasRateLimits ? "healthy" : "stale"
          )}
          ${settingsRow(
            tx("Readiness", "就绪状态"),
            localizedReadinessLabel(status.readinessLabel) ?? tx("Unknown", "未知"),
            localizedNextAction(status.nextAction) ??
              tx("Run Doctor for setup details.", "运行诊断查看设置详情。"),
            readinessBadgeClass(status.readiness),
            statusLabel(status.readiness ?? "unknown")
          )}
          ${renderSetupChecks(status.checks)}
        </div>

        ${renderCommandBlock(tx("Preview command", "预览命令"), status.previewCommand)}
        ${renderCommandBlock(tx("Install command", "安装命令"), status.writeCommand)}

        ${renderFieldPills(tx("Stored", "已保存"), status.savedFields, "healthy")}
        ${renderFieldPills(tx("Not stored", "未保存"), status.notSavedFields, "stale")}
      `
    )}
  `;
}

function renderClaudeStatuslineWaitingNotice(status) {
  if (status.readiness !== "waiting_for_data") {
    return "";
  }

  return `
    <div class="setup-watch-notice">
      <div>
        <strong>${escapeHtml(
          tx(
            "Waiting for first Claude Code CLI quota payload",
            "等待第一份 Claude Code CLI 额度数据"
          )
        )}</strong>
        <div class="settings-detail">
          ${escapeHtml(
            tx(
              "Keep this dashboard open, then open Claude Code from a CLI/terminal session. The Claude desktop app does not send these statusline fields.",
              "保持仪表盘打开，然后从 CLI/终端会话打开 Claude Code。普通 Claude 桌面应用不会发送这些 statusline 字段。"
            )
          )}
        </div>
      </div>
      <span class="badge stale">${escapeHtml(tx("watching", "监听中"))}</span>
    </div>
  `;
}

function renderRealDataSteps(status) {
  const steps = [
    {
      badge: "1",
      title: tx("Build CLI", "构建 CLI"),
      detail: tx(
        "Required before the installed statusline command can run.",
        "安装后的 statusline 命令需要先完成构建。"
      ),
      command: "npm run build",
      state: "info"
    },
    {
      badge: "2",
      title: tx("Test sink", "测试接收器"),
      detail: tx(
        "Uses temporary files and a fake rate_limits payload; no real Claude data is read.",
        "只使用临时文件和假的 rate_limits 数据；不会读取真实 Claude 数据。"
      ),
      command:
        status.selfTestCommand ??
        "node dist/index.js claude-statusline-sink --self-test",
      state: "info"
    },
    {
      badge: "3",
      title: tx("Install statusline", "安装状态栏"),
      detail: status.statusLineManagedByApp
        ? tx(
            "Claude Code is configured to call the AIQD statusline sink.",
            "Claude Code 已配置为调用 AIQD statusline sink。"
          )
        : tx(
            "Writes the managed statusline command into Claude Code settings.",
            "把托管的 statusline 命令写入 Claude Code 设置。"
          ),
      command: status.writeCommand,
      state: status.statusLineManagedByApp ? "pass" : "warn"
    },
    {
      badge: "4",
      title: tx("Refresh real data", "刷新真实数据"),
      detail: status.readiness === "ready"
        ? tx(
            "Fresh Claude Code rate limits have been received.",
            "已经收到新鲜的 Claude Code rate limits。"
          )
        : tx(
            "Open Claude Code from a CLI/terminal session, then refresh the dashboard or run Doctor.",
            "从 CLI/终端会话打开 Claude Code，然后刷新仪表盘或运行诊断。"
          ),
      command: "node dist/index.js doctor",
      state: status.readiness === "ready" ? "pass" : "info"
    }
  ];

  return `
    <div class="setup-flow" aria-label="${escapeHtml(
      tx("Claude Code real data setup", "Claude Code 真实数据设置")
    )}">
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
                statusLabel(step.state)
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
        statusLabel(check.status)
      )
    )
    .join("");
}

function formatLatestSnapshotStatus(status) {
  const parts = [];

  if (status.latestObservedAt) {
    parts.push(
      tx("Last observed {time}", "上次观测：{time}", {
        time: formatRelative(status.latestObservedAt)
      })
    );
  } else {
    parts.push(status.latestPath);
  }

  if (status.latestWindowTypes?.length > 0) {
    parts.push(
      tx("Windows {windows}", "窗口：{windows}", {
        windows: status.latestWindowTypes.map(windowLabel).join(", ")
      })
    );
  }

  if (typeof status.latestAgeSeconds === "number") {
    parts.push(
      tx("Age {age}", "数据年龄 {age}", {
        age: formatDuration(status.latestAgeSeconds)
      })
    );
  }

  return parts.join("\n");
}

function renderPathSettings() {
  const status = state.pathsStatus;

  if (!status) {
    elements.pathsContent.innerHTML = `<p class="empty">${escapeHtml(
      tx("Path setup unavailable.", "路径设置不可用。")
    )}</p>`;
    return;
  }

  const errorRows = (status.loadErrors ?? [])
    .map((error) =>
      settingsRow(tx("Config warning", "配置警告"), tx("Check file", "检查文件"), error, "warning")
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
        tx("Config file", "配置文件"),
        status.configExists ? tx("Found", "已找到") : tx("Not found", "未找到"),
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

function renderDesktopShortcutsSettings() {
  const status = state.desktopShortcutsStatus;

  if (!elements.desktopShortcutsContent) {
    return;
  }

  if (!status) {
    elements.desktopShortcutsContent.innerHTML = `<p class="empty">${escapeHtml(
      tx("Desktop shortcut status unavailable.", "桌面快捷键状态不可用。")
    )}</p>`;
    return;
  }

  const shortcutRows = (status.shortcuts ?? [])
    .map((shortcut) =>
      settingsRow(
        shortcut.description,
        shortcut.enabled ? formatShortcutValue(shortcut.value) : tx("Disabled", "已关闭"),
        tx("{envVar} - default {value}", "{envVar} - 默认 {value}", {
          envVar: shortcut.envVar,
          value: shortcut.defaultValue
        }),
        shortcut.enabled ? "healthy" : "stale",
        shortcut.enabled ? tx("enabled", "已启用") : tx("off", "关闭")
      )
    )
    .join("");

  elements.desktopShortcutsContent.innerHTML = `
    <div class="setup-watch-notice">
      <div>
        <strong>${escapeHtml(tx("AIQD-only shortcuts", "仅作用于 AIQD 的快捷键"))}</strong>
        <div class="settings-detail">${escapeHtml(status.privacy?.note ?? "")}</div>
      </div>
      <span class="badge healthy">${escapeHtml(tx("safe", "安全"))}</span>
    </div>
    <div class="settings-list">
      ${shortcutRows}
      ${settingsRow(
        tx("Disable a shortcut", "关闭某个快捷键"),
        status.disableValue ?? "off",
        tx(
          "Set any desktop shortcut environment variable to this value before launching the desktop app.",
          "启动桌面应用前，把任意桌面快捷键环境变量设置成这个值即可关闭。"
        ),
        "stale",
        tx("optional", "可选")
      )}
    </div>
  `;
}

function formatShortcutValue(value) {
  return value
    ? value.replaceAll("CommandOrControl", "Ctrl/Cmd")
    : tx("Disabled", "已关闭");
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
    configuredCount === 0
      ? tx("Default paths", "默认路径")
      : tx("{count} configured", "已配置 {count} 个", {
          count: configuredCount
        });

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

function renderAdvancedDetails(summary, content) {
  return `
    <details class="advanced-details">
      <summary>${escapeHtml(summary)}</summary>
      <div class="advanced-details-body">
        ${content}
      </div>
    </details>
  `;
}

function renderFieldPills(label, fields = [], badgeClass) {
  return `
    <div class="settings-row">
      <strong>${escapeHtml(label)}</strong>
      <div class="pill-list">${fields
        .map((field) => `<span class="badge ${badgeClass}">${escapeHtml(field)}</span>`)
        .join("")}</div>
      <span></span>
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
      title="${escapeHtml(tx("Copy command", "复制命令"))}"
      aria-label="${escapeHtml(tx("Copy command", "复制命令"))}"
    >${escapeHtml(tx("Copy", "复制"))}</button>
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
  const originalText =
    button.dataset.defaultText ?? button.textContent ?? tx("Copy", "复制");
  const label =
    result === "copied"
      ? tx("Copied", "已复制")
      : result === "selected"
        ? tx("Selected", "已选中")
        : tx("Copy failed", "复制失败");

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
    return tx("{window} reset time changed", "{window} reset 时间变化", {
      window: windowLabel(event.windowType)
    });
  }

  return tx("{window} quota replenished", "{window} 额度恢复", {
    window: windowLabel(event.windowType)
  });
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
    return `<span class="reset-unavailable">${escapeHtml(
      tx("No reported reset", "没有报告 reset")
    )}</span>`;
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
  const formatter = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });

  for (const [unit, seconds] of units) {
    if (absoluteSeconds >= seconds || unit === "second") {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }

  return date.toLocaleString(locale());
}

function formatTimestamp(value) {
  if (isEndOfLocalDay(value)) {
    const date = new Intl.DateTimeFormat(locale(), {
      day: "numeric",
      month: "short"
    }).format(new Date(value));

    return tx("{date} (date only)", "{date}（仅日期）", { date });
  }

  return new Intl.DateTimeFormat(locale(), {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short"
  }).format(new Date(value));
}

function isEndOfLocalDay(value) {
  const date = new Date(value);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getHours() === 23 &&
    date.getMinutes() === 59 &&
    date.getSeconds() === 59 &&
    date.getMilliseconds() === 999
  );
}

function toDateLocalValue(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(0, 10);
}

function toTimeLocalValue(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

  return localDate.toISOString().slice(11, 16);
}

function windowLabel(windowType) {
  const labels = {
    session_5h: tx("5h window", "5 小时窗口"),
    daily: tx("Daily", "每日"),
    weekly: tx("Weekly", "每周"),
    monthly: tx("Monthly", "每月"),
    billing_cycle: tx("Billing cycle", "计费周期"),
    credits: tx("Credits", "点数")
  };

  return labels[windowType] ?? windowType;
}

function sourceLabel(source) {
  const labels = {
    official_api: tx("Official API", "官方 API"),
    official_cli: tx("Official CLI", "官方 CLI"),
    official_statusline: tx("Official statusline", "官方状态栏"),
    local_quota_snapshot: tx("Local snapshot", "本地快照"),
    local_usage_log: tx("Local log", "本地日志"),
    estimated: tx("Estimated", "估算"),
    manual: tx("Manual", "手动"),
    demo: tx("Demo", "演示"),
    unavailable: tx("Unavailable", "不可用")
  };

  return labels[source] ?? source;
}

function confidenceLabel(confidence) {
  const labels = {
    estimated: tx("estimated", "估算"),
    high: tx("high", "高"),
    medium: tx("medium", "中"),
    official: tx("official", "官方"),
    unknown: tx("unknown", "未知")
  };

  return labels[confidence] ?? confidence ?? statusLabel("unknown");
}

function statusLabel(status) {
  const labels = {
    critical: tx("critical", "严重"),
    fail: tx("fail", "失败"),
    healthy: tx("healthy", "正常"),
    info: tx("info", "提示"),
    needs_attention: tx("needs attention", "需要处理"),
    pass: tx("pass", "通过"),
    ready: tx("ready", "就绪"),
    stale: tx("stale", "过期"),
    unknown: tx("unknown", "未知"),
    waiting_for_data: tx("waiting", "等待中"),
    warn: tx("warn", "警告"),
    warning: tx("warning", "警告")
  };

  return labels[status] ?? status ?? labels.unknown;
}

function localizedReadinessLabel(label) {
  if (!label) {
    return undefined;
  }

  if (currentLanguage !== "zh") {
    return label;
  }

  const labels = new Map([
    ["Ready", "就绪"],
    ["Waiting for data", "等待数据"],
    ["Needs attention", "需要处理"],
    ["Expired", "已过期"],
    ["Unknown", "未知"],
    ["Setup status unavailable", "设置状态不可用"],
    ["Waiting for visible quota", "等待可见额度"],
    ["No Codex snapshot yet", "还没有 Codex 快照"],
    ["Waiting for Claude Code data", "等待 Claude Code 数据"],
    ["Waiting for Claude Code CLI command", "等待 Claude Code CLI 命令"],
    ["Claude Code setup needed", "需要设置 Claude Code"],
    ["Codex manual snapshot ready", "Codex 手动快照已就绪"],
    ["Claude Code data ready", "Claude Code 数据已就绪"]
  ]);

  return labels.get(label) ?? label;
}

function localizedNextAction(action) {
  if (!action || currentLanguage !== "zh") {
    return action;
  }

  const translations = [
    [
      "Open Codex /status",
      "打开 Codex /status，然后把可见的剩余百分比和 reset 时间保存到下方。"
    ],
    [
      "Install the statusline sink",
      "安装 statusline sink，然后从 CLI/终端项目会话打开 Claude Code。"
    ],
    [
      "Install Claude Code CLI",
      "先安装 Claude Code CLI，然后在项目文件夹里打开终端并运行 claude。"
    ],
    [
      "Open Claude Code",
      "从 CLI/终端项目会话打开 Claude Code；普通 Claude 桌面应用不会发送这些字段。"
    ],
    [
      "Run Doctor",
      "运行诊断查看设置详情。"
    ],
    [
      "Record a visible Codex quota value",
      "记录一个可见的 Codex 额度值。"
    ]
  ];

  const match = translations.find(([needle]) => action.includes(needle));

  return match?.[1] ?? action;
}

function agentEmptyText(agent) {
  if (currentLanguage !== "zh") {
    return {
      detail:
        agent.emptyState?.detail ??
        "The latest refresh did not produce a quota snapshot for this agent.",
      title: agent.emptyState?.title ?? "No quota data yet"
    };
  }

  if (agent.emptyState?.reason === "waiting_for_statusline_data") {
    return {
      detail: "从 CLI/终端项目会话打开 Claude Code，等待它发送支持的 rate_limits 字段。普通 Claude 桌面应用不会触发这里。",
      title: "等待 Claude Code CLI 数据"
    };
  }

  if (agent.emptyState?.reason === "adapter_error") {
    return {
      detail: "打开诊断页查看失败的适配器。",
      title: "扫描失败"
    };
  }

  if (agent.agent === "codex") {
    return {
      detail: "保存 Codex /status 或 Usage 中可见的额度和 reset 时间。",
      title: "需要 Codex 手动快照"
    };
  }

  return {
    detail: "最近一次刷新没有为这个 Agent 生成额度快照。",
    title: "还没有额度数据"
  };
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
  return new Intl.NumberFormat(locale(), {
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
