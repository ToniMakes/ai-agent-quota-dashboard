import {
  clamp,
  createI18n,
  escapeHtml,
  isSameSnapshot,
  isStaleSnapshot,
  languageStorageKey,
  primaryMeterClass,
  resolveInitialLanguage
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

async function loadFirstRunOnboardingPreferences() {
  try {
    const preferences = window.aiqdDesktop?.getFirstRunOnboarding
      ? await window.aiqdDesktop.getFirstRunOnboarding()
      : JSON.parse(window.localStorage?.getItem("aiqd:first-run-onboarding:v1") ?? "null");

    return normalizeOnboardingPreferences(preferences);
  } catch {
    return defaultOnboardingPreferences();
  }
}

function defaultOnboardingPreferences() {
  return {
    agents: {
      claude: true,
      codex: true
    },
    claudeSources: {
      cli: false,
      desktop: true
    },
    claudeSource: "desktop",
    completed: false
  };
}

function normalizeOnboardingPreferences(preferences) {
  const fallback = defaultOnboardingPreferences();
  const value = preferences && typeof preferences === "object" ? preferences : {};
  const agents = value.agents && typeof value.agents === "object" ? value.agents : {};
  const claudeSources = normalizeClaudeSources(value, fallback.claudeSources);

  return {
    agents: {
      claude: agents.claude !== false,
      codex: agents.codex !== false
    },
    claudeSources,
    claudeSource: claudeSources.desktop ? "desktop" : "cli",
    completed: value.completed === true
  };
}

function normalizeClaudeSources(value, fallback) {
  const sources =
    value?.claudeSources && typeof value.claudeSources === "object"
      ? value.claudeSources
      : undefined;
  const legacySource =
    value?.claudeSource === "cli" || value?.claudeSource === "desktop"
      ? value.claudeSource
      : undefined;

  let desktop =
    sources?.desktop === true ||
    (sources?.desktop !== false && !sources && legacySource !== "cli") ||
    (!sources && !legacySource && fallback.desktop === true);
  let cli =
    sources?.cli === true ||
    (!sources && legacySource === "cli") ||
    (!sources && !legacySource && fallback.cli === true);

  if (!desktop && !cli) {
    desktop = true;
  }

  return {
    cli,
    desktop
  };
}

function filterAgentsByOnboarding(agents) {
  return agents.filter((agent) => {
    if (agent.agent === "codex") {
      return shouldShowAgentFamily("codex");
    }

    if (agent.agent === "claude-code") {
      return shouldShowClaudeCliWorkflow();
    }

    if (agent.agent === "claude-desktop") {
      return shouldShowClaudeDesktopWorkflow();
    }

    if (agent.provider === "anthropic" || String(agent.agent).startsWith("claude")) {
      return shouldShowAgentFamily("claude");
    }

    return true;
  });
}

function shouldShowAgentFamily(family) {
  const preferences = state.onboardingPreferences;

  if (!preferences?.completed) {
    return true;
  }

  if (family === "codex") {
    return preferences.agents.codex !== false;
  }

  if (family === "claude") {
    return preferences.agents.claude !== false;
  }

  return true;
}

function selectedClaudeSources() {
  return normalizeOnboardingPreferences(state.onboardingPreferences).claudeSources;
}

function shouldShowClaudeDesktopWorkflow() {
  if (!shouldShowAgentFamily("claude")) {
    return false;
  }

  if (!state.onboardingPreferences?.completed) {
    return true;
  }

  return selectedClaudeSources().desktop;
}

function shouldShowClaudeCliWorkflow() {
  if (!shouldShowAgentFamily("claude")) {
    return false;
  }

  if (!state.onboardingPreferences?.completed) {
    return true;
  }

  const sources = selectedClaudeSources();
  return sources.cli && !sources.desktop;
}

// Mirrors app.js: Claude Code CLI and Claude Desktop report the same
// underlying account, so the mini panel shows one auto-picked Claude card
// instead of two, same as the main dashboard.
function buildDisplayAgents(agents) {
  const claudeCode = agents.find((agent) => agent.agent === "claude-code");
  const claudeDesktop = agents.find((agent) => agent.agent === "claude-desktop");

  if (!claudeCode && !claudeDesktop) {
    return agents;
  }

  const winner = pickPrimaryClaudeAgent(claudeCode, claudeDesktop);
  const sources = [claudeCode, claudeDesktop].filter(Boolean);
  const snapshots = mergeClaudeSnapshots(winner.snapshots ?? [], sources);
  const primarySnapshot = mergeClaudeSnapshotTiming(
    winner.primarySnapshot,
    sources.flatMap((source) => source.snapshots ?? [])
  );
  const merged = {
    ...winner,
    agent: "claude",
    displayName: "Claude",
    primarySnapshot,
    snapshots,
    shortName: "Claude"
  };

  return agents
    .filter((agent) => agent.agent !== "claude-code" && agent.agent !== "claude-desktop")
    .concat([merged]);
}

function pickPrimaryClaudeAgent(claudeCode, claudeDesktop) {
  if (!claudeDesktop) {
    return claudeCode;
  }

  if (!claudeCode) {
    return claudeDesktop;
  }

  const codeFresh = Boolean(
    claudeCode.primarySnapshot && !isStaleSnapshot(claudeCode.primarySnapshot)
  );
  const desktopFresh = Boolean(
    claudeDesktop.primarySnapshot && !isStaleSnapshot(claudeDesktop.primarySnapshot)
  );

  if (codeFresh !== desktopFresh) {
    return codeFresh ? claudeCode : claudeDesktop;
  }

  if (codeFresh && desktopFresh) {
    const codeAt = Date.parse(claudeCode.primarySnapshot?.observedAt ?? "") || 0;
    const desktopAt = Date.parse(claudeDesktop.primarySnapshot?.observedAt ?? "") || 0;
    return desktopAt > codeAt ? claudeDesktop : claudeCode;
  }

  if (claudeCode.primarySnapshot && !claudeDesktop.primarySnapshot) {
    return claudeCode;
  }

  if (claudeDesktop.primarySnapshot && !claudeCode.primarySnapshot) {
    return claudeDesktop;
  }

  return claudeCode;
}

function mergeClaudeSnapshots(winnerSnapshots, sources) {
  const sourceSnapshots = sources.flatMap((source) => source.snapshots ?? []);
  const byWindow = new Map();

  for (const snapshot of winnerSnapshots) {
    byWindow.set(
      snapshot.windowType,
      mergeClaudeSnapshotTiming(snapshot, sourceSnapshots)
    );
  }

  for (const snapshot of sourceSnapshots) {
    if (byWindow.has(snapshot.windowType) || isStaleSnapshot(snapshot)) {
      continue;
    }

    byWindow.set(snapshot.windowType, snapshot);
  }

  return Array.from(byWindow.values());
}

function mergeClaudeSnapshotTiming(snapshot, sourceSnapshots) {
  if (!snapshot || snapshot.resetAt) {
    return snapshot;
  }

  const timingSource = sourceSnapshots.find(
    (candidate) =>
      candidate.windowType === snapshot.windowType &&
      candidate.resetAt &&
      !isStaleSnapshot(candidate)
  );

  if (!timingSource) {
    return snapshot;
  }

  return {
    ...snapshot,
    resetAt: timingSource.resetAt
  };
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
        <strong>Offline</strong>
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
      ariaLabel: tx("Open Doctor for refresh warning", "打开诊断查看刷新警告"),
      kind: "warning",
      target: "refresh-run-list",
      text: tx("Refresh warning - open Doctor", "刷新有警告 - 打开诊断"),
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
    ? tx("Open Doctor to {reason}", "打开诊断以{reason}", { reason })
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

function hasMeterValue(snapshot) {
  return Boolean(
    typeof snapshot?.remainingPercent === "number" ||
      (typeof snapshot?.remaining === "number" &&
        typeof snapshot?.total === "number" &&
        snapshot.total > 0)
  );
}

function windowMeterClass(snapshot) {
  if (snapshot.windowType === "session_5h") {
    return "session";
  }

  return snapshot.stale ? "stale" : "standard";
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
  if (!check?.displayName || currentLanguage !== "zh") {
    return check?.displayName;
  }

  const labels = {
    Mode: "模式"
  };

  return labels[check.displayName] ?? check.displayName;
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
      actionLabel: tx("Doctor", "诊断"),
      detail: tx("Check the failing adapter", "检查失败的适配器"),
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
      detail: tx("Add local statusline sink, or use Claude Desktop instead", "添加本地 statusline sink，或改用 Claude Desktop"),
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
    actionLabel: tx("Doctor", "诊断"),
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

function meterValue(snapshot) {
  if (!snapshot) {
    return 0;
  }

  if (isStaleSnapshot(snapshot)) {
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

  if (snapshot?.expiresAt) {
    return tx("{window}refresh {time}", "{window}{time}刷新", {
      window: prefix,
      time: formatResetDistance(snapshot.expiresAt)
    });
  }

  return tx("{window}reset --", "{window}重置 --", {
    window: prefix
  });
}

function snapshotTimingTitle(snapshot) {
  if (snapshot?.resetAt) {
    return tx("Reported reset {time}", "报告重置：{time}", {
      time: formatTimestamp(snapshot.resetAt, { long: true })
    });
  }

  if (snapshot?.expiresAt) {
    return tx("Refresh local sample by {time}", "本地样本需刷新：{time}", {
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
  if (snapshot?.freshness?.reason === "expired") {
    return tx("past reported reset", "超过报告的重置时间");
  }

  if (snapshot?.freshness?.reason === "source_marked_stale" || snapshot?.stale) {
    return tx("marked stale by source", "数据源要求刷新");
  }

  return tx("needs fresh data", "需要新数据");
}

function formatUsedText(snapshot) {
  if (!snapshot) {
    return "";
  }

  if (typeof snapshot.usedPercent === "number") {
    return `${Math.round(snapshot.usedPercent)}%`;
  }

  if (typeof snapshot.used === "number") {
    return `${compactNumber(snapshot.used)} ${snapshot.unit ?? ""}`.trim();
  }

  return "";
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
    session_5h: "5h",
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
