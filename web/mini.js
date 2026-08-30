import {
  buildDisplayAgents as sharedBuildDisplayAgents,
  createI18n,
  escapeHtml,
  filterAgentsByOnboarding as sharedFilterAgentsByOnboarding,
  formatUsed as sharedFormatUsed,
  hasSnapshotMeterValue as hasMeterValue,
  isSameSnapshot,
  isStaleSnapshot,
  languageStorageKey,
  loadFirstRunOnboardingPreferences,
  mergeClaudeSnapshots,
  mergeSnapshotResetTiming,
  preferredClaudeDashboardSource as sharedPreferredClaudeDashboardSource,
  primaryMeterClass,
  readinessDisplayName as sharedReadinessDisplayName,
  resolveInitialLanguage,
  shouldShowAgentFamily as sharedShouldShowAgentFamily,
  shouldShowClaudeCliWorkflow as sharedShouldShowClaudeCliWorkflow,
  shouldShowClaudeDesktopWorkflow as sharedShouldShowClaudeDesktopWorkflow,
  snapshotMeterClass as windowMeterClass,
  snapshotMeterValue as meterValue,
  staleReasonLabel as sharedStaleReasonLabel
} from "./shared.js";

let currentLanguage = resolveInitialLanguage();
const { tx, locale, compactNumber, formatRelative } = createI18n(
  () => currentLanguage
);

const state = {
  agents: [],
  generatedAt: undefined,
  isRefreshing: false,
  lastError: undefined,
  onboardingPreferences: undefined,
  refreshRuns: [],
  setupStatus: undefined,
  trialReadiness: undefined
};

const elements = {
  footer: document.querySelector("#mini-footer"),
  grid: document.querySelector("#mini-grid"),
  languageToggle: document.querySelector("#mini-language-toggle"),
  refreshButton: document.querySelector('[data-desktop-action="refresh"]'),
  shell: document.querySelector(".mini-shell")
};

const refreshIntervalMs = 15_000;
const mode = new URLSearchParams(window.location.search).get("mode") ?? "panel";

elements.shell.dataset.mode = mode;

elements.languageToggle?.addEventListener("click", () => {
  currentLanguage = currentLanguage === "zh" ? "en" : "zh";
  window.localStorage?.setItem(languageStorageKey, currentLanguage);
  render();
});

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

function applyStaticTranslations() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-Hans" : "en";
  document.title = tx("AI Agent Quota Mini", "AI Agent Quota Mini");

  if (elements.languageToggle instanceof HTMLButtonElement) {
    elements.languageToggle.textContent = currentLanguage === "zh" ? "EN" : "中";
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

await load();
window.setInterval(load, refreshIntervalMs);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void load();
  }
});

