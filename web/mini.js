const languageStorageKey = "aiqd.language";
const defaultLanguage = "en";
let currentLanguage = resolveInitialLanguage();

const state = {
  agents: [],
  generatedAt: undefined,
  isRefreshing: false,
  lastError: undefined,
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

function resolveInitialLanguage() {
  const savedLanguage = window.localStorage?.getItem(languageStorageKey);

  if (savedLanguage === "zh" || savedLanguage === "en") {
    return savedLanguage;
  }

  return defaultLanguage;
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
      refreshRunsPayload,
      setupPayload,
      trialReadinessPayload
    ] = await Promise.all([
      fetchJson("/api/agents"),
      fetchJson("/api/refresh-runs"),
      fetchJson("/api/setup/claude-statusline"),
      fetchJson("/api/trial-readiness")
    ]);

    state.agents = agentsPayload.agents ?? [];
    state.generatedAt = agentsPayload.generatedAt;
    state.lastError = undefined;
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
  const agents = sortAgents(state.agents);

  if (agents.length === 0) {
    elements.grid.innerHTML = `<p class="mini-empty">${escapeHtml(
      tx("No agents", "没有 Agent")
    )}</p>`;
  } else {
    elements.grid.innerHTML = agents.map(renderAgent).join("");
  }

  renderFooter();
}

function renderAgent(agent) {
  const primary = agent.primarySnapshot;
  const status = agent.status ?? "unknown";
  const stalePrimary = isStaleSnapshot(primary);
  const guidance = primary ? undefined : emptyStateGuidance(agent);
  const detail = primary ? snapshotDetail(primary) : guidance.detail;
  const label = primary
    ? stalePrimary
      ? tx("{window} needs refresh", "{window} 需刷新", {
          window: windowLabel(primary.windowType)
        })
      : tx("{window} left", "{window} 剩余", {
          window: windowLabel(primary.windowType)
        })
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

  if (!state.trialReadiness && needsRealDataSetup(state.agents)) {
    const setup = setupProgress(state.agents);

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

  if (hasClaudeWaitingState(state.agents)) {
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
      "{snapshots} 个快照 / {usage} 条使用事件 / {doctor} 条诊断检查 / {reset} 条 reset 事件",
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
  const reset = resetShortSummary(snapshot.resetAt);
  const resetTitle = snapshot.resetAt
    ? tx("Reported reset {time}", "报告 reset：{time}", {
        time: formatTimestamp(snapshot.resetAt, { long: true })
      })
    : tx("No reported reset", "没有报告 reset");
  const used = formatUsedText(snapshot);
  const detailParts = [
    used ? tx("{amount} used", "已用 {amount}", { amount: used }) : "",
    reset
  ].filter(Boolean);

  return `
    <div class="mini-window-row ${escapeHtml(windowMeterClass(snapshot))}" title="${escapeHtml(resetTitle)}">
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

function primaryMeterClass(snapshot, status) {
  if (snapshot?.windowType === "session_5h" && status === "healthy") {
    return "session";
  }

  return status;
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

function isSameSnapshot(left, right) {
  return Boolean(
    left &&
      right &&
      left.provider === right.provider &&
      left.agent === right.agent &&
      left.windowType === right.windowType &&
      left.observedAt === right.observedAt
  );
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

function needsStrictReadinessSetup() {
  return state.trialReadiness && !state.trialReadiness.ok;
}

function strictReadinessProgress() {
  const checks = state.trialReadiness?.checks ?? [];
  const failedChecks = checks.filter((check) => check.status === "fail");
  const firstFailedCheck = failedChecks[0];
  const total = checks.length || state.agents.length;
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

  if (check?.agent === "claude-code") {
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
  const setupAgents = sortAgents(agents).filter((agent) =>
    ["codex", "claude-code"].includes(agent.agent)
  );
  const missing = setupAgents.filter((agent) => !agent.primarySnapshot);
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
      actionLabel: tx("Settings", "设置"),
      detail: tx("Open Claude Code once", "打开 Claude Code 一次"),
      label: tx("waiting", "等待中"),
      target: "settings-content",
      title: tx("Claude listening", "正在监听 Claude")
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
      detail: tx("Paste visible quota + reset", "粘贴可见额度和 reset"),
      label: tx("setup 1", "设置 1"),
      target: "codex-snapshot-content",
      title: tx("Codex /status needed", "需要 Codex /status")
    };
  }

  if (agent.agent === "claude-code") {
    return {
      action: "settings",
      actionLabel: tx("Install setup", "安装设置"),
      detail: tx("Add local statusline sink", "添加本地 statusline sink"),
      label: tx("setup 2", "设置 2"),
      target: "settings-content",
      title: tx("Claude statusline needed", "需要 Claude 状态栏")
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

function isStaleSnapshot(snapshot) {
  return Boolean(
    snapshot?.freshness?.status === "stale" ||
      snapshot?.stale ||
      (snapshot?.expiresAt && Date.parse(snapshot.expiresAt) <= Date.now())
  );
}

function resetShortSummary(value) {
  if (!value) {
    return tx("reset --", "reset --");
  }

  return tx("reset {time}", "{time}重置", {
    time: formatResetDistance(value)
  });
}

function snapshotDetail(snapshot) {
  const parts = [
    `${sourceLabel(snapshot.source)} / ${confidenceLabel(snapshot.confidence)}`,
    tx("seen {time}", "观测于 {time}", {
      time: formatRelative(snapshot.observedAt)
    })
  ];

  if (snapshot.freshness?.status === "stale") {
    parts.push(staleReasonLabel(snapshot));
  }

  return parts.join(" / ");
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
    return tx("marked stale by source", "数据源标记过期");
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

function formatResetDistance(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const suffix =
    deltaSeconds < 0 ? tx("ago", "前") : tx("left", "后");

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

function sourceLabel(source) {
  const labels = {
    official_api: tx("Official API", "官方 API"),
    official_cli: tx("Official CLI", "官方 CLI"),
    official_statusline: tx("Claude Code statusline", "Claude Code 状态栏"),
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

  return labels[confidence] ?? confidence;
}

function compactNumber(value) {
  return new Intl.NumberFormat(locale(), {
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