async function load(options = {}) {
  const allowRefresh = options.allowRefresh ?? true;
  currentLanguage = resolveInitialLanguage();

  try {
    const [
      agentsPayload,
      onboardingPreferences,
      refreshRunsPayload,
      setupPayload,
      trialReadinessPayload
    ] = await Promise.all([
      fetchJson("/api/agents"),
      loadFirstRunOnboardingPreferences(),
      fetchJson("/api/refresh-runs"),
      fetchJson("/api/setup/claude-statusline"),
      fetchJson("/api/trial-readiness")
    ]);

    state.agents = agentsPayload.agents ?? [];
    state.generatedAt = agentsPayload.generatedAt;
    state.lastError = undefined;
    state.onboardingPreferences = onboardingPreferences;
    state.refreshRuns = refreshRunsPayload.runs ?? [];
    state.setupStatus = setupPayload.status;
    state.trialReadiness = trialReadinessPayload.readiness;

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
  applyStaticTranslations();
  const agents = sortAgents(buildDisplayAgents(filterAgentsByOnboarding(state.agents)));

  if (agents.length === 0) {
    elements.grid.innerHTML = `<p class="mini-empty">${escapeHtml(
      tx("No agents", "没有 Agent")
    )}</p>`;
  } else {
    elements.grid.innerHTML = agents.map(renderAgent).join("");
  }

  renderFooter();
}

function filterAgentsByOnboarding(agents) {
  return sharedFilterAgentsByOnboarding(agents, state.onboardingPreferences);
}

function shouldShowAgentFamily(family) {
  return sharedShouldShowAgentFamily(family, state.onboardingPreferences);
}

function shouldShowClaudeDesktopWorkflow() {
  return sharedShouldShowClaudeDesktopWorkflow(state.onboardingPreferences);
}

function shouldShowClaudeCliWorkflow() {
  return sharedShouldShowClaudeCliWorkflow(state.onboardingPreferences);
}

// Mirrors app.js: Claude Code CLI and Claude Desktop report the same
// underlying account, so the mini panel shows one auto-picked Claude card
// instead of two, same as the main dashboard. Honors the same onboarding
// source preference as the dashboard, via the shared implementation.
function buildDisplayAgents(agents) {
  return sharedBuildDisplayAgents(
    agents,
    sharedPreferredClaudeDashboardSource(state.onboardingPreferences)
  );
}

function renderAgent(agent) {
  const primary = agent.primarySnapshot;
  const status = agent.status ?? "unknown";
  const stalePrimary = isStaleSnapshot(primary);
  const guidance = primary ? undefined : emptyStateGuidance(agent);
  const detail = primary ? agentDetail(agent) : guidance.detail;
  const label = primary ? primaryLabel(primary) : guidance.label;

  return `
    <article class="mini-agent ${escapeHtml(status)}" title="${escapeHtml(detail)}">
      <div class="mini-agent-top">
        <span class="status-dot ${escapeHtml(status)}" aria-hidden="true"></span>
        <strong>${escapeHtml(agent.shortName ?? agent.displayName)}</strong>
        <span class="mini-remaining">${formatRemaining(primary)}</span>
      </div>
      <div class="mini-primary-label">${escapeHtml(label)}</div>
      <div class="mini-meter" aria-hidden="true">
        <div
          class="mini-meter-fill ${escapeHtml(primaryMeterClass(primary, status))}"
          style="--value: ${meterValue(primary)}%"
        ></div>
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
    state.lastError = tx("Refresh failed", "刷新失败");
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
        <strong>${escapeHtml(tx("Offline", "离线"))}</strong>
        <span class="mini-remaining">--</span>
      </div>
      <div class="mini-primary-label">${escapeHtml(tx("offline", "离线"))}</div>
      <div class="mini-window-list">
        <div class="mini-empty-state">
          <strong>${escapeHtml(tx("Local service unavailable", "本地服务不可用"))}</strong>
          <span>${escapeHtml(tx("Restart the dashboard", "重启仪表盘"))}</span>
        </div>
      </div>
      <div class="mini-detail">${escapeHtml(tx("Waiting for local service", "等待本地服务"))}</div>
    </article>
  `;
  state.lastError =
    state.lastError ?? tx("Local service unavailable", "本地服务不可用");
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
      text: tx("Refreshing now", "正在刷新")
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
      ariaLabel: tx("Open Diagnostics for refresh warning", "打开诊断查看刷新警告"),
      kind: "warning",
      target: "refresh-run-list",
      text: tx("Refresh warning - open Diagnostics", "刷新有警告 - 打开诊断"),
      title: refreshRunTitle(latestRun)
    };
  }

  if (needsStrictReadinessSetup()) {
    const setup = strictReadinessProgress();

    if (latestRun && latestRun.snapshotsSaved > 0) {
      return {
        action: setup.action,
        ariaLabel: readinessActionLabel(
          setup.action,
          tx("finish real data setup", "完成真实数据设置")
        ),
        kind: "info",
        target: setup.target,
        text: tx(
          "{ready}/{total} ready - finish {missing}",
          "{ready}/{total} 就绪 - 完成 {missing}",
          {
            missing: setup.missingText,
            ready: setup.ready,
            total: setup.total
          }
        ),
        title: [setup.title, refreshRunTitle(latestRun)].join("\n")
      };
    }

    return {
      action: setup.action,
      ariaLabel: readinessActionLabel(
        setup.action,
        tx("set up real data", "设置真实数据")
      ),
      kind: "info",
      target: setup.target,
      text: tx(
        "{ready}/{total} ready - finish {missing}",
        "{ready}/{total} 就绪 - 完成 {missing}",
        {
          missing: setup.missingText,
          ready: setup.ready,
          total: setup.total
        }
      ),
      title: latestRun ? [setup.title, refreshRunTitle(latestRun)].join("\n") : setup.title
    };
  }

  const visibleAgents = filterAgentsByOnboarding(state.agents);

  if (!state.trialReadiness && needsRealDataSetup(visibleAgents)) {
    const setup = setupProgress(visibleAgents);

    return {
      action: "settings",
      ariaLabel: tx("Open Settings to set up real data", "打开设置配置真实数据"),
      kind: "info",
      target: setup.target,
      text: tx(
        "{ready}/{total} ready - finish {missing}",
        "{ready}/{total} 就绪 - 完成 {missing}",
        {
          missing: setup.missingText,
          ready: setup.ready,
          total: setup.total
        }
      ),
      title: latestRun ? [setup.title, refreshRunTitle(latestRun)].join("\n") : setup.title
    };
  }

  if (hasClaudeWaitingState(visibleAgents)) {
    return {
      action: state.setupStatus?.statusLineManagedByApp ? undefined : "settings",
      ariaLabel: tx("Open Settings for Claude Code setup", "打开设置配置 Claude Code"),
      kind: "info",
      target: "settings-content",
      text: state.setupStatus?.statusLineManagedByApp
        ? tx("Watching Claude Code for rate_limits", "正在监听 Claude Code rate_limits")
        : tx("Claude Code setup needed", "需要设置 Claude Code"),
      title: latestRun ? refreshRunTitle(latestRun) : undefined
    };
  }

  if (latestRun) {
    return {
      kind: "success",
      text: tx("{snapshots} - updated {time}", "{snapshots} - 更新于 {time}", {
        snapshots: snapshotCountText(latestRun.snapshotsSaved),
        time: formatRelative(latestRun.observedAt)
      }),
      title: refreshRunTitle(latestRun)
    };
  }

  return {
    kind: "success",
    text: tx("Updated {time}", "更新于 {time}", {
      time: formatRelative(state.generatedAt)
    })
  };
}

function readinessActionLabel(action, reason) {
  return action === "doctor"
    ? tx("Open Diagnostics to {reason}", "打开诊断以{reason}", { reason })
    : tx("Open Settings to {reason}", "打开设置以{reason}", { reason });
}

function latestRefreshRun() {
  return state.refreshRuns
    .slice()
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
}

function snapshotCountText(count) {
  return tx("{count} snapshot{plural}", "{count} 个快照", {
    count,
    plural: count === 1 ? "" : "s"
  });
}

function refreshRunTitle(run) {
  const lines = [
    tx("Last refresh {time}", "上次刷新：{time}", {
      time: formatRelative(run.observedAt)
    }),
    tx(
      "{snapshots} snapshots / {usage} usage events / {doctor} doctor checks / {reset} reset events",
      "{snapshots} 个快照 / {usage} 条使用事件 / {doctor} 条诊断检查 / {reset} 条重置事件",
      {
        doctor: run.doctorChecksSaved,
        reset: run.resetEventsSaved,
        snapshots: run.snapshotsSaved,
        usage: run.usageEventsSaved
      }
    )
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

  const secondarySnapshots = snapshots.filter(
    (snapshot) => !isSameSnapshot(snapshot, agent.primarySnapshot)
  );

  if (secondarySnapshots.length === 0) {
    return "";
  }

  const visibleSnapshots = secondarySnapshots.slice(0, 1);
  const rows = visibleSnapshots.map(renderWindowRow).join("");
  const hiddenCount = secondarySnapshots.length - visibleSnapshots.length;
  const more =
    hiddenCount > 0
      ? `<div class="mini-window-more">${escapeHtml(
          tx("+{count} more {unit}", "另有 {count} 个{unit}", {
            count: hiddenCount,
            unit: tx(hiddenCount === 1 ? "window" : "windows", "窗口")
          })
        )}</div>`
      : "";

  return rows + more;
}

function renderWindowRow(snapshot) {
  const timing = snapshotTimingDetail(snapshot);
  const timingTitle = snapshotTimingTitle(snapshot);
  const used = formatUsedText(snapshot);
  const detailParts = [
    used ? tx("{amount} used", "已用 {amount}", { amount: used }) : "",
    timing
  ].filter(Boolean);

  return `
    <div class="mini-window-row ${escapeHtml(windowMeterClass(snapshot))}" title="${escapeHtml(timingTitle)}">
      <div class="mini-window-heading">
        <span>${escapeHtml(windowLabel(snapshot.windowType))}</span>
        <strong>${escapeHtml(formatRemainingText(snapshot))}</strong>
      </div>
      ${renderWindowMeter(snapshot)}
      <div class="mini-window-meta">
        <span>${escapeHtml(detailParts.join(" / "))}</span>
      </div>
    </div>
  `;
}

function renderWindowMeter(snapshot) {
  if (!hasMeterValue(snapshot)) {
    return "";
  }

  return `
    <div class="mini-window-meter" aria-hidden="true">
      <div
        class="mini-window-meter-fill ${escapeHtml(windowMeterClass(snapshot))}"
        style="--value: ${meterValue(snapshot)}%"
      ></div>
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
      (snapshot) => !isSameSnapshot(snapshot, primary)
    )
  ];
}

function hasClaudeWaitingState(agents) {
  return agents.some(
    (agent) =>
      (agent.agent === "claude-code" &&
        agent.emptyState?.reason === "waiting_for_statusline_data") ||
      (agent.agent === "claude-desktop" &&
        agent.emptyState?.reason === "waiting_for_desktop_data")
  );
}

function needsRealDataSetup(agents) {
  return agents.some((agent) => !agent.primarySnapshot);
}

function needsStrictReadinessSetup() {
  return Boolean(
    state.trialReadiness &&
      visibleReadinessChecks().some((check) => check.status === "fail")
  );
}

function strictReadinessProgress() {
  const checks = visibleReadinessChecks();
  const failedChecks = checks.filter((check) => check.status === "fail");
  const firstFailedCheck = failedChecks[0];
  const total = checks.length || filterAgentsByOnboarding(state.agents).length;
  const ready = checks.filter((check) => check.status === "pass").length;
  const missingText =
    failedChecks.map(readinessDisplayName).filter(Boolean).join(", ") ||
    tx("real data", "真实数据");
  const target = readinessCheckTarget(firstFailedCheck);

  return {
    action: target.action,
    missingText,
    ready,
    target: target.target,
    title: tx(
      "{ready}/{total} strict trial checks ready. Missing: {missing}.",
      "{ready}/{total} 项严格试用检查就绪。缺少：{missing}。",
      {
        missing: missingText,
        ready,
        total
      }
    ),
    total
  };
}

function visibleReadinessChecks() {
  const checks = state.trialReadiness?.checks ?? [];

  return checks.filter((check) => {
    if (check.agent === "codex") {
      return shouldShowAgentFamily("codex");
    }

    if (check.agent === "claude-code") {
      return shouldShowClaudeCliWorkflow();
    }

    if (check.agent === "claude-desktop") {
      return shouldShowClaudeDesktopWorkflow();
    }

    if (check.provider === "anthropic" || String(check.agent).startsWith("claude")) {
      return shouldShowAgentFamily("claude");
    }

    return true;
  });
}

function readinessCheckTarget(check) {
  if (check?.agent === "doctor") {
    return {
      action: "doctor",
      target: "doctor-list"
    };
  }

  if (check?.agent === "codex") {
    return {
      action: "settings",
      target: "codex-snapshot-content"
    };
  }

  if (check?.agent === "claude-code" || check?.agent === "claude-desktop") {
    return {
      action: "settings",
      target: "settings-content"
    };
  }

  return {
    action: "settings",
    target: "real-data-content"
  };
}

function readinessDisplayName(check) {
  return sharedReadinessDisplayName(check, currentLanguage);
}

function setupProgress(agents) {
  const claudeDesktopReady = Boolean(
    agents.find((agent) => agent.agent === "claude-desktop")?.primarySnapshot
  );
  const setupAgents = sortAgents(agents).filter((agent) =>
    ["codex", "claude-code", "claude-desktop"].includes(agent.agent)
  );
  const missing = setupAgents.filter((agent) =>
    agent.agent === "claude-code"
      ? !agent.primarySnapshot && !claudeDesktopReady
      : !agent.primarySnapshot
  );
  const total = setupAgents.length || agents.length;
  const ready = Math.max(total - missing.length, 0);
  const missingNames = missing.map((agent) => setupAgentName(agent)).filter(Boolean);
  const missingText =
    missingNames.length > 0 ? missingNames.join(", ") : tx("real data", "真实数据");
  const target = missing[0] ? setupAgentTarget(missing[0]) : undefined;

  return {
    missingText,
    ready,
    target,
    title: tx(
      "{ready}/{total} quota sources ready. Missing: {missing}.",
      "{ready}/{total} 个额度来源就绪。缺少：{missing}。",
      {
        missing: missingText,
        ready,
        total
      }
    ),
    total
  };
}

function setupAgentName(agent) {
  if (agent.agent === "codex") {
    return "Codex";
  }

  if (agent.agent === "claude-code") {
    if (agent.emptyState?.reason === "waiting_for_statusline_data") {
      return tx("Claude data", "Claude 数据");
    }

    return "Claude";
  }

  if (agent.agent === "claude-desktop") {
    return "Claude Desktop";
  }

  return agent.shortName ?? agent.displayName ?? agent.agent;
}

function setupAgentTarget(agent) {
  if (agent.agent === "codex") {
    return "codex-snapshot-content";
  }

  if (agent.agent === "claude-code" || agent.agent === "claude-desktop") {
    return "settings-content";
  }

  return "real-data-content";
}

function emptyStateGuidance(agent) {
  if (agent.emptyState?.reason === "waiting_for_statusline_data") {
    return {
      action: "settings",
      actionLabel: tx("Settings", "设置"),
      detail: tx("Open Claude Code once", "打开 Claude Code 一次"),
      label: tx("waiting", "等待中"),
      target: "settings-content",
      title: tx("Claude listening", "正在监听 Claude")
    };
  }

  if (agent.emptyState?.reason === "waiting_for_desktop_data") {
    return {
      action: "settings",
      actionLabel: tx("Settings", "设置"),
      detail: tx("Open Claude Desktop once", "打开 Claude Desktop 一次"),
      label: tx("waiting", "等待中"),
      target: "settings-content",
      title: tx("Claude Desktop listening", "正在监听 Claude Desktop")
    };
  }

  if (agent.emptyState?.reason === "adapter_error") {
    return {
      action: "doctor",
      actionLabel: tx("Diagnostics", "诊断"),
      detail: tx("Something went wrong - see details", "出了点问题，查看详情"),
      label: tx("check", "检查"),
      target: "doctor-list",
      title: tx("Scan failed", "扫描失败")
    };
  }

  if (agent.agent === "codex") {
    return {
      action: "settings",
      actionLabel: tx("Save /status", "保存 /status"),
      detail: tx("Paste visible quota + reset", "粘贴可见额度和重置时间"),
      label: tx("setup 1", "设置 1"),
      target: "codex-snapshot-content",
      title: tx("Codex /status needed", "需要 Codex /status")
    };
  }

  if (agent.agent === "claude-code") {
    return {
      action: "settings",
      actionLabel: tx("Install setup", "安装设置"),
      detail: tx("Connect Claude Code's statusline, or use Claude Desktop instead", "连接 Claude Code 的状态栏，或改用 Claude Desktop"),
      label: tx("setup 2", "设置 2"),
      target: "settings-content",
      title: tx("Claude statusline needed", "需要 Claude 状态栏")
    };
  }

  if (agent.agent === "claude-desktop") {
    return {
      action: "settings",
      actionLabel: tx("Open Claude Desktop", "打开 Claude Desktop"),
      detail: tx("No install needed, just open it once", "不需要安装，打开一次即可"),
      label: tx("optional", "可选"),
      target: "settings-content",
      title: tx("Claude Desktop data pending", "等待 Claude Desktop 数据")
    };
  }

  return {
    action: "doctor",
    actionLabel: tx("Diagnostics", "诊断"),
    detail: agent.emptyState?.detail ?? tx("No quota data yet", "还没有额度数据"),
    label: tx("unavailable", "不可用"),
    target: "doctor-list",
    title: agent.emptyState?.title ?? tx("No quota data", "没有额度数据")
  };
}

function sortAgents(agents) {
  const order = new Map([
    ["codex", 0],
    ["claude", 1],
    ["claude-code", 1],
    ["claude-desktop", 2]
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

  if (isStaleSnapshot(snapshot)) {
    return tx("Refresh", "刷新");
  }

  if (typeof snapshot.remainingPercent === "number") {
    return `${Math.round(snapshot.remainingPercent)}%`;
  }

  if (typeof snapshot.remaining === "number") {
    return compactNumber(snapshot.remaining);
  }

  return "--";
}

function agentDetail(agent) {
  const snapshots = prioritizeSnapshots(agent.snapshots ?? [], agent.primarySnapshot);
  const observedAt = latestObservedAt(snapshots) ?? agent.primarySnapshot?.observedAt;
  const parts = [
    tx("updated {time}", "更新于 {time}", {
      time: formatRelative(observedAt)
    })
  ].filter(Boolean);

  if (agent.primarySnapshot?.freshness?.status === "stale") {
    parts.push(staleReasonLabel(agent.primarySnapshot));
  }

  return parts.join(" / ");
}

function primaryLabel(snapshot) {
  const windowText = windowLabel(snapshot.windowType);
  const quotaText = isStaleSnapshot(snapshot)
    ? tx("{window} needs refresh", "{window} 需刷新", {
        window: windowText
      })
    : tx("{window} left", "{window} 剩余", {
        window: windowText
      });
  const timingText = snapshotTimingDetail(snapshot);

  if (!timingText) {
    return quotaText;
  }

  return tx("{quota} - {timing}", "{quota} · {timing}", {
    quota: quotaText,
    timing: timingText
  });
}

function snapshotTimingDetail(snapshot, options = {}) {
  if (!snapshot) {
    return "";
  }

  const prefix = options.includeWindow
    ? `${windowLabel(snapshot.windowType)} `
    : "";

  if (snapshot?.resetAt) {
    return tx("{window}reset {time}", "{window}{time}重置", {
      window: prefix,
      time: formatResetDistance(snapshot.resetAt)
    });
  }

  return "";
}

function snapshotTimingTitle(snapshot) {
  if (snapshot?.resetAt) {
    return tx("Reported reset {time}", "报告重置：{time}", {
      time: formatTimestamp(snapshot.resetAt, { long: true })
    });
  }

  if (snapshot?.expiresAt) {
    return tx("Local sample freshness by {time}", "本地样本新鲜度：{time}", {
      time: formatTimestamp(snapshot.expiresAt, { long: true })
    });
  }

  return tx("No reported reset", "未报告重置时间");
}

function latestObservedAt(snapshots) {
  const timestamps = snapshots
    .map((snapshot) => Date.parse(snapshot.observedAt))
    .filter((timestamp) => !Number.isNaN(timestamp));

  if (timestamps.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function formatRemainingText(snapshot) {
  if (!snapshot) {
    return "--";
  }

  if (isStaleSnapshot(snapshot)) {
    return tx("needs refresh", "需要刷新");
  }

  if (typeof snapshot.remainingPercent === "number") {
    return `${Math.round(snapshot.remainingPercent)}%`;
  }

  if (typeof snapshot.remaining === "number") {
    return `${compactNumber(snapshot.remaining)} ${snapshot.unit}`;
  }

  return "--";
}

function staleReasonLabel(snapshot) {
  return sharedStaleReasonLabel(snapshot, tx);
}

function formatUsedText(snapshot) {
  return sharedFormatUsed(snapshot, compactNumber);
}

function formatResetDistance(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  const timestamp = date.getTime();

  if (Number.isNaN(timestamp)) {
    return "--";
  }

  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  let amount;

  if (absoluteSeconds >= 86400) {
    amount = `${Math.round(absoluteSeconds / 86400)}d`;
  } else if (absoluteSeconds >= 3600) {
    amount = `${Math.round(absoluteSeconds / 3600)}h`;
  } else if (absoluteSeconds >= 60) {
    amount = `${Math.round(absoluteSeconds / 60)}m`;
  } else {
    amount = `${absoluteSeconds}s`;
  }

  return deltaSeconds < 0
    ? tx("{amount} ago", "{amount} 前", { amount })
    : tx("in {amount}", "{amount} 后", { amount });
}

function formatTimestamp(value, options = {}) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat(locale(), {
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
    billing_cycle: tx("Billing", "计费"),
    credits: tx("Credits", "点数"),
    daily: tx("Daily", "每日"),
    monthly: tx("Monthly", "每月"),
    session_5h: tx("5h", "5 小时"),
    weekly: tx("Weekly", "每周")
  };

  return labels[windowType] ?? windowType;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}
