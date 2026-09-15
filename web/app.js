import {
  buildDisplayAgents as sharedBuildDisplayAgents,
  agentSubscriptionTier,
  claudeCodeAgentId,
  claudeDesktopAgentId,
  clamp,
  codexResetCreditReminderState,
  codexResetCreditReminderStorageKey,
  createI18n,
  defaultOnboardingPreferences,
  defaultCodexResetCreditReminderPreferences,
  escapeHtml,
  filterAgentsByOnboarding as sharedFilterAgentsByOnboarding,
  firstRunOnboardingStorageKey,
  formatUsed as sharedFormatUsed,
  hasSnapshotMeterValue,
  isFreshRealSnapshot,
  isSameSnapshot,
  isStaleSnapshot,
  languageStorageKey,
  loadFirstRunOnboardingPreferences,
  mergeClaudeSnapshots,
  mergeSnapshotResetTiming,
  normalizeCodexResetCreditReminderPreferences,
  normalizeClaudeSources,
  normalizeOnboardingPreferences,
  preferredClaudeDashboardSource as sharedPreferredClaudeDashboardSource,
  primaryMeterClass,
  resolveInitialLanguage,
  shouldShowAgentFamily as sharedShouldShowAgentFamily,
  shouldShowClaudeCliWorkflow as sharedShouldShowClaudeCliWorkflow,
  shouldShowClaudeDesktopWorkflow as sharedShouldShowClaudeDesktopWorkflow,
  snapshotMeterClass,
  snapshotMeterValue,
  staleReasonLabel as sharedStaleReasonLabel
} from "./shared.js";

let currentLanguage = resolveInitialLanguage();
const { tx, locale, sourceLabel, compactNumber, formatRelative } = createI18n(
  () => currentLanguage
);

const state = {
  agentPreferencesSaveStatus: undefined,
  agents: [],
  claudeAutoSetupMode: undefined,
  claudeAutoSetupPending: false,
  claudeAutoSetupResult: undefined,
  claudeCheckFeedback: undefined,
  codexSnapshotFormDraft: undefined,
  codexSnapshotSaveStatus: undefined,
  codexSnapshotStatus: undefined,
  codexResetCreditReminderPreferences: defaultCodexResetCreditReminderPreferences(),
  codexResetCreditReminderSaveStatus: undefined,
  dashboardClosePreferencePending: false,
  dashboardClosePreferenceSaveStatus: undefined,
  dashboardClosePreferenceStatus: undefined,
  desktopShortcutsStatus: undefined,
  doctorChecks: [],
  launchAtStartupPending: false,
  launchAtStartupPendingValue: undefined,
  launchAtStartupSaveStatus: undefined,
  launchAtStartupStatus: undefined,
  startupPreferenceExpanded: false,
  onboardingDraft: undefined,
  onboardingPreferences: undefined,
  onboardingSaveStatus: undefined,
  onboardingStep: "agents",
  pathsStatus: undefined,
  refreshRuns: [],
  refreshStatus: undefined,
  resetEvents: [],
  setupDetailTarget: undefined,
  setupStatus: undefined,
  trialReadiness: undefined,
  generatedAt: undefined
};

const elements = {
  agentGrid: document.querySelector("#agent-grid"),
  agentPreferencesContent: document.querySelector("#agent-preferences-content"),
  advancedSettingsPanel: document.querySelector("#advanced-settings-panel"),
  claudeConnectionPanel: document.querySelector("#claude-connection-panel"),
  codexSnapshotContent: document.querySelector("#codex-snapshot-content"),
  codexConnectionPanel: document.querySelector("#codex-connection-panel"),
  dashboardCloseContent: document.querySelector("#dashboard-close-content"),
  desktopShortcutsContent: document.querySelector("#desktop-shortcuts-content"),
  doctorChecklist: document.querySelector("#doctor-checklist"),
  doctorChecklistScore: document.querySelector("#doctor-checklist-score"),
  doctorList: document.querySelector("#doctor-list"),
  eventList: document.querySelector("#event-list"),
  languageToggle: document.querySelector("#language-toggle"),
  lastRefresh: document.querySelector("#last-refresh"),
  onboardingRoot: document.querySelector("#first-run-onboarding-root"),
  pathsContent: document.querySelector("#paths-content"),
  realDataContent: document.querySelector("#real-data-content"),
  realDataPanel: document.querySelector("#real-data-panel"),
  realDataScore: document.querySelector("#real-data-score"),
  refreshButton: document.querySelector("#refresh-button"),
  refreshStatus: document.querySelector("#refresh-status"),
  refreshRunList: document.querySelector("#refresh-run-list"),
  resetList: document.querySelector("#reset-list"),
  resetCreditReminderContent: document.querySelector("#reset-credit-reminder-content"),
  settingsContent: document.querySelector("#settings-content"),
  settingsView: document.querySelector("#settings-view"),
  startupContent: document.querySelector("#startup-content"),
  startupPanel: document.querySelector("#startup-panel"),
  tabs: document.querySelectorAll(".tab"),
  topbarStartupControl: document.querySelector("#topbar-startup-control"),
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

  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-launch-at-startup-toggle]")
  ) {
    void setLaunchAtStartup(target.checked);
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-dashboard-close-prompt-toggle]")
  ) {
    void setDashboardClosePreference(target.checked ? "ask" : "tray");
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-agent-preference-agent]")
  ) {
    void setAgentPreference(target.dataset.agentPreferenceAgent, target.checked);
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-agent-preference-claude-source]")
  ) {
    void setClaudeSourcePreference(
      target.dataset.agentPreferenceClaudeSource,
      target.checked
    );
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-reset-credit-reminder-toggle]")
  ) {
    setCodexResetCreditReminderPreferences({
      ...state.codexResetCreditReminderPreferences,
      enabled: target.checked
    });
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-reset-credit-reminder-days]")
  ) {
    const selectedDays = new Set(
      normalizeCodexResetCreditReminderPreferences(
        state.codexResetCreditReminderPreferences
      ).daysBefore
    );
    const day = Number(target.value);

    if (target.checked) {
      selectedDays.add(day);
    } else {
      selectedDays.delete(day);
    }

    setCodexResetCreditReminderPreferences({
      ...state.codexResetCreditReminderPreferences,
      daysBefore: [...selectedDays]
    });
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-reset-credit-custom-days]")
  ) {
    const customDays = Number(target.value);
    if (Number.isFinite(customDays) && customDays >= 1 && customDays <= 30) {
      const selectedDays = new Set(
        normalizeCodexResetCreditReminderPreferences(
          state.codexResetCreditReminderPreferences
        ).daysBefore
      );
      [1, 3, 7, 14].forEach((days) => selectedDays.delete(days));
      selectedDays.add(Math.round(customDays));
      setCodexResetCreditReminderPreferences({
        ...state.codexResetCreditReminderPreferences,
        daysBefore: [...selectedDays]
      });
    }
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-onboarding-agent]")
  ) {
    updateOnboardingAgent(target.dataset.onboardingAgent, target.checked);
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-onboarding-claude-source]")
  ) {
    updateOnboardingClaudeSource(
      target.dataset.onboardingClaudeSource,
      target.checked
    );
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

  const claudeAutoSetupButton = target.closest("[data-claude-auto-setup-action]");

  if (claudeAutoSetupButton instanceof HTMLButtonElement) {
    await runClaudeAutoSetup({
      installIfMissing:
        claudeAutoSetupButton.dataset.claudeAutoSetupAction === "install"
    });
    return;
  }

  const claudeCheckActionButton = target.closest("[data-claude-check-action]");

  if (claudeCheckActionButton instanceof HTMLButtonElement) {
    await runClaudeStatuslineCheck();
    return;
  }

  const preferenceDisclosureButton = target.closest("[data-preference-disclosure]");

  if (preferenceDisclosureButton instanceof HTMLButtonElement) {
    if (preferenceDisclosureButton.dataset.preferenceDisclosure === "startup") {
      state.startupPreferenceExpanded = !state.startupPreferenceExpanded;
      renderDesktopStartupSettings();
    }

    return;
  }

  const onboardingSourceButton = target.closest("[data-onboarding-claude-source]");

  if (onboardingSourceButton instanceof HTMLButtonElement) {
    updateOnboardingClaudeSource(onboardingSourceButton.dataset.onboardingClaudeSource);
    return;
  }

  const onboardingNextButton = target.closest("[data-onboarding-next]");

  if (onboardingNextButton instanceof HTMLButtonElement) {
    advanceOnboarding();
    return;
  }

  const onboardingBackButton = target.closest("[data-onboarding-back]");

  if (onboardingBackButton instanceof HTMLButtonElement) {
    state.onboardingStep = "agents";
    renderFirstRunOnboarding();
    return;
  }

  const onboardingFinishButton = target.closest("[data-onboarding-finish]");

  if (onboardingFinishButton instanceof HTMLButtonElement) {
    await finishFirstRunOnboarding();
    return;
  }

  const onboardingLaterButton = target.closest("[data-onboarding-later]");

  if (onboardingLaterButton instanceof HTMLButtonElement) {
    await saveOnboardingDraft({ completed: true, runClaudeConnect: false });
    return;
  }

  const setupDetailToggle = target.closest("[data-setup-detail-toggle]");

  if (setupDetailToggle instanceof HTMLButtonElement) {
    const targetName = setupDetailToggle.dataset.setupDetailToggle;
    state.setupDetailTarget =
      state.setupDetailTarget === targetName ? undefined : targetName;
    render();
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
state.setupDetailTarget = setupDetailTargetFromTargetId(requestedTargetId());

await load();
scrollToRequestedTarget();

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

function setupDetailTargetFromTargetId(targetId) {
  if (targetId === "codex-snapshot-content") {
    return "codex";
  }

  if (targetId === "settings-content") {
    return "claude-code";
  }

  return undefined;
}

function scrollToRequestedTarget() {
  const targetId = requestedTargetId();

  if (!targetId) {
    return;
  }

  window.requestAnimationFrame(() => {
    const scrollTarget = document.getElementById(targetId);
    openAncestorDetails(scrollTarget);
    scrollTarget?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

function scrollToSelector(selector) {
  window.requestAnimationFrame(() => {
    const scrollTarget = document.querySelector(selector);
    openAncestorDetails(scrollTarget);
    scrollTarget?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function openAncestorDetails(element) {
  let ancestor = element?.closest("details");

  while (ancestor) {
    ancestor.open = true;
    ancestor = ancestor.parentElement?.closest("details");
  }
}

async function load() {
  const [
    agentsResponse,
    codexSnapshotResponse,
    dashboardClosePreference,
    desktopShortcutsResponse,
    doctorResponse,
    eventsResponse,
    onboardingPreferences,
    pathsResponse,
    refreshRunsResponse,
    setupResponse,
    startupStatus,
    trialReadinessResponse
  ] = await Promise.all([
    fetch("/api/agents"),
    fetch("/api/setup/codex-snapshot"),
    loadDashboardClosePreferenceStatus(),
    fetch("/api/setup/desktop-shortcuts"),
    fetch("/api/doctor"),
    fetch("/api/reset-events"),
    loadFirstRunOnboardingPreferences(),
    fetch("/api/setup/local-paths"),
    fetch("/api/refresh-runs"),
    fetch("/api/setup/claude-statusline"),
    loadLaunchAtStartupStatus(),
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
  state.codexResetCreditReminderPreferences =
    loadCodexResetCreditReminderPreferences();
  state.codexSnapshotStatus = codexSnapshotPayload.status;
  state.dashboardClosePreferenceStatus = dashboardClosePreference;
  state.desktopShortcutsStatus = desktopShortcutsPayload.status;
  state.doctorChecks = doctorPayload.checks ?? [];
  state.onboardingPreferences = onboardingPreferences;
  state.onboardingDraft ??= onboardingDraftFromPreferences(onboardingPreferences);
  state.onboardingStep = onboardingPreferences.completed ? "agents" : state.onboardingStep;
  state.resetEvents = eventsPayload.events ?? [];
  state.pathsStatus = pathsPayload.status;
  state.refreshRuns = refreshRunsPayload.runs ?? [];
  state.setupStatus = setupPayload.status;
  state.launchAtStartupStatus = startupStatus;
  state.trialReadiness = trialReadinessPayload.readiness;
  state.generatedAt = agentsPayload.generatedAt;

  render();
}

async function loadLaunchAtStartupStatus() {
  if (!window.aiqdDesktop?.getLaunchAtStartup) {
    return {
      canConfigure: false,
      enabled: false,
      platform: "browser",
      reason: "desktop_bridge_unavailable",
      supported: false
    };
  }

  try {
    return await window.aiqdDesktop.getLaunchAtStartup();
  } catch (error) {
    return {
      canConfigure: false,
      enabled: false,
      error: error instanceof Error ? error.message : String(error),
      platform: "unknown",
      reason: "status_error",
      supported: false
    };
  }
}

async function loadDashboardClosePreferenceStatus() {
  if (!window.aiqdDesktop?.getDashboardClosePreference) {
    return {
      actionWhenNotAsking: "tray",
      askBeforeClose: true,
      mode: "ask",
      reason: "desktop_bridge_unavailable",
      supported: false
    };
  }

  try {
    return await window.aiqdDesktop.getDashboardClosePreference();
  } catch (error) {
    return {
      actionWhenNotAsking: "tray",
      askBeforeClose: true,
      error: error instanceof Error ? error.message : String(error),
      mode: "ask",
      reason: "status_error",
      supported: false
    };
  }
}

async function saveFirstRunOnboardingPreferences(preferences) {
  const normalized = normalizeOnboardingPreferences(preferences);

  if (window.aiqdDesktop?.setFirstRunOnboarding) {
    return normalizeOnboardingPreferences(
      await window.aiqdDesktop.setFirstRunOnboarding(normalized)
    );
  }

  window.localStorage?.setItem(
    firstRunOnboardingStorageKey,
    JSON.stringify(normalized)
  );
  return normalized;
}

function onboardingDraftFromPreferences(preferences) {
  const normalized = normalizeOnboardingPreferences(preferences);

  return {
    agents: {
      claude: normalized.agents.claude,
      codex: normalized.agents.codex
    },
    claudeSources: {
      cli: normalized.claudeSources.cli,
      desktop: normalized.claudeSources.desktop
    },
    claudeSource: normalized.claudeSource
  };
}

function updateOnboardingAgent(agent, checked) {
  state.onboardingDraft ??= onboardingDraftFromPreferences(
    state.onboardingPreferences
  );

  if (agent === "codex" || agent === "claude") {
    state.onboardingDraft.agents[agent] = checked;
  }

  renderFirstRunOnboarding();
}

function updateOnboardingClaudeSource(source, checked) {
  state.onboardingDraft ??= onboardingDraftFromPreferences(
    state.onboardingPreferences
  );

  if (source === "desktop" || source === "cli") {
    state.onboardingDraft.claudeSources[source] = checked;

    if (
      !state.onboardingDraft.claudeSources.desktop &&
      !state.onboardingDraft.claudeSources.cli
    ) {
      state.onboardingDraft.claudeSources[source] = true;
      state.onboardingSaveStatus = {
        kind: "warning",
        message: tx(
          "Choose at least one Claude source.",
          "至少选择一个 Claude 数据来源。"
        )
      };
    } else {
      state.onboardingSaveStatus = undefined;
    }

    state.onboardingDraft.claudeSource = state.onboardingDraft.claudeSources
      .desktop
      ? "desktop"
      : "cli";
  }

  renderFirstRunOnboarding();
}

function advanceOnboarding() {
  const draft = normalizedOnboardingDraft();

  if (!draft.agents.codex && !draft.agents.claude) {
    state.onboardingSaveStatus = {
      kind: "warning",
      message: tx("Choose at least one agent.", "至少选择一个 agent。")
    };
    renderFirstRunOnboarding();
    return;
  }

  state.onboardingSaveStatus = undefined;
  if (draft.agents.claude) {
    state.onboardingStep = "claude";
    renderFirstRunOnboarding();
    return;
  }

  void saveOnboardingDraft({ completed: true, runClaudeConnect: false });
}

async function finishFirstRunOnboarding() {
  const draft = normalizedOnboardingDraft();
  const runClaudeConnect =
    draft.agents.claude &&
    draft.claudeSources.cli &&
    !draft.claudeSources.desktop;

  await saveOnboardingDraft({ completed: true, runClaudeConnect });
}

async function saveOnboardingDraft(options = {}) {
  const draft = normalizedOnboardingDraft();
  const preferences = {
    ...draft,
    completed: options.completed === true
  };

  state.onboardingSaveStatus = {
    kind: "pending",
    message: tx("Saving setup choices...", "正在保存设置选择...")
  };
  renderFirstRunOnboarding();

  try {
    state.onboardingPreferences =
      await saveFirstRunOnboardingPreferences(preferences);
    state.onboardingDraft = onboardingDraftFromPreferences(
      state.onboardingPreferences
    );
    state.onboardingSaveStatus = undefined;

    if (options.runClaudeConnect) {
      await runClaudeAutoSetup({ installIfMissing: false });
    } else {
      render();
    }
  } catch (error) {
    state.onboardingSaveStatus = {
      kind: "warning",
      message: tx("Could not save setup choices.", "无法保存设置选择。"),
      detail: error instanceof Error ? error.message : String(error)
    };
    renderFirstRunOnboarding();
  }
}

function normalizedOnboardingDraft() {
  const draft =
    state.onboardingDraft ??
    onboardingDraftFromPreferences(state.onboardingPreferences);
  const claudeSources = normalizeClaudeSources(
    draft,
    defaultOnboardingPreferences().claudeSources
  );

  return {
    agents: {
      claude: draft.agents.claude !== false,
      codex: draft.agents.codex !== false
    },
    claudeSources,
    claudeSource: claudeSources.desktop ? "desktop" : "cli"
  };
}

function renderFirstRunOnboarding() {
  if (!elements.onboardingRoot) {
    return;
  }

  const preferences =
    state.onboardingPreferences ?? defaultOnboardingPreferences();

  if (preferences.completed) {
    elements.onboardingRoot.hidden = true;
    elements.onboardingRoot.innerHTML = "";
    return;
  }

  const draft = normalizedOnboardingDraft();
  const step = state.onboardingStep === "claude" ? "claude" : "agents";
  elements.onboardingRoot.hidden = false;
  elements.onboardingRoot.innerHTML = `
    <div class="modal-backdrop" aria-hidden="true"></div>
    <section class="first-run-modal" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
      <div class="first-run-modal-header">
        <div>
          <p>${escapeHtml(tx("First launch", "首次打开"))}</p>
          <h2 id="first-run-title">${escapeHtml(
            step === "claude"
              ? tx("How do you use Claude?", "你怎么使用 Claude？")
              : tx("Which agents do you use?", "你使用哪些 Agent？")
          )}</h2>
          <p class="first-run-modal-lede">${escapeHtml(
            step === "claude"
              ? tx(
                  "You can pick both. If Desktop is checked, AIQD shows that one by default.",
                  "两个都可以选；如果勾选了 Desktop，AIQD 会默认显示它。"
                )
              : tx(
                  "AIQD will only show the agents you choose. You can change this later in Settings.",
                  "AIQD 只显示你选择的 Agent；以后可以在设置里改。"
                )
          )}</p>
        </div>
      </div>
      ${
        step === "claude"
          ? renderOnboardingClaudeStep(draft)
          : renderOnboardingAgentStep(draft)
      }
      ${renderOnboardingSaveStatus()}
    </section>
  `;
}

function renderOnboardingAgentStep(draft) {
  const canContinue = draft.agents.codex || draft.agents.claude;

  return `
    <div class="first-run-modal-body">
      <label class="onboarding-choice-row">
        <input type="checkbox" data-onboarding-agent="codex" ${
          draft.agents.codex ? "checked" : ""
        } />
        <span>
          <strong>Codex</strong>
          <small>${escapeHtml(
            tx(
              "Show Codex's remaining quota.",
              "显示 Codex 的剩余额度。"
            )
          )}</small>
        </span>
      </label>
      <label class="onboarding-choice-row">
        <input type="checkbox" data-onboarding-agent="claude" ${
          draft.agents.claude ? "checked" : ""
        } />
        <span>
          <strong>Claude</strong>
          <small>${escapeHtml(
            tx(
              "Show Claude's remaining quota. You'll pick Desktop or CLI next.",
              "显示 Claude 的剩余额度，下一步选择用 Desktop 还是 CLI。"
            )
          )}</small>
        </span>
      </label>
    </div>
    <div class="first-run-modal-actions">
      <button class="button" type="button" data-onboarding-later>${escapeHtml(
        tx("Later", "稍后")
      )}</button>
      <button class="button primary-button" type="button" data-onboarding-next ${
        canContinue ? "" : "disabled"
      }>${escapeHtml(
        draft.agents.claude ? tx("Continue", "继续") : tx("Finish", "完成")
      )}</button>
    </div>
  `;
}

function renderOnboardingClaudeStep(draft) {
  const sources = draft.claudeSources;
  const canFinish = sources.desktop || sources.cli;

  return `
    <div class="first-run-modal-body">
      <div class="onboarding-source-grid">
        <label class="onboarding-source-card ${sources.desktop ? "selected" : ""}">
          <input
            type="checkbox"
            data-onboarding-claude-source="desktop"
            ${sources.desktop ? "checked" : ""}
          />
          <span class="onboarding-source-copy">
            <strong>Claude Desktop</strong>
            <small>${escapeHtml(
              tx(
                "Recommended. No setup: AIQD reads Claude Desktop's local usage file after you use it once.",
                "推荐。无需设置：使用一次 Claude Desktop 后，AIQD 会读取它的本地用量文件。"
              )
            )}</small>
          </span>
        </label>
        <label class="onboarding-source-card ${sources.cli ? "selected" : ""}">
          <input
            type="checkbox"
            data-onboarding-claude-source="cli"
            ${sources.cli ? "checked" : ""}
          />
          <span class="onboarding-source-copy">
            <strong>Claude Code CLI</strong>
            <small>${escapeHtml(
              tx(
                "Optional. Check this if you use Claude Code in a terminal.",
                "可选。如果你在终端里用 Claude Code，勾选这个。"
              )
            )}</small>
          </span>
        </label>
      </div>
    </div>
    <div class="first-run-modal-actions">
      <button class="button" type="button" data-onboarding-back>${escapeHtml(
        tx("Back", "返回")
      )}</button>
      <button class="button primary-button" type="button" data-onboarding-finish ${
        canFinish ? "" : "disabled"
      }>${escapeHtml(
        tx("Finish", "完成")
      )}</button>
    </div>
  `;
}

function renderOnboardingSaveStatus() {
  if (!state.onboardingSaveStatus) {
    return "";
  }

  return `
    <div class="first-run-modal-status ${escapeHtml(
      state.onboardingSaveStatus.kind
    )}">
      <strong>${escapeHtml(state.onboardingSaveStatus.message)}</strong>
      ${
        state.onboardingSaveStatus.detail
          ? `<span>${escapeHtml(state.onboardingSaveStatus.detail)}</span>`
          : ""
      }
    </div>
  `;
}

function render() {
  applyStaticTranslations();
  elements.lastRefresh.textContent = tx("Last refresh: {time}", "上次刷新：{time}", {
    time: formatRelative(state.generatedAt)
  });
  renderRefreshStatus();
  renderTopbarStartupControl();
  syncTopbarActionWidths();
  renderAgents();
  renderResets();
  renderEvents();
  renderDoctorChecklist();
  renderDoctor();
  renderRefreshRuns();
  renderRealDataOverview();
  renderCodexSnapshotSettings();
  renderSettings();
  renderAgentPreferencesSettings();
  renderCodexResetCreditReminderSettings();
  renderDesktopStartupSettings();
  renderDashboardCloseSettings();
  renderPathSettings();
  renderDesktopShortcutsSettings();
  renderFirstRunOnboarding();
  arrangeSettingsPanels();
  scheduleStatuslineWatch();
}

function syncTopbarActionWidths() {
  const actions = document.querySelector(".topbar-actions");
  const primary = document.querySelector(".topbar-primary-actions");
  const startup = elements.topbarStartupControl;

  if (!actions || !primary || !startup) {
    return;
  }

  startup.style.width = `${primary.getBoundingClientRect().width}px`;
}

window.addEventListener("resize", syncTopbarActionWidths);

function arrangeSettingsPanels() {
  const container = elements.settingsView;

  if (!container) {
    return;
  }

  const setupPanels = [
    elements.realDataPanel,
    elements.codexConnectionPanel,
    elements.claudeConnectionPanel
  ].filter(Boolean);
  const preferencePanels = [
    elements.startupPanel,
    elements.advancedSettingsPanel
  ].filter(Boolean);
  const setupComplete = state.trialReadiness?.ok === true;
  const orderedPanels = setupComplete
    ? [...preferencePanels, ...setupPanels]
    : [...setupPanels, ...preferencePanels];

  for (const panel of orderedPanels) {
    container.appendChild(panel);
    panel.classList.toggle("is-demoted", setupComplete && setupPanels.includes(panel));
  }

  elements.realDataPanel?.classList.toggle(
    "is-hidden-by-onboarding",
    state.onboardingPreferences?.completed === true
  );
  elements.codexConnectionPanel?.classList.toggle(
    "is-hidden-by-onboarding",
    !shouldShowAgentFamily("codex")
  );
  elements.claudeConnectionPanel?.classList.toggle(
    "is-hidden-by-onboarding",
    !shouldShowAgentFamily("claude")
  );
}

async function runRefresh(successMessage) {
  if (elements.refreshButton.disabled) {
    return undefined;
  }

  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = tx("Refreshing", "刷新中");
  state.refreshStatus = {
    kind: "pending",
    message: tx("Refreshing local quota sources.", "正在刷新本地额度来源。")
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
      "No Claude data yet. Run the highlighted command, then check again.",
      "还没收到 Claude 数据。运行高亮命令后再检查。"
    )
  };
  state.refreshStatus = state.claudeCheckFeedback;
  render();
}

async function runClaudeAutoSetup(options = {}) {
  if (state.claudeAutoSetupPending) {
    return;
  }

  const installIfMissing = options.installIfMissing === true;

  state.claudeAutoSetupMode = installIfMissing ? "install" : "connect";
  state.claudeAutoSetupPending = true;
  state.claudeAutoSetupResult = undefined;
  state.claudeCheckFeedback = undefined;
  state.refreshStatus = {
    kind: "pending",
    message: installIfMissing
      ? tx(
          "Installing Claude Code CLI, then connecting local quota capture. Keep this page open.",
          "正在安装 Claude Code CLI，并接入本地额度采集。请保持页面打开。"
        )
      : tx(
          "Connecting Claude Code. Keep this page open; this can take a minute.",
          "正在接入 Claude Code。请保持页面打开，这可能需要一分钟。"
        )
  };
  render();

  try {
    const response = await fetch("/api/setup/claude-auto", {
      body: JSON.stringify({ installIfMissing }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.error ??
          tx("Claude Code automatic setup failed.", "Claude Code 自动设置失败。")
      );
    }

    state.claudeAutoSetupResult = payload.result;
    state.setupStatus = payload.status;
    state.refreshStatus = {
      detail: formatClaudeAutoSetupDetail(payload.result),
      kind:
        payload.result?.ok && !payload.result?.needsUserAction
          ? "success"
          : "warning",
      message:
        payload.result?.nextAction ??
        tx("Claude Code setup finished.", "Claude Code 设置已完成。")
    };
    await load();
  } catch (error) {
    state.claudeAutoSetupResult = {
      ok: false,
      needsUserAction: true,
      nextAction: tx(
        "Review the error, then try again.",
        "查看错误后再试一次。"
      ),
      steps: [
        {
          detail: error instanceof Error ? error.message : String(error),
          id: "claude-cli",
          label: "Claude Code CLI",
          message: tx(
            "Automatic setup could not start.",
            "自动设置无法启动。"
          ),
          state: "fail"
        }
      ]
    };
    state.refreshStatus = {
      detail: error instanceof Error ? error.message : String(error),
      kind: "error",
      message: tx(
        "Claude Code automatic setup failed.",
        "Claude Code 自动设置失败。"
      )
    };
  } finally {
    state.claudeAutoSetupMode = undefined;
    state.claudeAutoSetupPending = false;
    render();
  }
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
  if (!shouldShowClaudeCliWorkflow()) {
    return false;
  }

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
  const displayAgents = buildDisplayAgents(filterAgentsByOnboarding(state.agents));

  if (displayAgents.length === 0) {
    elements.agentGrid.innerHTML = `<p class="empty">${escapeHtml(
      tx("No agents configured.", "尚未配置 Agent。")
    )}</p>`;
    return;
  }

  elements.agentGrid.innerHTML = displayAgents.map(renderAgentCard).join("");
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

// The dashboard shows one Claude card, not two: Claude Code CLI and Claude
// Desktop report the same underlying account, so showing both side by side
// reads as duplicate/contradictory data. AIQD auto-picks whichever source is
// actually usable right now; Doctor and Settings still show each source's
// own status separately for troubleshooting.
function buildDisplayAgents(agents) {
  return sharedBuildDisplayAgents(
    agents,
    sharedPreferredClaudeDashboardSource(state.onboardingPreferences)
  );
}

function renderAgentCard(agent) {
  const primary = dashboardPrimarySnapshot(agent);
  const status = agent.status ?? "unknown";
  const subscriptionTier = agentSubscriptionTier(agent);
  const source = primary
    ? sourceLabel(primary.source)
    : tx("Unavailable", "不可用");
  const quotaSummary = isStaleSnapshot(primary)
    ? renderStaleQuotaSummary(agent, primary)
    : renderPrimaryQuotaSummary(primary, status);

  return `
    <article class="agent-card">
      <div class="agent-card-header">
        <div>
          <h3 class="agent-name">${escapeHtml(agent.displayName)}</h3>
          <p class="agent-provider">
            <span>${escapeHtml(agent.provider)}</span>
            ${
              subscriptionTier
                ? `<span class="agent-plan">${escapeHtml(subscriptionTier)}</span>`
                : ""
            }
          </p>
        </div>
        <span class="badge ${status}">${escapeHtml(statusLabel(status))}</span>
      </div>

      ${quotaSummary}

      <div class="quota-lines">
        ${renderSnapshotLines(agent, primary)}
        ${renderCodexResetCreditPanel(agent)}
        <div class="quota-line">
          <span class="label">${escapeHtml(tx("Source", "来源"))}</span>
          <span class="value">${escapeHtml(source)}</span>
        </div>
        ${primary ? renderObservedLine(primary) : ""}
      </div>
    </article>
  `;
}

function dashboardPrimarySnapshot(agent) {
  const snapshots = agent.snapshots ?? [];
  return (
    snapshots.find((snapshot) => snapshot.windowType === "session_5h") ??
    snapshots.find((snapshot) => snapshot.windowType === "weekly") ??
    agent.primarySnapshot
  );
}

function renderPrimaryQuotaSummary(primary, status) {
  const remaining = formatRemaining(primary);
  const meterValue = snapshotMeterValue(primary);
  const remainingLabel = primaryRemainingLabel(primary);

  return `
    <div>
      <div
        class="remaining-wrap"
        title="${escapeHtml(
          tx(
            "AIQD shows remaining quota. Some official pages show used quota.",
            "AIQD 显示剩余额度；有些官方页面显示已用额度。"
          )
        )}"
      >
        <div class="remaining">${remaining}</div>
        <div class="remaining-label">${escapeHtml(remainingLabel)}</div>
      </div>
      <div class="meter" aria-hidden="true">
        <div
          class="meter-fill ${escapeHtml(primaryMeterClass(primary, status))}"
          style="--value: ${meterValue}%"
        ></div>
      </div>
      ${primary ? renderPrimaryQuotaMeta(primary) : ""}
    </div>
  `;
}

function renderStaleQuotaSummary(agent, snapshot) {
  const reset = snapshot.resetAt
    ? tx("It reported a reset {time}.", "它报告的重置时间是 {time}。", {
        time: formatRelative(snapshot.resetAt)
      })
    : tx("It did not report a reset time.", "它没有报告重置时间。");
  const source = sourceLabel(snapshot.source);
  // Based on the snapshot's own source, not agent.agent: the dashboard merges
  // Claude Code and Claude Desktop into one "claude" card (see
  // buildDisplayAgents), so agent.agent is no longer specific enough here.
  const isClaudeCode = snapshot.source === "official_statusline";
  const isClaudeDesktop =
    agent.provider === "anthropic" && snapshot.source === "local_quota_snapshot";
  const isCodex = agent.agent === "codex";
  const isMergedClaude = agent.agent === "claude" && agent.provider === "anthropic";
  const detail = isClaudeCode && isMergedClaude
    ? tx(
        "This is not zero quota. AIQD just has old Claude Code data; opening Claude Desktop once can replace it with fresh data.",
        "这不是额度用完。只是 AIQD 手上的 Claude Code 数据比较旧了；打开一次 Claude Desktop，就能换成更新的数据。"
      )
    : isClaudeCode
    ? tx(
        "This is not zero quota. AIQD just has old Claude Code data.",
        "这不是额度用完。只是 AIQD 手上的 Claude Code 数据比较旧了。"
      )
    : isCodex
      ? tx(
          "This is not zero quota. The last Codex CLI record is too old to use.",
          "这不是额度用完。上一条 Codex CLI 记录已经过旧，不能继续使用。"
        )
    : isClaudeDesktop
      ? tx(
          "This is not zero quota. AIQD only has an old Claude Desktop usage sample.",
          "这不是额度用完。AIQD 只剩一条旧的 Claude Desktop 用量样本。"
        )
      : tx(
          "This is not zero quota. The last local quota snapshot is past its reported reset time.",
          "这不是额度用完。上一条本地额度快照已经超过它报告的重置时间。"
        );
  const action = isClaudeCode && isMergedClaude
    ? tx(
        "Open Claude Desktop and use it once, then refresh AIQD. Claude Code is optional.",
        "打开 Claude Desktop 并使用一次，然后刷新 AIQD。Claude Code 只是可选来源。"
      )
    : isClaudeCode
    ? tx(
        "Open Claude Code once, then refresh AIQD.",
        "打开一次 Claude Code，然后刷新 AIQD。"
      )
    : isCodex
      ? tx(
          "Use Codex once so it records fresh quota data, then click Refresh.",
          "请先使用一次 Codex，让它记录最新额度数据，然后再点击“刷新”。"
        )
    : isClaudeDesktop
      ? tx(
          "Open Claude Desktop so it records a new usage sample, then refresh AIQD.",
          "打开 Claude Desktop，让它记录一次新的用量样本，然后刷新 AIQD。"
        )
      : tx(
          "Refresh the source or record a new visible quota value.",
          "刷新额度来源，或重新记录一次可见额度。"
        );

  return `
    <div class="stale-quota-state">
      <div class="stale-quota-copy">
        <strong>${escapeHtml(tx("Needs fresh data", "需要新数据"))}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
      <div class="stale-quota-facts" aria-label="${escapeHtml(
        tx("Expired observation details", "过期观测详情")
      )}">
        <span>${escapeHtml(tx("Last source", "上次来源"))}</span>
        <strong>${escapeHtml(source)}</strong>
        <span>${escapeHtml(tx("Reported reset", "报告的重置时间"))}</span>
        <strong>${escapeHtml(reset)}</strong>
      </div>
      <p class="stale-quota-action">${escapeHtml(action)}</p>
    </div>
  `;
}

function renderCodexResetCreditPanel(agent) {
  if (agent.provider !== "openai" || agent.agent !== "codex") {
    return "";
  }

  const reminder = codexResetCreditReminderState(
    agent.resetCredits,
    state.codexResetCreditReminderPreferences
  );
  const credits = reminder.credits;
  const statusClass = reminder.withinReminder ? "warning" : "healthy";
  const summary = credits.length > 0
    ? tx("{count} available", "可用 {count} 次", { count: credits.length })
    : tx("No local data", "本地未发现数据");
  const next = reminder.nextCredit
    ? tx("Next expires {time}", "最近到期：{time}", {
        time: formatTimestamp(reminder.nextCredit.expiresAt)
      })
    : tx("No local reset-credit source", "本地未发现重置额度来源");

  return `
    <section class="reset-credit-panel ${escapeHtml(statusClass)}">
      <div class="reset-credit-header">
        <div>
          <strong>${escapeHtml(tx("Reset credits", "重置额度"))}</strong>
          <span>${escapeHtml(next)}</span>
        </div>
        <span class="badge ${escapeHtml(statusClass)}">${escapeHtml(summary)}</span>
      </div>
      ${
        reminder.withinReminder
          ? `<div class="reset-credit-warning">${escapeHtml(
              tx(
                "{count} reset credit{plural} expire soon.",
                "{count} 个重置额度即将到期。",
                {
                  count: countCreditsWithinReminder(reminder),
                  plural: countCreditsWithinReminder(reminder) === 1 ? "" : "s"
                }
              )
            )}</div>`
          : ""
      }
      ${
        credits.length > 0
          ? `<div class="reset-credit-list">${credits
              .map(renderCodexResetCreditRow)
              .join("")}</div>`
          : `<p class="reset-credit-empty">${escapeHtml(
              tx(
                "AIQD has not found local Codex reset-credit data yet. Open or refresh a Codex task that can read usage limits, then refresh AIQD.",
                "AIQD 还没有找到本地 Codex 重置额度数据。打开或刷新一次能读取使用限额的 Codex 任务后，再刷新 AIQD。"
              )
            )}</p>`
      }
    </section>
  `;
}

function renderCodexResetCreditRow(credit) {
  return `
    <div class="reset-credit-row">
      <span>${escapeHtml(resetCreditTitle(credit))}</span>
      <time datetime="${escapeHtml(credit.expiresAt)}">${escapeHtml(
        tx("Expires {time}", "{time} 到期", {
          time: formatTimestamp(credit.expiresAt, { long: true })
        })
      )}</time>
    </div>
  `;
}

function resetCreditTitle(credit) {
  if (credit.title === "Full reset") {
    return tx("Full reset", "完全重置");
  }

  return credit.title ?? tx("Reset credit", "重置额度");
}

function renderObservedLine(snapshot) {
  return `
    <div class="quota-line">
      <span class="label">${escapeHtml(tx("Updated", "更新时间"))}</span>
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
      staleReasonLabel(snapshot)
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

function staleReasonLabel(snapshot) {
  return sharedStaleReasonLabel(snapshot, tx);
}

function renderSnapshotLines(agent, primary) {
  const snapshots = agent.snapshots;

  if (!snapshots || snapshots.length === 0) {
    const emptyState = agent.emptyState;
    const action =
      emptyState?.action ??
      tx(
        "Open Diagnostics for source checks and refresh history.",
        "打开诊断查看额度来源检查和刷新历史。"
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

  const windowOrder = new Map([
    ["session_5h", 0],
    ["weekly", 1]
  ]);

  return [...snapshots]
    .filter((snapshot) => !isSameSnapshot(snapshot, primary))
    .sort(
      (left, right) =>
        (windowOrder.get(left.windowType) ?? 2) -
        (windowOrder.get(right.windowType) ?? 2)
    )
    .map((snapshot) =>
      renderQuotaWindowRow(snapshot, {
        showMeter: !isStaleSnapshot(snapshot)
      })
    )
    .join("");
}

function renderPrimaryQuotaMeta(snapshot) {
  const used = formatUsed(snapshot);
  const reset = snapshot.resetAt
    ? tx("Reset {time}", "{time}重置", {
        time: formatRelative(snapshot.resetAt)
      })
    : tx("No reported reset", "未报告重置时间");
  const resetAbsolute = snapshot.resetAt ? formatTimestamp(snapshot.resetAt) : "";

  return `
    <div class="primary-quota-meta">
      ${
        used
          ? `<span>${escapeHtml(
              tx("{amount} used", "已用 {amount}", { amount: used })
            )}</span>`
          : "<span></span>"
      }
      <span>${escapeHtml(reset)}</span>
      ${
        resetAbsolute
          ? `<time datetime="${escapeHtml(snapshot.resetAt)}">${escapeHtml(
              resetAbsolute
            )}</time>`
          : "<span></span>"
      }
    </div>
  `;
}

function renderQuotaWindowRow(snapshot, options = {}) {
  const remaining = formatRemainingText(snapshot);
  const isStale = isStaleSnapshot(snapshot);
  const used = formatUsed(snapshot);
  const reset = snapshot.resetAt
    ? tx("Reset {time}", "{time}重置", {
        time: formatRelative(snapshot.resetAt)
      })
    : tx("No reported reset", "未报告重置时间");
  const resetAbsolute = snapshot.resetAt ? formatTimestamp(snapshot.resetAt) : "";

  return `
    <div
      class="quota-window-row ${escapeHtml(snapshotMeterClass(snapshot))}"
      title="${escapeHtml(
        tx("{window} quota window", "{window}额度窗口", {
          window: windowLabel(snapshot.windowType)
        })
      )}"
    >
      <div class="quota-window-heading">
        <span class="quota-window-name">${escapeHtml(windowLabel(snapshot.windowType))}</span>
        <strong class="quota-window-remaining">${escapeHtml(
          isStale
            ? tx("needs refresh", "需要刷新")
            : tx("{amount} remaining", "剩余 {amount}", {
                amount: remaining
              })
        )}</strong>
      </div>
      ${options.showMeter ? renderSnapshotMeter(snapshot) : ""}
      <div class="quota-window-meta">
        ${
          used
            ? `<span>${escapeHtml(
                tx("{amount} used", "已用 {amount}", { amount: used })
              )}</span>`
            : ""
        }
        <span>${escapeHtml(reset)}</span>
        ${
          resetAbsolute
            ? `<time datetime="${escapeHtml(snapshot.resetAt)}">${escapeHtml(
                resetAbsolute
              )}</time>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderSnapshotMeter(snapshot) {
  if (!hasSnapshotMeterValue(snapshot)) {
    return "";
  }

  return `
    <div
      class="quota-window-meter"
      title="${escapeHtml(
        tx("{window} remaining quota", "{window}剩余额度", {
          window: windowLabel(snapshot.windowType)
        })
      )}"
      aria-hidden="true"
    >
      <div
        class="quota-window-meter-fill ${escapeHtml(snapshotMeterClass(snapshot))}"
        style="--value: ${snapshotMeterValue(snapshot)}%"
      ></div>
    </div>
  `;
}

function primaryRemainingLabel(snapshot) {
  if (!snapshot) {
    return tx("remaining", "剩余");
  }

  return tx("{window} remaining", "{window}剩余", {
    window: windowLabel(snapshot.windowType)
  });
}

function formatRemainingText(snapshot) {
  if (!snapshot) {
    return "--";
  }

  if (typeof snapshot.remainingPercent === "number") {
    return `${Math.round(snapshot.remainingPercent)}%`;
  }

  if (typeof snapshot.remaining === "number") {
    return `${compactNumber(snapshot.remaining)} ${snapshot.unit ?? ""}`.trim();
  }

  return `-- ${snapshot.unit ?? ""}`.trim();
}

function renderResets() {
  const snapshots = buildDisplayAgents(filterAgentsByOnboarding(state.agents))
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
      tx("No reset data.", "还没有重置数据。")
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
  const checks = filterDoctorChecksByOnboarding(state.doctorChecks);

  if (checks.length === 0) {
    elements.doctorList.innerHTML = `<p class="empty">${escapeHtml(
      tx("No doctor checks yet.", "还没有诊断检查。")
    )}</p>`;
    return;
  }

  elements.doctorList.innerHTML = groupDoctorChecks(checks)
    .map(renderDoctorGroup)
    .join("");
}

function filterDoctorChecksByOnboarding(checks) {
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
  const hasIssue = items.some(
    (item) => item.state === "warn" || item.state === "fail"
  );
  const sourceItems = items.filter((item) => item.countsTowardReady);
  const allReady =
    sourceItems.length > 0 && sourceItems.every((item) => item.state === "pass");

  if (elements.doctorChecklistScore) {
    elements.doctorChecklistScore.textContent = hasIssue
      ? tx("Needs attention", "需要处理")
      : allReady
        ? tx("All connected", "都已连接")
        : tx("Setting up", "设置中");
    elements.doctorChecklistScore.className = `badge ${
      hasIssue ? "warning" : allReady ? "healthy" : "stale"
    }`;
  }

  elements.doctorChecklist.innerHTML = `
    <div class="setup-overview-list doctor-checklist-list">
      ${items.map(renderDoctorChecklistItem).join("")}
    </div>
  `;
}

function buildDoctorChecklistItems() {
  const items = [];

  if (shouldShowAgentFamily("codex")) {
    items.push(buildDoctorCodexChecklistItem());
  }

  if (shouldShowAgentFamily("claude")) {
    items.push(buildDoctorClaudeChecklistItem());
  }

  items.push(buildDoctorRefreshChecklistItem());

  return items;
}

// One row per app: silent when connected, one line explaining the fix when
// it is not. Detailed per-field diagnostics live in Settings and the
// technical report below, not repeated here.
function buildDoctorCodexChecklistItem() {
  const item = buildCodexOverviewItem();
  const ready = item.state === "pass";

  return {
    actionLabel: tx("Settings", "设置"),
    actionView: "settings",
    badgeText: ready
      ? tx("Connected", "已连接")
      : item.state === "warn"
        ? tx("Needs attention", "需要处理")
        : tx("Waiting", "等待中"),
    countsTowardReady: true,
    label: "Codex",
    state: item.state,
    statusLine: ready ? "" : item.nextAction,
    target: "#codex-snapshot-content"
  };
}

function buildDoctorClaudeChecklistItem() {
  const showCli = shouldShowClaudeCliWorkflow();
  const showDesktop = shouldShowClaudeDesktopWorkflow();
  const desktopItem = showDesktop ? buildClaudeDesktopOverviewItem() : undefined;
  const cliItem = showCli ? buildClaudeOverviewItem() : undefined;
  const desktopReady = desktopItem?.state === "pass";
  const cliReady = cliItem?.state === "pass";
  const ready = desktopReady || cliReady;
  const primary = desktopReady ? desktopItem : cliReady ? cliItem : desktopItem ?? cliItem;

  return {
    actionLabel: tx("Settings", "设置"),
    actionView: "settings",
    badgeText: ready
      ? tx("Connected", "已连接")
      : primary?.state === "warn"
        ? tx("Needs attention", "需要处理")
        : tx("Waiting", "等待中"),
    countsTowardReady: true,
    label: "Claude",
    state: primary?.state ?? "info",
    statusLine: ready
      ? desktopReady
        ? tx("Via Claude Desktop", "通过 Claude Desktop")
        : tx("Via Claude Code CLI", "通过 Claude Code CLI")
      : (primary?.nextAction ?? ""),
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
      badgeText: tx("Not run yet", "尚未运行"),
      countsTowardReady: false,
      label: tx("Last refresh", "上次刷新"),
      refreshAction: true,
      state: "info",
      statusLine: tx(
        "Set up at least one app above, then refresh.",
        "先设置好上面至少一个来源，然后刷新。"
      )
    };
  }

  const hasErrors = (latestRun.errors?.length ?? 0) > 0;

  return {
    actionLabel: hasErrors ? tx("View details", "查看详情") : tx("Refresh now", "立即刷新"),
    actionView: hasErrors ? "doctor" : undefined,
    badgeText: hasErrors
      ? tx("Needs attention", "需要处理")
      : formatRelative(latestRun.observedAt),
    countsTowardReady: false,
    label: tx("Last refresh", "上次刷新"),
    refreshAction: !hasErrors,
    state: hasErrors ? "warn" : "pass",
    statusLine: hasErrors
      ? tx(
          "{count} app(s) had a problem. Review the errors below.",
          "{count} 个来源出了问题，请查看下面的错误详情。",
          { count: latestRun.errors.length }
        )
      : "",
    target: hasErrors ? "#refresh-run-list" : undefined
  };
}

function renderDoctorChecklistItem(item) {
  return `
    <div class="setup-overview-row doctor-checklist-row">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        ${item.statusLine ? `<div class="settings-detail">${escapeHtml(item.statusLine)}</div>` : ""}
      </div>
      <div class="setup-overview-actions doctor-checklist-actions">
        <span class="badge ${doctorBadgeClass(item.state)}">${escapeHtml(item.badgeText)}</span>
        ${item.refreshAction || item.state !== "pass" ? renderDoctorChecklistAction(item) : ""}
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
    tx("{count} reset events", "{count} 条重置事件", {
      count: run.resetEventsSaved
    }),
    tx("{count} adapters", "{count} 个适配器", { count: run.adapterCount })
  ].join(" / ");
}

function renderEvents() {
  if (state.resetEvents.length === 0) {
    elements.eventList.innerHTML = `<p class="empty">${escapeHtml(
      tx("No reset changes observed yet.", "还没有观测到重置变化。")
    )}</p>`;
    return;
  }

  elements.eventList.innerHTML = state.resetEvents
    .slice(0, 5)
    .map(
      (event) => `
        <div class="event-row">
          <strong>${escapeHtml(eventAgentDisplayName(event.agent))}</strong>
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
      tx("Codex status unavailable.", "Codex 状态不可用。")
    )}</p>`;
    return;
  }

  if (shouldKeepActiveCodexSnapshotForm()) {
    return;
  }

  const autoDetected = isAutoCodexSnapshot(getCodexPrimarySnapshot());
  const manualReady = status.readiness === "ready";
  const ready = autoDetected || manualReady;
  const needsAttention =
    status.readiness === "expired" || status.readiness === "needs_attention";
  const showForm = false;

  elements.codexSnapshotContent.innerHTML = `
    ${renderCodexStatusRow({ ready, needsAttention })}
    ${showForm ? renderCodexSnapshotForm(status) : ""}

    ${renderAdvancedDetails(
      tx("Codex technical details", "Codex 技术细节"),
      `
        ${
          ready
            ? `<p class="panel-note">${escapeHtml(
                tx(
                  "You can still enter a value by hand if this ever looks wrong.",
                  "如果这个数值看起来不对，你也可以在这里手动填写覆盖。"
                )
              )}</p>`
            : ""
        }
        <div class="settings-list">
          ${settingsRow(
            tx("Fallback file", "兜底文件"),
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
              tx("Refresh to detect Codex CLI quota; use the fallback only if needed.", "刷新以检测 Codex CLI 额度；只有需要时才使用兜底。"),
            codexSnapshotBadgeClass(status.readiness),
            statusLabel(status.readiness ?? "unknown")
          )}
          ${renderSetupChecks(status.checks)}
        </div>

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

function renderCodexStatusRow({ ready, needsAttention }) {
  const badgeText = ready
    ? tx("Connected", "已连接")
    : needsAttention
      ? tx("Needs attention", "需要处理")
      : tx("Waiting", "等待中");
  const detail = ready
    ? ""
    : needsAttention
      ? tx(
          "Use Codex once, then refresh. If nothing shows up, fill in the form below.",
          "先用一次 Codex，然后刷新；还是没有就填下面的表单。"
        )
      : tx("Use Codex once, then refresh.", "先用一次 Codex，然后刷新。");

  return `
    <div class="setup-watch-notice">
      <div class="settings-detail">${detail ? escapeHtml(detail) : ""}</div>
      <span class="badge ${
        ready ? "healthy" : needsAttention ? "warning" : "stale"
      }">${escapeHtml(badgeText)}</span>
    </div>
  `;
}

function renderRealDataOverview() {
  const items = buildRealDataOverviewItems();
  const readiness = state.trialReadiness;
  const sourceItems = items.filter((item) => item.countsTowardReady);
  const readyCount = sourceItems.filter((item) => item.state === "pass").length;
  const totalCount = sourceItems.length;
  const ready = readiness ? readiness.ok : readyCount === totalCount;

  if (elements.realDataScore) {
    elements.realDataScore.textContent = ready
      ? tx("ready", "就绪")
      : tx("not ready", "未就绪");
    elements.realDataScore.className = `badge ${ready ? "healthy" : "warning"}`;
  }

  if (!elements.realDataContent) {
    return;
  }

  elements.realDataContent.innerHTML = renderInitialSetupFlow(items, readiness);
}

function renderInitialSetupFlow(items, readiness) {
  const model = buildInitialSetupModel(items, readiness);
  const detailTarget = state.setupDetailTarget;

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
            "Complete these steps once. For Claude, either the Claude Code CLI or Claude Desktop is enough — you do not need both.",
            "按下面步骤做一次。对于 Claude，Claude Code CLI 或 Claude Desktop 任选其一即可，不需要都设置。"
          )
        )}</p>
      </div>
      ${renderSetupQuickChoices(detailTarget)}
      ${renderSelectedSetupDetails(model, detailTarget)}
    </div>
  `;
}

function renderSetupQuickChoices(activeTarget) {
  const showCodex = shouldShowAgentFamily("codex");
  const showClaudeCli = shouldShowClaudeCliWorkflow();
  const showClaudeDesktop = shouldShowClaudeDesktopWorkflow();

  return `
    <div class="setup-choice-row" aria-label="${escapeHtml(
      tx("Choose a setup source", "选择要设置的数据来源")
    )}">
      ${
        showCodex
          ? `<button
              class="copy-button setup-choice-button ${activeTarget === "codex" ? "is-active" : ""}"
              type="button"
              data-setup-detail-toggle="codex"
              aria-expanded="${activeTarget === "codex" ? "true" : "false"}"
            >
              ${escapeHtml(
                activeTarget === "codex"
                  ? tx("Hide Codex", "收起 Codex")
                  : tx("Set up Codex", "设置 Codex")
              )}
            </button>`
          : ""
      }
      ${
        showClaudeCli
          ? `<button
              class="copy-button setup-choice-button ${activeTarget === "claude-code" ? "is-active" : ""}"
              type="button"
              data-setup-detail-toggle="claude-code"
              aria-expanded="${activeTarget === "claude-code" ? "true" : "false"}"
            >
              ${escapeHtml(
                activeTarget === "claude-code"
                  ? tx("Hide Claude Code CLI", "收起 Claude Code CLI")
                  : tx("Set up Claude Code CLI", "设置 Claude Code CLI")
              )}
            </button>`
          : ""
      }
      ${
        showClaudeDesktop
          ? `<button
              class="copy-button setup-choice-button ${activeTarget === "claude-desktop" ? "is-active" : ""}"
              type="button"
              data-setup-detail-toggle="claude-desktop"
              aria-expanded="${activeTarget === "claude-desktop" ? "true" : "false"}"
            >
              ${escapeHtml(
                activeTarget === "claude-desktop"
                  ? tx("Hide Claude Desktop", "收起 Claude Desktop")
                  : tx("Check Claude Desktop", "检查 Claude Desktop")
              )}
            </button>`
          : ""
      }
    </div>
  `;
}

function renderSelectedSetupDetails(model, detailTarget) {
  if (!detailTarget) {
    return "";
  }

  const selectedStep = model.steps.find((step) => step.id === detailTarget);

  if (!selectedStep) {
    return "";
  }

  return `
    <div class="setup-detail-panel">
      ${renderSetupCurrentAction(model, selectedStep)}
      <div class="guided-step-list is-selected">
        ${renderGuidedStep(selectedStep)}
      </div>
    </div>
  `;
}

function buildInitialSetupModel(items, readiness) {
  const codex = items.find((item) => item.id === "codex");
  const claude = items.find((item) => item.id === "claude-code");
  const claudeDesktop = items.find((item) => item.id === "claude-desktop");
  const codexComplete = codex?.state === "pass";
  // CLI-specific readiness (not the combined "either source" state from
  // buildClaudeOverviewItem), so this step's own copy stays honest about
  // whether the CLI itself is connected.
  const claudeComplete = state.setupStatus?.readiness === "ready";
  const claudeDesktopComplete = claudeDesktop?.state === "pass";
  const showClaudeCli = shouldShowClaudeCliWorkflow();
  const showClaudeDesktop = shouldShowClaudeDesktopWorkflow();
  const codexRequired = shouldShowAgentFamily("codex");
  const claudeRequired = shouldShowAgentFamily("claude");
  const codexSatisfied = !codexRequired || codexComplete;
  const claudeSatisfied =
    !claudeRequired ||
    (showClaudeCli && claudeComplete) ||
    (showClaudeDesktop && claudeDesktopComplete);
  const selectedSourcesSatisfied = codexSatisfied && claudeSatisfied;
  const claudeDesktopIsRequiredSlot =
    showClaudeDesktop && (!showClaudeCli || (claudeDesktopComplete && !claudeComplete));
  const claudeManaged = Boolean(state.setupStatus?.statusLineManagedByApp);
  const claudeWaiting = claudeManaged && !claudeComplete;
  const claudeCliAvailable = Boolean(state.setupStatus?.claudeCliAvailable);
  const claudeCliOnPath = state.setupStatus?.claudeCliOnPath !== false;
  const claudeAutoSetupPending = Boolean(state.claudeAutoSetupPending);
  const claudeInstallPending =
    claudeAutoSetupPending && state.claudeAutoSetupMode === "install";
  const claudeMissingRateLimits =
    state.setupStatus?.latestIssueCode === "missing_rate_limits";
  const claudeInputIssue =
    state.setupStatus?.latestIssueCode === "empty_input" ||
    state.setupStatus?.latestIssueCode === "invalid_json";
  const claudeConnectedWithoutQuota =
    claudeMissingRateLimits || claudeInputIssue;
  const localTerminal = localTerminalName(state.setupStatus?.hostPlatform);
  const claudeCliOpenCommand =
    state.setupStatus?.claudeCliOpenCommand ??
    "Set-Location -LiteralPath 'C:\\path\\to\\your-project'\nclaude";
  const claudeCliExampleProjectOpenCommand =
    state.setupStatus?.claudeCliExampleProjectOpenCommand ??
    claudeCliOpenCommand;
  const claudeCliInstallCommand =
    state.setupStatus?.claudeCliInstallCommand ??
    "winget install Anthropic.ClaudeCode";
  const canInstallClaude =
    !claudeComplete &&
    !claudeCliAvailable &&
    canAutoInstallClaudeCli(state.setupStatus);
  const canConnectClaude = !claudeComplete && !claudeManaged;
  const claudeSetupAction = canInstallClaude
    ? "install"
    : canConnectClaude
      ? "connect"
      : undefined;
  const canAutoSetupClaude = Boolean(claudeSetupAction);
  const claudeCliHelper = claudeWaiting
    ? {
        autoSetupPending: claudeAutoSetupPending,
        autoSetupResult: state.claudeAutoSetupResult,
        detail: claudeCliAvailable
          ? claudeCliOnPath
            ? tx(
                "Use this one button. It opens Claude Code from {terminal}.",
                "只用这个复制按钮。它会从{terminal}打开 Claude Code。",
                { terminal: localTerminal }
              )
            : tx(
                "Use this one button. It opens your installed Claude Code by full path, so you do not need to change PATH.",
                "只用这个复制按钮。它会用完整路径打开已安装的 Claude Code，不需要你改 PATH。"
              )
          : tx(
              "Install first. A short quiet wait in the terminal can be normal.",
              "先安装。终端短暂没输出是正常的。"
            ),
        primaryCommand: claudeCliAvailable
          ? {
              command: claudeCliExampleProjectOpenCommand,
              copyLabel: tx("Copy command", "复制命令"),
              eyebrow: tx("Command to copy", "要复制的命令"),
              hideCommandText: true,
              title: tx("Terminal command", "终端命令")
            }
          : {
              command: claudeCliInstallCommand,
              copyLabel: tx("Copy command", "复制命令"),
              eyebrow: tx("Command to copy", "要复制的命令"),
              hideCommandText: true,
              title: tx("Install command", "安装命令")
        },
        title: tx("Which command should I copy?", "复制哪一个？")
      }
    : undefined;
  const claudeAutoSetupHelper =
    canAutoSetupClaude
      ? {
          autoSetupPending: claudeAutoSetupPending,
          autoSetupResult: state.claudeAutoSetupResult,
          detail: canInstallClaude
            ? tx(
                "AIQD will run the Windows installer for Claude Code CLI, then write the local quota capture setting.",
                "AIQD 会运行 Windows 安装器安装 Claude Code CLI，然后写入本地额度采集设置。"
              )
            : tx(
                "AIQD will write the local Claude Code data setting. It will not install anything in this step.",
                "AIQD 会写入本地 Claude Code 数据设置。这一步不会安装任何东西。"
              ),
          title: canInstallClaude
            ? tx(
                "Install and connect Claude Code",
                "安装并接入 Claude Code"
              )
            : tx(
                "Connect Claude Code data",
                "接入 Claude Code 数据"
              )
        }
      : undefined;
  const claudeMissingRateLimitsHelper =
    claudeConnectedWithoutQuota
      ? {
          detail: tx(
            claudeInputIssue
              ? "AIQD receiver ran, but did not receive Claude session JSON."
              : "Claude is connected to AIQD, but this status update did not include quota fields.",
            claudeInputIssue
              ? "AIQD 接收器运行了，但没有收到 Claude session JSON。"
              : "Claude 已经连到 AIQD，但这次状态更新里没有额度字段。"
          ),
          title: tx("What should I do now?", "现在做什么？")
        }
      : undefined;
  const claudeWaitingNotice =
    state.claudeCheckFeedback ??
    (claudeWaiting
      ? {
          detail: claudeInputIssue
            ? tx(
                "Use the project command to open Claude Code; do not run the internal statusline command manually.",
                "请用项目命令打开 Claude Code；不要手动运行内部 statusline 命令。"
              )
            : claudeMissingRateLimits
            ? tx(
                "Claude already called AIQD, but did not include quota fields in this update.",
                "Claude 已经调用 AIQD，但这次更新里没有包含额度字段。"
              )
            : claudeCliAvailable
            ? tx(
                "If Claude is already open and the bottom line says waiting for rate limit data, send one short message and wait for Claude to reply.",
                "如果 Claude 已经打开，且底部显示 waiting for rate limit data，请发一条短消息，并等 Claude 回复完成。"
              )
            : tx(
                "Install Claude Code first, then come back to this step.",
                "先安装 Claude Code，然后回到这一步。"
              ),
          kind: "warning",
          message: claudeCliAvailable
            ? claudeMissingRateLimits
              ? tx(
                  "Claude is connected, but no quota fields were included yet.",
                  "Claude 已连接，但还没有额度字段。"
                )
              : claudeInputIssue
              ? tx(
                  "AIQD receiver ran, but did not receive Claude session JSON.",
                  "AIQD 接收器运行了，但没有收到 Claude session JSON。"
                )
              : claudeCliOnPath
              ? tx(
                  "No Claude data yet.",
                  "还没收到 Claude 数据。"
                )
              : tx(
                  "No Claude data yet. Use the full-path command below.",
                  "还没收到 Claude 数据。请运行下面的完整路径命令。"
                )
            : tx(
                "Claude command not found. Run the install command below first.",
                "还没找到 Claude 命令。先运行下面的安装命令。"
              )
        }
      : undefined);
  const readinessComplete = Boolean(readiness?.ok) || selectedSourcesSatisfied;
  const steps = [
    {
      actionLabel: codexComplete
        ? tx("Review Codex", "查看 Codex")
        : tx("Refresh Codex", "刷新检测 Codex"),
      actionTitle: tx(
        "Detect Codex CLI quota automatically",
        "自动检测 Codex CLI 额度"
      ),
      checklist: [
        tx(
          "Use Codex once, or keep the current Codex CLI session active.",
          "先使用一次 Codex，或保持当前 Codex CLI 会话打开。"
        ),
        tx(
          "Click Refresh so AIQD scans local Codex session rate_limits.",
          "点击刷新，让 AIQD 扫描本地 Codex session rate_limits。"
        ),
        tx(
          "Use Codex once, then refresh again if no CLI quota appears.",
          "请先使用一次 Codex，然后再次刷新；如果仍没有额度数据，请查看诊断信息。"
        )
      ],
      complete: codexComplete,
      detail: tx(
        "AIQD reads supported rate_limits from local Codex CLI session logs.",
        "AIQD 会从本地 Codex CLI session 日志自动读取支持的 rate_limits。"
      ),
      id: "codex",
      number: "1",
      outcome: tx(
        "If rate_limits are found, the dashboard will show Codex as Official CLI. If not, use Codex once and refresh again.",
        "如果读到 rate_limits，仪表盘会把 Codex 显示为官方 CLI；如果没有读到，请先使用一次 Codex 再刷新。"
      ),
      progressDetail: codexComplete
        ? buildCodexDoneDetail(codex)
        : tx("Waiting for Codex CLI quota detection.", "等待 Codex CLI 额度检测。"),
      refreshAction: !codexComplete,
        secondaryActionLabel: undefined,
      secondaryTarget: undefined,
      status: codexComplete
        ? tx("Done", "已完成")
        : codex?.status ?? tx("Waiting for Codex data", "等待 Codex 数据"),
      target: "#codex-snapshot-content",
      title: tx("Codex CLI detection", "Codex CLI 检测"),
      why: tx(
        "Automatic local detection avoids copying numbers by hand. The fallback remains clearly labeled when Codex does not expose usable data locally.",
        "自动本地检测可以避免手抄数字；只有 Codex 本地没有暴露可用数据时，兜底才会出现并明确标注。"
      )
    },
    {
      actionLabel: claudeComplete
        ? tx("Review Claude", "查看 Claude")
        : canAutoSetupClaude
          ? claudeAutoSetupPending
            ? claudeInstallPending
              ? tx("Installing Claude", "正在安装 Claude")
              : tx("Connecting Claude", "正在接入 Claude")
            : canInstallClaude
              ? tx(
                  "Install Claude Code CLI",
                  "安装 Claude Code CLI"
                )
              : tx(
                  "Connect Claude data",
                  "接入 Claude 数据"
                )
        : claudeManaged
          ? tx("Check now", "立即检查")
          : tx("Open Claude setup", "打开 Claude 设置"),
      actionTitle: canAutoSetupClaude
        ? canInstallClaude
          ? tx(
              "Install Claude Code CLI",
              "安装 Claude Code CLI"
            )
          : tx(
              "Connect Claude Code data",
              "接入 Claude Code 数据"
            )
        : claudeManaged
        ? tx(
            claudeConnectedWithoutQuota
              ? "Ask Claude to refresh quota status"
              : "Paste the command into a terminal",
            claudeConnectedWithoutQuota
              ? "让 Claude 刷新额度状态"
              : "把命令粘贴到终端"
          )
        : tx("Turn on Claude Code data capture", "启用 Claude Code 数据接入"),
      checklist: canAutoSetupClaude
        ? canInstallClaude
          ? [
              tx(
                "Click the install button.",
                "点击安装按钮。"
              ),
              tx(
                "Approve Windows installer prompts if they appear.",
                "如果 Windows 弹出安装确认，请按提示确认。"
              ),
              tx(
                "When it finishes, open Claude Code and send one short message.",
                "完成后打开 Claude Code，并发送一条短消息。"
              )
            ]
          : [
              tx(
                "Click the connect button.",
                "点击接入按钮。"
              ),
              tx(
                "Wait for the button to finish.",
                "等按钮处理完成。"
              ),
              tx(
                "Then open Claude Code and send one short message.",
                "然后打开 Claude Code，并发送一条短消息。"
              )
            ]
        : claudeManaged
        ? claudeConnectedWithoutQuota
          ? [
              tx(
                "Keep the current Claude window open.",
                "保持当前 Claude 窗口打开。"
              ),
              tx(
                "Send one short message, such as hi.",
                "发一条短消息，比如 hi。"
              ),
              tx(
                "Wait for Claude to finish replying.",
                "等 Claude 回复完成。"
              ),
              tx(
                "Come back here and click check.",
                "回到这里点检查。"
              )
            ]
          : claudeCliAvailable
          ? [
              tx(
                "Click the Copy command button below.",
                "点击下面的“复制命令”按钮。"
              ),
              tx(
                "Paste it into {terminal}, then press Enter.",
                "粘贴到{terminal}，然后按 Enter。",
                { terminal: localTerminal }
              ),
              tx(
                "Finish Claude's own prompts, such as theme, login, or project trust.",
                "先完成 Claude 自己的提示，比如主题、登录或信任项目。"
              ),
              tx(
                "Send one short message and wait for Claude to finish replying.",
                "发一条短消息，并等 Claude 回复完成。"
              ),
              tx(
                "Come back here and click check.",
                "回到这里点检查。"
              )
            ]
          : [
              tx(
                "Click Copy command below.",
                "点击下面的“复制命令”。"
              ),
              tx(
                "Open {terminal}; paste and press Enter.",
                "打开{terminal}，粘贴后按 Enter。",
                { terminal: localTerminal }
              ),
              tx(
                "When the prompt returns, come back and click check.",
                "提示符回来后，回到这里点检查。"
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
      detail: canAutoSetupClaude
        ? canInstallClaude
          ? tx(
              "This installs Claude Code CLI with Windows package manager and writes the local setting AIQD needs for quota data.",
              "这会通过 Windows 包管理器安装 Claude Code CLI，并写入 AIQD 读取额度数据需要的本地设置。"
            )
          : tx(
              "This writes a local setting so Claude Code can send quota data to AIQD.",
              "这会写入本地设置，让 Claude Code 能把额度数据发给 AIQD。"
            )
        : claudeManaged
        ? tx(
            claudeConnectedWithoutQuota
              ? "Claude is connected. Send one short message and wait for the reply, then check again."
              : "Open Claude from the terminal. After Claude is ready for input, send one short message and wait for the reply, then check.",
            claudeConnectedWithoutQuota
              ? "Claude 已连接。发一条短消息，等回复完成后再检查。"
              : "从终端打开 Claude。等 Claude 可以输入后，发一条短消息，等回复完成后再检查。"
          )
        : tx(
            "Review the generated command, then install the local statusline hook only if you approve it.",
            "先检查生成的命令；只有你确认后才安装本地 statusline hook。"
      ),
      id: "claude-code",
      optional: claudeDesktopIsRequiredSlot,
      helper: claudeAutoSetupHelper ?? claudeMissingRateLimitsHelper ?? claudeCliHelper,
      number: "2",
      outcome: tx(
        "When data is received, this step becomes done and the next step verifies the dashboard.",
        "收到数据后，这一步会变成完成，下一步会验证仪表盘。"
      ),
      progressDetail: claudeComplete
        ? tx("Claude Code quota data received.", "已收到 Claude Code 额度数据。")
        : claudeAutoSetupPending
          ? claudeInstallPending
            ? tx(
                "AIQD is installing Claude Code CLI.",
                "AIQD 正在安装 Claude Code CLI。"
              )
            : tx(
                "AIQD is writing Claude Code settings.",
                "AIQD 正在写入 Claude Code 设置。"
              )
        : claudeManaged
          ? tx(
              claudeConnectedWithoutQuota
                ? "Claude connected; waiting for quota fields."
                : "Waiting for Claude to send quota fields.",
              claudeConnectedWithoutQuota
                ? "Claude 已连接，等待额度字段。"
                : "等待 Claude 发送额度字段。"
            )
          : tx("Setup is not enabled yet.", "尚未启用设置。"),
      claudeAutoSetupAction: claudeSetupAction,
      claudeCheckAction: claudeWaiting && !canAutoSetupClaude,
      disabled: claudeAutoSetupPending,
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
      actionLabel: claudeDesktopComplete
        ? tx("Review Claude Desktop", "查看 Claude Desktop")
        : tx("Refresh Claude Desktop", "刷新检测 Claude Desktop"),
      actionTitle: tx(
        "Detect Claude Desktop usage automatically",
        "自动检测 Claude Desktop 用量"
      ),
      checklist: [
        tx(
          "Open Claude Desktop and use it normally.",
          "正常打开并使用 Claude Desktop。"
        ),
        tx(
          "AIQD reads its local usage history file automatically; nothing to install.",
          "AIQD 会自动读取它的本地用量历史文件，不需要安装任何东西。"
        )
      ],
      complete: claudeDesktopComplete,
      detail:
        claudeDesktop?.detail ??
        tx(
          "AIQD reads Claude Desktop's local plan-usage-history.json automatically.",
          "AIQD 会自动读取 Claude Desktop 本地的 plan-usage-history.json。"
        ),
      id: "claude-desktop",
      number: "2b",
      optional: !claudeDesktopIsRequiredSlot,
      outcome: tx(
        "This is an optional alternative to the Claude Code CLI step above; you only need one of the two working.",
        "这是上面 Claude Code CLI 步骤的可选替代方案，两者只需要满足一个。"
      ),
      progressDetail: claudeDesktopComplete
        ? tx("Claude Desktop usage data received.", "已收到 Claude Desktop 用量数据。")
        : tx(
            "Waiting for a fresh Claude Desktop usage sample.",
            "等待 Claude Desktop 记录新的用量样本。"
          ),
      refreshAction: !claudeDesktopComplete,
      status: claudeDesktopComplete
        ? tx("Done", "已完成")
        : claudeDesktop?.status ?? tx("Waiting for Claude Desktop data", "等待 Claude Desktop 数据"),
      target: "#settings-content",
      title: tx("Claude Desktop (optional alternative)", "Claude Desktop（可选替代）"),
      why: tx(
        "If you would rather not install the Claude Code CLI, Claude Desktop's local usage history file works as a no-install alternative.",
        "如果不想安装 Claude Code CLI，Claude Desktop 本地的用量历史文件可以作为免安装的替代方案。"
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
          "Make sure each selected quota source shows done.",
          "确认每个已选择的额度来源都显示完成。"
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
        "Refresh once selected sources are ready. This confirms the dashboard is using real, non-demo data.",
        "已选择的来源就绪后刷新检查，确认仪表盘使用的是真实、非 demo 数据。"
      ),
      id: "verify",
      number: "3",
      outcome: tx(
        "After it passes, the dashboard can show real remaining quota and reset dates.",
        "通过后，仪表盘会显示真实剩余额度和重置日期。"
      ),
      progressDetail: readinessComplete
        ? tx("Real-data check passed.", "真实数据检查已通过。")
        : selectedSourcesSatisfied
          ? tx("Ready to run the final check.", "可以运行最后检查。")
          : tx(
              "Locked until selected quota sources are ready.",
              "等已选择的额度来源就绪后再进行。"
            ),
      refreshAction: !readinessComplete,
      status: readinessComplete
        ? tx("Ready for trial", "可以开始试用")
        : selectedSourcesSatisfied
          ? tx("Ready to verify", "可以验证")
          : tx("Finish selected sources first", "先完成已选择的来源"),
      target: "#real-data-content",
      title: tx("Verify dashboard", "验证仪表盘"),
      why: tx(
        "The final check prevents stale or demo data from looking trustworthy.",
        "最后检查可以避免过期数据或 demo 数据看起来像可信真实额度。"
      )
    }
  ];
  const visibleSteps = steps.filter((step) => {
    if (step.id === "codex") {
      return shouldShowAgentFamily("codex");
    }

    if (step.id === "claude-code") {
      return shouldShowClaudeCliWorkflow();
    }

    if (step.id === "claude-desktop") {
      return shouldShowClaudeDesktopWorkflow();
    }

    return true;
  });
  const requiredSteps = visibleSteps.filter((step) => !step.optional);
  const currentStep =
    requiredSteps.find((step) => !step.complete) ??
    requiredSteps[requiredSteps.length - 1];

  for (const step of visibleSteps) {
    step.current = step === currentStep && !step.complete;
    step.state = step.complete ? "pass" : step.current ? "warn" : "info";
  }

  const completedCount = requiredSteps.filter((step) => step.complete).length;

  return {
    completedCount,
    currentStep,
    remainingCount: requiredSteps.length - completedCount,
    steps: visibleSteps,
    totalCount: requiredSteps.length
  };
}

function buildCodexDoneDetail(codex) {
  return codex?.detail ?? tx("Codex value is saved.", "Codex 额度已保存。");
}

function localTerminalName(platform) {
  const normalized = String(platform ?? "").toLowerCase();

  if (normalized === "win32") {
    return tx(
      "PowerShell or Windows Terminal",
      "PowerShell 或 Windows Terminal"
    );
  }

  if (normalized === "darwin") {
    return tx("Terminal on macOS", "macOS 的“终端”");
  }

  if (normalized === "linux") {
    return tx("your Linux terminal", "你的 Linux 终端");
  }

  return tx("your system terminal", "你的系统终端");
}

function renderSetupCurrentAction(model, selectedStep) {
  const step = selectedStep ?? model.currentStep;
  const showingSelectedStep = Boolean(selectedStep);
  const allDone = model.completedCount === model.totalCount && !showingSelectedStep;
  const remainingLabel = allDone
    ? tx("All steps done", "全部完成")
    : tx("{count} step(s) left", "还剩 {count} 步", {
        count: model.remainingCount
      });
  const stepComplete = Boolean(step.complete);

  return `
    <section class="current-step-panel ${allDone || stepComplete ? "complete" : ""}">
      <div class="current-step-copy">
        <span class="guide-kicker">${escapeHtml(
          allDone
            ? tx("Ready", "已就绪")
            : showingSelectedStep
              ? tx("Setup details", "设置详情")
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
            : stepComplete
              ? `<p>${escapeHtml(step.progressDetail ?? step.detail)}</p>`
              : renderActionChecklist(step.checklist)
        }
        ${allDone || stepComplete ? "" : renderStepHelper(step.helper)}
        ${allDone || stepComplete ? "" : renderStepNotice(step.notice)}
        <p class="outcome-note">${escapeHtml(
          allDone
            ? tx(
                "Result: you can now read real quota and reset dates.",
                "结果：现在可以查看真实额度和重置日期。"
              )
            : stepComplete
              ? tx("Status: {status}", "状态：{status}", {
                  status: step.status
                })
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
      ${renderClaudeAutoSetupResult(
        helper.autoSetupResult,
        helper.autoSetupPending
      )}
      ${renderStepHelperMethods(helper.methods)}
      ${renderStepHelperPrimaryCommand(helper.primaryCommand)}
      ${renderStepHelperTip(helper.tip)}
      ${renderStepHelperSecondaryCommands(
        helper.secondaryCommands,
        helper.secondarySummary
      )}
    </div>
  `;
}

function renderClaudeAutoSetupResult(result, pending) {
  if (pending) {
    const installing = state.claudeAutoSetupMode === "install";

    return `
      <div class="auto-setup-result is-pending">
        <strong>${escapeHtml(
          installing
            ? tx("AIQD is installing Claude Code", "AIQD 正在安装 Claude Code")
            : tx("AIQD is connecting Claude Code", "AIQD 正在接入 Claude Code")
        )}</strong>
        <p>${escapeHtml(
          installing
            ? tx(
                "Keep this page open. Windows may show installer prompts before AIQD connects local quota capture.",
                "请保持页面打开。Windows 可能会先显示安装提示，然后 AIQD 会接入本地额度采集。"
              )
            : tx(
                "Keep this page open. Writing the local statusline setting can take a little while.",
                "请保持页面打开。写入本地 statusline 设置可能需要一点时间。"
              )
        )}</p>
      </div>
    `;
  }

  if (!result) {
    return "";
  }

  const finishedWithoutAction = Boolean(result.ok && !result.needsUserAction);
  const headerTitle = !result.ok
    ? tx("Claude setup needs attention", "Claude 设置需要处理")
    : result.needsUserAction
      ? tx("Claude setup needs one more step", "Claude 设置还差一步")
      : tx("Claude setup finished", "Claude 设置已完成");

  return `
    <div class="auto-setup-result ${
      finishedWithoutAction ? "is-ok" : "has-error"
    }">
      <div class="auto-setup-result-header">
        <strong>${escapeHtml(headerTitle)}</strong>
        <span class="badge ${
          finishedWithoutAction ? "healthy" : "warning"
        }">${escapeHtml(
          finishedWithoutAction
            ? tx("Done", "完成")
            : tx("Action needed", "需要处理")
        )}</span>
      </div>
      <div class="auto-setup-step-list">
        ${(result.steps ?? []).map(renderClaudeAutoSetupStep).join("")}
      </div>
      <p>${escapeHtml(localizedClaudeAutoNextAction(result.nextAction))}</p>
    </div>
  `;
}

function renderClaudeAutoSetupStep(step) {
  return `
    <div class="auto-setup-step">
      <span class="badge ${claudeAutoStepBadgeClass(step.state)}">${escapeHtml(
        claudeAutoStepStateLabel(step.state)
      )}</span>
      <div>
        <strong>${escapeHtml(claudeAutoStepTitle(step))}</strong>
        <p>${escapeHtml(claudeAutoStepMessage(step))}</p>
        ${renderClaudeAutoSetupTechnicalDetails(step)}
      </div>
    </div>
  `;
}

function renderClaudeAutoSetupTechnicalDetails(step) {
  if (!step.command && !step.detail) {
    return "";
  }

  return `
    <details class="auto-setup-technical">
      <summary>${escapeHtml(tx("Technical details", "技术详情"))}</summary>
      ${step.command ? renderInlineCommand(step.command) : ""}
      ${step.detail ? `<pre>${escapeHtml(step.detail)}</pre>` : ""}
    </details>
  `;
}

function claudeAutoStepBadgeClass(stateValue) {
  if (stateValue === "pass" || stateValue === "skip") {
    return "healthy";
  }

  if (stateValue === "fail") {
    return "critical";
  }

  return "warning";
}

function claudeAutoStepStateLabel(stateValue) {
  const labels = {
    fail: tx("Failed", "失败"),
    pass: tx("Done", "完成"),
    skip: tx("Skipped", "跳过"),
    warn: tx("Check", "检查")
  };

  return labels[stateValue] ?? stateValue;
}

function claudeAutoStepTitle(step) {
  const labels = {
    "claude-cli": tx("Claude Code CLI", "Claude Code CLI"),
    statusline: tx("Local usage capture", "本地用量采集")
  };

  return labels[step.id] ?? step.label;
}

function claudeAutoStepMessage(step) {
  if (currentLanguage !== "zh") {
    return step.message;
  }

  const messages = {
    "claude-cli:fail": "Claude Code CLI 自动安装失败。",
    "claude-cli:pass": "Claude Code CLI 安装器已经运行完成。",
    "claude-cli:skip": "已找到 claude 命令，不需要安装。",
    "claude-cli:warn": "当前平台不能安全自动安装，请按页面上的命令手动处理。",
    "statusline:fail": "AIQD 没能给 Claude Code 设置本地用量采集。",
    "statusline:pass": "AIQD 本地用量采集已经安装。",
    "statusline:skip": "这一步已跳过。",
    "statusline:warn": "检测到 Claude Code 已经有自定义设置，AIQD 没有自动覆盖。"
  };

  return messages[`${step.id}:${step.state}`] ?? step.message;
}

function localizedClaudeAutoNextAction(action) {
  if (!action || currentLanguage !== "zh") {
    return action;
  }

  if (action.includes("Claude Code CLI is still missing")) {
    return "AIQD 已接入本地额度采集，但还没有检测到 Claude Code CLI。请先安装 Claude Code CLI，然后打开一次 Claude Code。";
  }

  if (action.includes("Open Claude Code from a terminal once")) {
    return "本地设置已完成。接下来只需要从终端打开一次 Claude Code，让它发送额度数据。";
  }

  if (action.includes("cannot see the claude command yet")) {
    return "本地 statusline 设置已完成，但当前 AIQD 进程还没识别到 claude 命令。如果 Claude Code 在你的终端里能打开，请在那里打开一次；必要时重启 AIQD。";
  }

  if (action.includes("Review the warning")) {
    return "请先检查警告；AIQD 不会自动覆盖你已有的 Claude Code 设置。";
  }

  if (action.includes("Review the failed step")) {
    return "请查看失败步骤，然后再试一次。";
  }

  if (action.includes("Refresh the dashboard")) {
    return "Claude Code 额度数据已就绪。刷新仪表盘即可查看。";
  }

  return action;
}

function formatClaudeAutoSetupDetail(result) {
  if (!result) {
    return "";
  }

  return [
    ...(result.steps ?? []).map((step) =>
      [
        `${step.label}: ${step.message}`,
        step.exitCode !== undefined ? `Exit code: ${step.exitCode}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    ),
    result.nextAction
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderStepHelperPrimaryCommand(command) {
  if (!command) {
    return "";
  }

  if (command.hideCommandText) {
    return `
      <div class="step-helper-primary-command is-copy-only">
        <span>${escapeHtml(command.eyebrow)}</span>
        <strong>${escapeHtml(command.title)}</strong>
        ${command.detail ? `<p>${escapeHtml(command.detail)}</p>` : ""}
        <div class="step-helper-copy-row">
          ${renderCopyButton(command.command, command.copyLabel)}
        </div>
        <details class="step-helper-command-details">
          <summary>${escapeHtml(tx("Show command text", "查看命令内容"))}</summary>
          <code>${escapeHtml(command.command)}</code>
        </details>
      </div>
    `;
  }

  return `
    <div class="step-helper-primary-command">
      <span>${escapeHtml(command.eyebrow)}</span>
      <strong>${escapeHtml(command.title)}</strong>
      ${command.detail ? `<p>${escapeHtml(command.detail)}</p>` : ""}
      <div class="step-helper-command">
        <code>${escapeHtml(command.command)}</code>
        ${renderCopyButton(command.command, command.copyLabel)}
      </div>
    </div>
  `;
}

function renderStepHelperTip(tip) {
  if (!tip) {
    return "";
  }

  return `
    <div class="step-helper-tip">
      <strong>${escapeHtml(tip.title)}</strong>
      <p>${escapeHtml(tip.text)}</p>
    </div>
  `;
}

function renderStepHelperSecondaryCommands(commands = [], summary) {
  if (!commands.length) {
    return "";
  }

  return `
    <details class="step-helper-secondary">
      <summary>${escapeHtml(summary ?? tx("More commands", "更多命令"))}</summary>
      <div class="step-helper-commands">
        ${commands
          .map(
            (item) => `
              <div class="step-helper-command has-label">
                <span>${escapeHtml(item.label)}</span>
                <code>${escapeHtml(item.command)}</code>
                ${renderCopyButton(item.command)}
              </div>
            `
          )
          .join("")}
      </div>
    </details>
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
      ${step.disabled ? "disabled" : ""}
      ${
        step.claudeAutoSetupAction
          ? `data-claude-auto-setup-action="${escapeHtml(step.claudeAutoSetupAction)}"`
          : ""
      }
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

function buildRealDataOverviewItems() {
  const items = [];

  if (shouldShowAgentFamily("codex")) {
    items.push(buildCodexOverviewItem());
  }

  if (shouldShowAgentFamily("claude")) {
    if (shouldShowClaudeCliWorkflow()) {
      items.push(buildClaudeOverviewItem());
    }

    if (shouldShowClaudeDesktopWorkflow()) {
      items.push(buildClaudeDesktopOverviewItem());
    }
  }

  items.push(buildPathOverviewItem());

  return items;
}

function findAgent(agentId) {
  return state.agents.find((agent) => agent.agent === agentId);
}

function getCodexPrimarySnapshot() {
  return findAgent("codex")?.primarySnapshot;
}

function isAutoCodexSnapshot(snapshot) {
  return Boolean(isFreshRealSnapshot(snapshot) && snapshot.source !== "manual");
}

function formatSnapshotOverview(snapshot) {
  if (!snapshot) {
    return undefined;
  }

  const parts = [];

  if (typeof snapshot.remainingPercent === "number") {
    parts.push(
      tx("{percent}% remaining", "剩余 {percent}%", {
        percent: Math.round(snapshot.remainingPercent)
      })
    );
  }

  if (snapshot.windowType) {
    parts.push(windowLabel(snapshot.windowType));
  }

  if (snapshot.resetAt) {
    parts.push(
      tx("reset {time}", "重置：{time}", {
        time: formatRelative(snapshot.resetAt)
      })
    );
  }

  if (snapshot.source) {
    parts.push(sourceLabel(snapshot.source));
  }

  return parts.filter(Boolean).join(" / ");
}

function buildCodexOverviewItem() {
  const status = state.codexSnapshotStatus;
  const snapshot = getCodexPrimarySnapshot();
  const autoDetected = isAutoCodexSnapshot(snapshot);
  const manualReady = status?.readiness === "ready";
  const ready = autoDetected || manualReady;
  const needsAttention =
    status?.readiness === "expired" || status?.readiness === "needs_attention";
  const detailParts = [];

  if (snapshot) {
    const snapshotDetail = formatSnapshotOverview(snapshot);

    if (snapshotDetail) {
      detailParts.push(snapshotDetail);
    }
  } else if (typeof status?.latestRemainingPercent === "number") {
    detailParts.push(
      tx("{percent}% remaining", "剩余 {percent}%", {
        percent: Math.round(status.latestRemainingPercent)
      })
    );
  }

  if (status?.latestResetAt) {
    detailParts.push(
      tx("reported reset {time}", "报告重置：{time}", {
        time: formatRelative(status.latestResetAt)
      })
    );
  }

  return {
    actionLabel: tx("Codex details", "Codex 详情"),
    autoDetected,
    command: undefined,
    countsTowardReady: true,
    detail:
      detailParts.length > 0
        ? detailParts.join(" / ")
        : tx(
            "AIQD checks for Codex usage automatically first. The form below is only a backup.",
            "AIQD 会先自动检查 Codex 用量，下面的表单只是备用方式。"
          ),
    id: "codex",
    label: "Codex",
    nextAction: ready
      ? autoDetected
        ? tx(
            "Codex CLI quota was detected automatically.",
            "已自动检测到 Codex CLI 额度。"
          )
        : tx(
            "Codex fallback quota is ready for the dashboard.",
            "Codex 兜底额度已经可用于仪表盘。"
          )
      : needsAttention
        ? tx(
            "Use Codex once, then refresh. If nothing shows up, fill in the form below.",
            "先用一次 Codex，然后刷新；如果还是没有数据，就填写下面的表单。"
          )
        : tx(
            "Refresh to detect your Codex usage automatically, or fill in the form below.",
            "刷新以自动检测 Codex 用量，或者直接填写下面的表单。"
          ),
    state: ready ? "pass" : needsAttention ? "warn" : "info",
    status: autoDetected
      ? tx("Detected automatically", "已自动检测")
      : localizedReadinessLabel(status?.readinessLabel) ??
        tx("Waiting for Codex data", "等待 Codex 数据"),
    target: "#codex-snapshot-content"
  };
}

function buildClaudeOverviewItem() {
  const status = state.setupStatus;
  const cliReady = status?.readiness === "ready";
  const waiting = status?.readiness === "waiting_for_data";
  const desktopReady =
    shouldShowClaudeDesktopWorkflow() &&
    isFreshRealSnapshot(findAgent("claude-desktop")?.primarySnapshot);
  const ready = cliReady || desktopReady;
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

  const coveredByDesktop = desktopReady && !cliReady;

  return {
    actionLabel: tx("Claude details", "Claude 详情"),
    command: undefined,
    countsTowardReady: true,
    detail: coveredByDesktop
      ? tx(
          "Claude Code CLI is not required: AIQD is reading fresh quota from Claude Desktop instead.",
          "不需要 Claude Code CLI：AIQD 正在改用 Claude Desktop 的最新额度数据。"
        )
      : detailParts.length > 0
        ? detailParts.join(" / ")
        : localizedNextAction(status?.nextAction) ??
          tx(
            "Open Claude setup, then install or connect Claude Code from the guided button, or use Claude Desktop instead.",
            "打开 Claude 设置，然后按引导按钮安装或接入 Claude Code，或者改用 Claude Desktop。"
          ),
    id: "claude-code",
    label: "Claude",
    nextAction: coveredByDesktop
      ? tx(
          "Claude Desktop usage was detected automatically; no CLI setup needed.",
          "已自动检测到 Claude Desktop 用量；不需要再设置 CLI。"
        )
      : localizedNextAction(status?.nextAction) ??
        tx(
          "Open Claude setup, then install or connect Claude Code from the guided button, or use Claude Desktop instead.",
          "打开 Claude 设置，然后按引导按钮安装或接入 Claude Code，或者改用 Claude Desktop。"
        ),
    state: ready ? "pass" : waiting ? "info" : "warn",
    status: coveredByDesktop
      ? tx("Ready via Claude Desktop", "已通过 Claude Desktop 就绪")
      : localizedReadinessLabel(status?.readinessLabel) ??
        tx("Setup status unavailable", "设置状态不可用"),
    target: "#settings-content"
  };
}

function buildClaudeDesktopOverviewItem() {
  const agent = findAgent("claude-desktop");
  const snapshot = agent?.primarySnapshot;
  const ready = isFreshRealSnapshot(snapshot);
  const detail = snapshot
    ? formatSnapshotOverview(snapshot)
    : (agent?.emptyState?.detail ??
      tx(
        "AIQD reads Claude Desktop's local usage history file automatically. No install needed.",
        "AIQD 会自动读取 Claude Desktop 本地的用量历史文件；不需要安装任何东西。"
      ));

  return {
    actionLabel: tx("Claude Desktop details", "Claude Desktop 详情"),
    command: undefined,
    countsTowardReady: false,
    detail,
    id: "claude-desktop",
    label: "Claude Desktop",
    nextAction: ready
      ? tx(
          "Claude Desktop usage was detected automatically.",
          "已自动检测到 Claude Desktop 用量。"
        )
      : tx(
          "Open Claude Desktop so it records a new usage sample, then refresh AIQD.",
          "打开 Claude Desktop，让它记录一次新的用量样本，然后刷新 AIQD。"
        ),
    state: ready ? "pass" : "info",
    status: ready
      ? tx("Detected", "已检测")
      : tx("Waiting for Claude Desktop data", "等待 Claude Desktop 数据"),
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
        tx("There's a problem with your file locations.", "文件位置有问题。")
      : configuredCount > 0
        ? tx("{count} custom folder(s) added", "已添加 {count} 个自定义文件夹", {
            count: configuredCount
          })
        : tx("Using the default file locations.", "正在使用默认文件位置。"),
    id: "local-paths",
    label: tx("File locations", "文件位置"),
    nextAction: hasLoadErrors
      ? tx(
          "Fix this before AIQD can use your custom folders.",
          "先修复这个问题，AIQD 才能使用你的自定义文件夹。"
        )
      : tx(
          "Add a custom folder here if AIQD can't find an app's files automatically.",
          "如果 AIQD 找不到某个 App 的文件，可以在这里手动添加文件夹。"
        ),
    state: hasLoadErrors ? "warn" : "pass",
    status: hasLoadErrors ? tx("Needs a look", "需要检查") : tx("Ready", "就绪"),
    target: "#paths-content"
  };
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
    draft?.planLabel ?? tx("Codex manual fallback", "Codex 手动兜底");
  const saveStatus = state.codexSnapshotSaveStatus;

  return `
    <form id="codex-snapshot-form" class="settings-form">
      <div>
        <strong>${escapeHtml(tx("Enter your usage manually", "手动填写用量"))}</strong>
        <div class="settings-detail">${escapeHtml(
          tx(
            "Only needed if AIQD can't detect Codex automatically on this computer.",
            "只有这台电脑上 AIQD 没法自动检测 Codex 时才需要。"
          )
        )}</div>
      </div>
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
                  "Selected quota sources are ready. Open the dashboard and refresh before relying on the numbers.",
                  "已选择的额度来源都已就绪。打开仪表盘，并在依赖数字前刷新一次。"
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
      "Fallback saved; refresh completed with warnings.",
      "兜底已保存；刷新完成但有警告。"
    );
  }

  return tx(
    "Fallback saved; dashboard is ready to check.",
    "兜底已保存；现在可以检查仪表盘。"
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
      tx("Reported reset {time}", "报告重置：{time}", {
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

  if (status.latestSource) {
    parts.push(
      tx("Source {source}", "来源 {source}", { source: sourceLabel(status.latestSource) })
    );
  }

  if (status.latestConfidence) {
    parts.push(
      tx("Confidence {confidence}", "可信度 {confidence}", {
        confidence: confidenceLabel(status.latestConfidence)
      })
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
  const showClaudeCli = shouldShowClaudeCliWorkflow();
  const showClaudeDesktop = shouldShowClaudeDesktopWorkflow();

  if (!status) {
    elements.settingsContent.innerHTML = `<p class="empty">${escapeHtml(
      tx("Claude status unavailable.", "Claude 状态不可用。")
    )}</p>`;
    return;
  }

  const desktopAgent = findAgent("claude-desktop");
  const desktopReady = showClaudeDesktop && isFreshRealSnapshot(desktopAgent?.primarySnapshot);
  const cliReady = showClaudeCli && status.readiness === "ready";

  elements.settingsContent.innerHTML = `
    ${renderClaudeStatusRow({
      status,
      showClaudeCli,
      showClaudeDesktop,
      desktopReady,
      cliReady
    })}

    ${renderAdvancedDetails(
      tx("Claude technical details", "Claude 技术细节"),
      `
        ${showClaudeCli ? renderClaudeCliTechnicalDetails(status) : ""}
        ${showClaudeDesktop ? renderClaudeDesktopTechnicalDetails(desktopAgent, desktopReady) : ""}
      `
    )}
  `;
}

// One combined status line for "Claude" as a whole - Claude Code CLI and
// Claude Desktop are alternatives for the same account, not two things to
// separately report on. Desktop needs no install, so it is the message we
// lead with whenever it is being tracked and not yet ready.
function renderClaudeStatusRow({ status, showClaudeCli, showClaudeDesktop, desktopReady, cliReady }) {
  const ready = desktopReady || cliReady;

  if (ready) {
    return `
      <div class="setup-watch-notice">
        <div class="settings-detail">${escapeHtml(
          desktopReady
            ? tx("Via Claude Desktop", "通过 Claude Desktop")
            : tx("Via Claude Code CLI", "通过 Claude Code CLI")
        )}</div>
        <span class="badge healthy">${escapeHtml(tx("Connected", "已连接"))}</span>
      </div>
    `;
  }

  if (showClaudeDesktop) {
    return `
      <div class="setup-watch-notice">
        <div class="settings-detail">${escapeHtml(
          tx("Open Claude Desktop once, then refresh.", "打开一次 Claude Desktop，然后刷新。")
        )}</div>
        <span class="badge stale">${escapeHtml(tx("Waiting", "等待中"))}</span>
      </div>
    `;
  }

  if (showClaudeCli) {
    return renderClaudeCliStatusRow(status);
  }

  return "";
}

function renderClaudeCliStatusRow(status) {
  const needsSetup = !status.statusLineManagedByApp || !status.shimExists;
  const missingRateLimits = status.latestIssueCode === "missing_rate_limits";
  const inputIssue =
    status.latestIssueCode === "empty_input" || status.latestIssueCode === "invalid_json";

  const detail = needsSetup
    ? localizedNextAction(status.nextAction) ??
      tx("Install or connect Claude Code below.", "在下面安装或接入 Claude Code。")
    : inputIssue
      ? tx(
          "Open Claude Code, send one short message, and wait for the reply.",
          "打开 Claude Code，发一条短消息，等回复完成。"
        )
      : missingRateLimits
        ? tx(
            "Claude is connected; send one short message and wait for the reply.",
            "Claude 已连接；发一条短消息，等回复完成。"
          )
        : tx("Open Claude Code once, then refresh.", "打开一次 Claude Code，然后刷新。");

  return `
    <div class="setup-watch-notice">
      <div class="settings-detail">${escapeHtml(detail)}</div>
      <div class="connection-summary-actions">
        <span class="badge ${needsSetup ? "warning" : "stale"}">${escapeHtml(
          needsSetup ? tx("Needs setup", "需要设置") : tx("Waiting", "等待中")
        )}</span>
        ${renderClaudeConnectionAction(status)}
      </div>
    </div>
  `;
}

function renderClaudeCliTechnicalDetails(status) {
  return `
    ${renderRealDataSteps(status)}
    <div class="settings-list">
      ${settingsRow(
        tx("Claude Code CLI", "Claude Code CLI"),
        status.claudeCliAvailable ? tx("Found", "已找到") : tx("Not found", "未找到"),
        status.claudeCliAvailable
          ? status.claudeCliOnPath === false
            ? tx("Installed at {path}, but not on PATH. AIQD will use the full path.", "已安装在 {path}，但还不在 PATH。AIQD 会使用完整路径。", {
                path: status.claudeCliPath ?? status.claudeCliCommand ?? "claude"
              })
            : status.claudeCliPath ?? status.claudeCliCommand ?? "claude"
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
        formatStatuslineCommandDetail(status),
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
          tx("Open Diagnostics for setup details.", "运行诊断查看设置详情。"),
        readinessBadgeClass(status.readiness),
        statusLabel(status.readiness ?? "unknown")
      )}
      ${renderSetupChecks(status.checks)}
    </div>

    ${renderClaudeMaintenanceCommands(status)}

    ${renderFieldPills(tx("Stored", "已保存"), status.savedFields, "healthy")}
    ${renderFieldPills(tx("Not stored", "未保存"), status.notSavedFields, "stale")}
  `;
}

function renderClaudeDesktopTechnicalDetails(agent, ready) {
  const checks = state.doctorChecks.filter(
    (check) => check.agent === "claude-desktop"
  );
  const pathCheck = checks.find((check) => check.id?.startsWith("claude-desktop:path:"));
  const snapshot = agent?.primarySnapshot;

  return `
    <div class="settings-list">
      ${settingsRow(
        tx("Claude Desktop usage history file", "Claude Desktop 用量历史文件"),
        pathCheck?.status === "pass" ? tx("Found", "已找到") : tx("Not found", "未找到"),
        pathCheck?.detail ?? "%APPDATA%\\Claude\\plan-usage-history.json",
        pathCheck?.status === "pass" ? "healthy" : "stale"
      )}
      ${settingsRow(
        tx("Latest sample", "最新样本"),
        snapshot ? formatRelative(snapshot.observedAt) : tx("None yet", "还没有"),
        snapshot
          ? tx(
              "{percent}% used, confidence {confidence}",
              "已用 {percent}%，可信度 {confidence}",
              {
                percent: Math.round(snapshot.usedPercent ?? 0),
                confidence: confidenceLabel(snapshot.confidence)
              }
            )
          : tx(
              "Open Claude Desktop so it records a new usage sample.",
              "打开 Claude Desktop 让它记录一次新的用量样本。"
            ),
        ready ? "healthy" : "stale"
      )}
    </div>
  `;
}

function renderClaudeConnectionAction(status) {
  if (status.readiness === "ready") {
    return "";
  }

  const setupAction = claudeSetupActionForStatus(status);

  if (setupAction) {
    const label =
      setupAction === "install"
        ? tx("Install Claude Code CLI", "安装 Claude Code CLI")
        : tx("Connect Claude data", "接入 Claude 数据");

    return `
      <button
        class="copy-button"
        type="button"
        data-claude-auto-setup-action="${escapeHtml(setupAction)}"
      >${escapeHtml(label)}</button>
    `;
  }

  if (status.statusLineManagedByApp) {
    return `
      <button class="copy-button" type="button" data-claude-check-action="true">
        ${escapeHtml(tx("Check Claude", "检查 Claude"))}
      </button>
    `;
  }

  return "";
}

function canAutoInstallClaudeCli(status) {
  return Boolean(
    status?.hostPlatform === "win32" && status?.claudeCliInstallMethod === "winget"
  );
}

function claudeSetupActionForStatus(status) {
  if (!status || status.readiness === "ready") {
    return undefined;
  }

  const canInstall = !status.claudeCliAvailable && canAutoInstallClaudeCli(status);

  if (canInstall) {
    return "install";
  }

  if (!status.statusLineManagedByApp) {
    return "connect";
  }

  return undefined;
}

function formatStatuslineCommandDetail(status) {
  if (status.statusLineManagedByApp) {
    return tx(
      "Internal AIQD receiver is installed for Claude Code. Do not copy or run the statusline command manually; open Claude Code from the project command instead.",
      "AIQD 内部接收器已安装给 Claude Code 使用。不要手动复制或运行 statusline 命令；请改用项目命令打开 Claude Code。"
    );
  }

  if (status.statusLineCommand) {
    return status.statusLineCommand;
  }

  return tx("No statusLine command detected", "没有检测到 statusLine 命令");
}

function renderClaudeMaintenanceCommands(status) {
  if (status.statusLineManagedByApp) {
    return `
      <div class="internal-command-note">
        <strong>${escapeHtml(tx("Internal commands hidden", "已隐藏内部命令"))}</strong>
        <p>${escapeHtml(
          tx(
            "AIQD has already written the statusline receiver for Claude Code. These receiver commands are for Claude Code to call automatically, not for manual setup.",
            "AIQD 已经把 statusline 接收器写入 Claude Code 设置。这些接收器命令是给 Claude Code 自动调用的，不是给用户手动设置用的。"
          )
        )}</p>
      </div>
    `;
  }

  return `
    ${renderCommandBlock(tx("Developer preview command", "开发者预览命令"), status.previewCommand)}
    ${renderCommandBlock(tx("Developer setup command", "开发者设置命令"), status.writeCommand)}
  `;
}

function renderRealDataSteps(status) {
  const steps = [
    {
      badge: "1",
      title: tx("Local receiver", "本地额度接收器"),
      detail: status.statusLineManagedByApp
        ? tx(
            "Ready. Claude Code will call it automatically.",
            "已就绪。Claude Code 会自动调用它。"
          )
        : tx(
            "Use the first-run current step above to connect Claude Code.",
            "请使用上方首次运行的当前步骤接入 Claude Code。"
          ),
      state: status.statusLineManagedByApp ? "pass" : "warn"
    },
    {
      badge: "2",
      title: tx("Start Claude from Terminal", "从终端启动 Claude"),
      detail: status.latestHasRateLimits
        ? tx(
            "Claude Code has already sent quota data.",
            "Claude Code 已经发送过额度数据。"
          )
        : status.claudeCliAvailable
          ? tx(
              "Run the command from the current step.",
              "运行当前步骤里的命令。"
            )
          : tx(
              "AIQD cannot see the claude command yet. Install or open Claude Code from your normal terminal, then refresh.",
              "AIQD 还看不到 claude 命令。请先安装或从你平时的终端打开 Claude Code，然后刷新。"
            ),
      state: status.latestHasRateLimits
        ? "pass"
        : status.claudeCliAvailable
          ? "info"
          : "warn"
    },
    {
      badge: "3",
      title: tx("Dashboard data", "仪表盘数据"),
      detail: status.readiness === "ready"
        ? tx(
            "Fresh Claude Code rate limits have been received.",
            "已经收到新鲜的 Claude Code rate limits。"
          )
        : tx(
            "After data arrives, this becomes done.",
            "收到数据后，这里会变成完成。"
          ),
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
                ${step.command ? renderInlineCommand(step.command) : ""}
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
        formatSetupCheckDetail(check),
        doctorBadgeClass(check.status),
        statusLabel(check.status)
      )
    )
    .join("");
}

function formatSetupCheckDetail(check) {
  const detail =
    check.id === "statusline-command" && check.detail?.includes("claude-statusline")
      ? tx(
          "Internal AIQD receiver installed. Do not run this command manually; open Claude Code from a terminal instead.",
          "AIQD 内部接收器已安装。不要手动运行这条命令；请改从终端打开 Claude Code。"
        )
      : check.detail;

  return [detail, check.action].filter(Boolean).join("\n");
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

async function setAgentPreference(agent, checked) {
  if (agent !== "codex" && agent !== "claude") {
    return;
  }

  const current = normalizeOnboardingPreferences(state.onboardingPreferences);
  const next = normalizeOnboardingPreferences({
    ...current,
    agents: {
      ...current.agents,
      [agent]: checked
    },
    completed: true
  });

  if (!next.agents.codex && !next.agents.claude) {
    state.agentPreferencesSaveStatus = {
      kind: "warning",
      message: tx("Keep at least one agent visible.", "至少保留一个 Agent。")
    };
    renderAgentPreferencesSettings();
    return;
  }

  await saveAgentPreferences(next);
}

async function setClaudeSourcePreference(source, checked) {
  if (source !== "desktop" && source !== "cli") {
    return;
  }

  const current = normalizeOnboardingPreferences(state.onboardingPreferences);
  const claudeSources = {
    ...current.claudeSources,
    [source]: checked
  };

  if (!claudeSources.desktop && !claudeSources.cli) {
    claudeSources[source] = true;
    state.agentPreferencesSaveStatus = {
      kind: "warning",
      message: tx(
        "Keep at least one Claude source selected.",
        "至少保留一个 Claude 数据来源。"
      )
    };
    renderAgentPreferencesSettings();
    return;
  }

  await saveAgentPreferences(
    normalizeOnboardingPreferences({
      ...current,
      agents: {
        ...current.agents,
        claude: true
      },
      claudeSources,
      completed: true
    })
  );
}

async function saveAgentPreferences(preferences) {
  state.agentPreferencesSaveStatus = {
    kind: "pending",
    message: tx("Saving preferences...", "正在保存偏好设置...")
  };
  renderAgentPreferencesSettings();

  try {
    state.onboardingPreferences = await saveFirstRunOnboardingPreferences({
      ...preferences,
      completed: true
    });
    state.onboardingDraft = onboardingDraftFromPreferences(
      state.onboardingPreferences
    );
    state.agentPreferencesSaveStatus = {
      kind: "healthy",
      message: tx("Preferences saved.", "偏好设置已保存。")
    };
    render();
  } catch (error) {
    state.agentPreferencesSaveStatus = {
      kind: "warning",
      message: tx("Preferences could not be saved.", "无法保存偏好设置。"),
      detail: error instanceof Error ? error.message : String(error)
    };
    renderAgentPreferencesSettings();
  }
}

function renderAgentPreferencesSettings() {
  if (!elements.agentPreferencesContent) {
    return;
  }

  const preferences = normalizeOnboardingPreferences(state.onboardingPreferences);
  const status = state.agentPreferencesSaveStatus;
  const statusBadgeClass = status?.kind === "pending" ? "warning" : status?.kind;

  elements.agentPreferencesContent.innerHTML = `
    ${renderAgentPreferenceRow({
      checked: preferences.agents.codex,
      detail: tx(
        "Show Codex on the dashboard and in setup.",
        "在仪表盘和设置页显示 Codex。"
      ),
      inputAttribute: 'data-agent-preference-agent="codex"',
      label: "Codex"
    })}
    ${renderAgentPreferenceRow({
      checked: preferences.agents.claude,
      detail: tx(
        "Show Claude on the dashboard and in setup.",
        "在仪表盘和设置页显示 Claude。"
      ),
      inputAttribute: 'data-agent-preference-agent="claude"',
      label: "Claude"
    })}
    ${
      preferences.agents.claude
        ? `<div class="preference-subgroup">
            <div class="preference-section-heading is-subtle">
              <strong>${escapeHtml(tx("Claude sources", "Claude 来源"))}</strong>
              <span>${escapeHtml(
                preferences.claudeSources.desktop
                  ? tx(
                      "Claude Desktop is used by default when checked.",
                      "勾选后，AIQD 默认使用 Claude Desktop。"
                    )
                  : tx(
                      "Claude Code CLI is shown only when Desktop is not selected.",
                      "只有未选择 Desktop 时才显示 Claude Code CLI 主流程。"
                    )
              )}</span>
            </div>
            ${renderAgentPreferenceRow({
              checked: preferences.claudeSources.desktop,
              detail: tx(
                "Automatically reads your usage from Claude Desktop. No setup needed.",
                "自动读取 Claude Desktop 里的用量记录，不用额外设置。"
              ),
              inputAttribute: 'data-agent-preference-claude-source="desktop"',
              label: "Claude Desktop"
            })}
            ${renderAgentPreferenceRow({
              checked: preferences.claudeSources.cli,
              detail: tx(
                "If you use Claude Code in a terminal, check this.",
                "如果你在终端里用 Claude Code，勾选这个。"
              ),
              inputAttribute: 'data-agent-preference-claude-source="cli"',
              label: "Claude Code CLI"
            })}
          </div>`
        : ""
    }
    ${renderPreferenceMessage(status, statusBadgeClass)}
  `;
}

function renderAgentPreferenceRow({ checked, detail, inputAttribute, label }) {
  return `
    <label class="preference-row preference-row-compact">
      <span class="preference-copy">
        <strong>${escapeHtml(label)}</strong>
        <span class="settings-detail">${escapeHtml(detail)}</span>
      </span>
      <span class="preference-control">
        <span class="preference-state ${checked ? "healthy" : "stale"}">${escapeHtml(
          checked ? tx("On", "开启") : tx("Off", "关闭")
        )}</span>
        <input type="checkbox" ${inputAttribute} ${checked ? "checked" : ""} />
        <span class="toggle-switch" aria-hidden="true"></span>
      </span>
    </label>
  `;
}

function loadCodexResetCreditReminderPreferences() {
  try {
    return normalizeCodexResetCreditReminderPreferences(
      JSON.parse(
        window.localStorage?.getItem(codexResetCreditReminderStorageKey) ?? "null"
      )
    );
  } catch {
    return defaultCodexResetCreditReminderPreferences();
  }
}

function setCodexResetCreditReminderPreferences(preferences) {
  const normalized = normalizeCodexResetCreditReminderPreferences(preferences);
  state.codexResetCreditReminderPreferences = normalized;
  window.localStorage?.setItem(
    codexResetCreditReminderStorageKey,
    JSON.stringify(normalized)
  );
  state.codexResetCreditReminderSaveStatus = undefined;
  render();
}

function renderCodexResetCreditReminderSettings() {
  if (!elements.resetCreditReminderContent) {
    return;
  }

  const preferences = state.codexResetCreditReminderPreferences;
  const reminder = codexResetCreditReminderState(
    findCodexAgent()?.resetCredits,
    preferences
  );
  const summary = reminder.count > 0
    ? tx(
        "{count} available. Next expires {time}.",
        "可用 {count} 次。最近到期：{time}。",
        {
          count: reminder.count,
          time: formatTimestamp(reminder.nextCredit?.expiresAt)
        }
      )
    : tx("No available Codex reset credits found.", "当前没有可用的 Codex 重置额度。");
  const reminderDays = normalizeCodexResetCreditReminderPreferences(preferences)
    .daysBefore;
  const options = [1, 3, 7, 14];
  const customDays = reminderDays.find((days) => !options.includes(days));

  elements.resetCreditReminderContent.innerHTML = `
    <div class="preference-row">
      <span class="preference-copy">
        <strong>${escapeHtml(tx("Codex reset credit reminders", "Codex 重置额度提醒"))}</strong>
        <span class="settings-detail">${escapeHtml(summary)}</span>
      </span>
      <label class="preference-control preference-switch-control">
        <span class="preference-state ${preferences.enabled ? "healthy" : "stale"}">${escapeHtml(
          preferences.enabled ? tx("On", "开启") : tx("Off", "关闭")
        )}</span>
        <input
          type="checkbox"
          data-reset-credit-reminder-toggle
          aria-label="${escapeHtml(tx("Remind before Codex reset credits expire", "Codex 重置额度到期前提醒"))}"
          ${preferences.enabled ? "checked" : ""}
        />
        <span class="toggle-switch" aria-hidden="true"></span>
      </label>
    </div>
    <div class="preference-row reset-credit-days-row ${preferences.enabled ? "" : "is-disabled"}">
      <span class="preference-copy">
        <strong>${escapeHtml(tx("Reminder timing", "提醒时间"))}</strong>
      </span>
      <div class="preference-control reset-credit-day-options">
        ${options
          .map((days) =>
            renderResetCreditReminderDayOption(
              days,
              reminderDays.includes(days),
              preferences.enabled
            )
          )
          .join("")}
        ${renderResetCreditCustomDayOption(customDays, preferences.enabled)}
        <button class="button reset-credit-test-notification" type="button" data-test-notification>
          ${escapeHtml(tx("Test notification", "发送测试通知"))}
        </button>
      </div>
    </div>
    ${
      reminder.withinReminder
        ? renderPreferenceMessage({
            kind: "warning",
            message: tx(
              "{count} Codex reset credit{plural} expire soon.",
              "{count} 个 Codex 重置额度即将到期。",
              {
                count: countCreditsWithinReminder(reminder),
                plural: countCreditsWithinReminder(reminder) === 1 ? "" : "s"
              }
            )
          })
        : ""
    }
  `;
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest("[data-test-notification]")) {
    return;
  }
  void window.aiqdDesktop?.showNotification(
    tx("Codex reset credit reminder", "Codex 重置额度提醒"),
    tx(
      "Your Codex reset credit expires in 3 days. Open AIQD to review it.",
      "你的 Codex 重置额度将在 3 天后到期，请打开 AIQD 查看详情。"
    )
  );
});

function renderResetCreditCustomDayOption(days, enabled) {
  return `
    <label class="reset-credit-custom-option ${days ? "is-selected" : ""} ${
      enabled ? "" : "is-disabled"
    }">
      <span>${escapeHtml(tx("Custom", "自定义"))}</span>
      <input
        type="number"
        min="1"
        max="30"
        step="1"
        value="${days ?? 15}"
        data-reset-credit-custom-days
        aria-label="${escapeHtml(tx("Custom reminder days", "自定义提醒天数"))}"
        ${enabled ? "" : "disabled"}
      />
      <span>${escapeHtml(tx("days", "天"))}</span>
    </label>
  `;
}

function renderResetCreditReminderDayOption(days, checked, enabled) {
  const label =
    days === 1
      ? tx("1 day", "1 天")
      : tx("{days} days", "{days} 天", { days });

  return `
    <label class="reset-credit-day-option ${checked ? "is-selected" : ""} ${
      enabled ? "" : "is-disabled"
    }">
      <input
        type="checkbox"
        data-reset-credit-reminder-days
        value="${days}"
        ${checked ? "checked" : ""}
        ${enabled ? "" : "disabled"}
      />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function findCodexAgent() {
  return state.agents.find(
    (agent) => agent.provider === "openai" && agent.agent === "codex"
  );
}

function countCreditsWithinReminder(reminder) {
  const maxDays = Math.max(...reminder.preferences.daysBefore);
  const deadline = Date.now() + maxDays * 86_400_000;

  return reminder.credits.filter(
    (credit) => Date.parse(credit.expiresAt) <= deadline
  ).length;
}

function renderStartupControls() {
  renderTopbarStartupControl();
  renderDesktopStartupSettings();
  renderRealDataOverview();
}

function renderTopbarStartupControl() {
  if (!elements.topbarStartupControl) {
    return;
  }

  const status = state.launchAtStartupStatus;
  const enabled = launchAtStartupDisplayEnabled(status);
  const disabled = launchAtStartupToggleDisabled(status);
  const title = status
    ? launchAtStartupDetail(status)
    : tx("Startup status is loading.", "正在读取开机启动状态。");

  elements.topbarStartupControl.innerHTML = `
    <label
      class="topbar-startup-toggle ${enabled ? "is-on" : ""} ${
        disabled ? "is-disabled" : ""
      }"
      title="${escapeHtml(title)}"
    >
      <span class="topbar-startup-label">${escapeHtml(tx("Startup", "开机启动"))}</span>
      <input
        type="checkbox"
        data-launch-at-startup-toggle
        aria-label="${escapeHtml(tx("Launch AIQD at startup", "开机启动 AIQD"))}"
        ${enabled ? "checked" : ""}
        ${disabled ? "disabled" : ""}
      />
      <span class="topbar-startup-switch" aria-hidden="true"></span>
    </label>
  `;
}

function launchAtStartupDisplayEnabled(status) {
  if (typeof state.launchAtStartupPendingValue === "boolean") {
    return state.launchAtStartupPendingValue;
  }

  return status?.enabled === true;
}

function launchAtStartupToggleDisabled(status) {
  return status?.canConfigure !== true || state.launchAtStartupPending;
}

async function setLaunchAtStartup(enabled) {
  if (state.launchAtStartupPending) {
    return;
  }

  if (!window.aiqdDesktop?.setLaunchAtStartup) {
    state.launchAtStartupSaveStatus = {
      kind: "warning",
      message: tx(
        "Open Settings from the packaged desktop app to change startup.",
        "请从打包后的桌面应用打开 Settings 后再修改启动项。"
      )
    };
    renderStartupControls();
    return;
  }

  state.launchAtStartupPending = true;
  state.launchAtStartupPendingValue = enabled;
  state.launchAtStartupSaveStatus = {
    kind: "pending",
    message: enabled
      ? tx("Enabling startup...", "正在开启开机启动...")
      : tx("Disabling startup...", "正在关闭开机启动...")
  };
  renderStartupControls();

  try {
    state.launchAtStartupStatus = await window.aiqdDesktop.setLaunchAtStartup(
      enabled
    );
    state.launchAtStartupSaveStatus = {
      kind: "healthy",
      message: enabled
        ? tx("AIQD will start in the tray when you sign in.", "AIQD 会在登录系统时从托盘启动。")
        : tx("AIQD startup entry was removed.", "AIQD 的开机启动项已移除。")
    };
  } catch (error) {
    state.launchAtStartupStatus = await loadLaunchAtStartupStatus();
    state.launchAtStartupSaveStatus = {
      kind: "warning",
      message: tx("Startup setting could not be changed.", "无法修改开机启动设置。"),
      detail: error instanceof Error ? error.message : String(error)
    };
  } finally {
    state.launchAtStartupPending = false;
    state.launchAtStartupPendingValue = undefined;
    renderStartupControls();
  }
}

function renderDesktopStartupSettings() {
  if (!elements.startupContent) {
    return;
  }

  const status = state.launchAtStartupStatus;

  if (!status) {
    elements.startupContent.innerHTML = `<p class="empty">${escapeHtml(
      tx("Startup status unavailable.", "开机启动状态不可用。")
    )}</p>`;
    return;
  }

  const enabled = launchAtStartupDisplayEnabled(status);
  const disabled = launchAtStartupToggleDisabled(status);
  const statusMessage = state.launchAtStartupSaveStatus;
  const statusMessageBadgeClass =
    statusMessage?.kind === "pending" ? "warning" : statusMessage?.kind;
  const detailsExpanded =
    state.startupPreferenceExpanded ||
    status.hasDifferentEntry ||
    status.reason === "status_error";

  elements.startupContent.innerHTML = `
    <div class="preference-row ${disabled ? "is-disabled" : ""}">
      <button
        class="preference-copy preference-disclosure"
        type="button"
        data-preference-disclosure="startup"
        aria-expanded="${detailsExpanded ? "true" : "false"}"
        aria-controls="startup-preference-details"
      >
        <span class="preference-copy-heading">
          <strong>${escapeHtml(tx("Launch at startup", "开机启动"))}</strong>
          <span class="preference-disclosure-indicator" aria-hidden="true"></span>
        </span>
        <span class="settings-detail">${escapeHtml(
          launchAtStartupPreferenceDetail(status)
        )}</span>
      </button>
      <label class="preference-control preference-switch-control ${
        disabled ? "is-disabled" : ""
      }">
        <span class="preference-state ${escapeHtml(launchAtStartupBadgeClass(status))}">${escapeHtml(
          launchAtStartupStatusLabel(status)
        )}</span>
        <input
          type="checkbox"
          data-launch-at-startup-toggle
          aria-label="${escapeHtml(tx("Launch AIQD at startup", "开机启动 AIQD"))}"
          ${enabled ? "checked" : ""}
          ${disabled ? "disabled" : ""}
        />
        <span class="toggle-switch" aria-hidden="true"></span>
      </label>
    </div>
    ${detailsExpanded ? renderStartupPreferenceDetails(status) : ""}
    ${
      status.hasDifferentEntry
        ? renderPreferenceMessage({
            kind: "warning",
            message: tx("Different startup entry detected.", "检测到另一个启动项。"),
            detail: tx(
              "AIQD's own startup switch is still off.",
              "AIQD 自己管理的开关仍是关闭。"
            )
          })
        : ""
    }
    ${
      detailsExpanded || statusMessage?.kind !== "healthy"
        ? renderPreferenceMessage(statusMessage, statusMessageBadgeClass)
        : ""
    }
  `;
}

function renderStartupPreferenceDetails(status) {
  const notes = [launchAtStartupDetail(status)];

  if (status.canConfigure === true) {
    notes.push(
      status.enabled
        ? tx(
            "AIQD starts only the tray and local service; open the main window from the tray when needed.",
            "AIQD 只启动托盘和本地服务；需要主窗口时从托盘打开。"
          )
        : tx(
            "While this is off, AIQD will not add a sign-in startup entry.",
            "关闭时，AIQD 不会添加登录启动项。"
          )
    );
  }

  return `
    <div id="startup-preference-details" class="preference-detail-panel">
      ${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}
    </div>
  `;
}

function launchAtStartupPreferenceDetail(status) {
  if (status.reason === "desktop_bridge_unavailable") {
    return tx("Open AIQD from the desktop app to change this.", "请从桌面应用打开后修改。");
  }

  if (status.reason === "packaged_app_required") {
    return tx("Available in the installed desktop app.", "安装后的桌面版可用。");
  }

  if (status.reason === "unsupported_platform") {
    return tx("Not available on this platform.", "当前平台不可用。");
  }

  if (status.reason === "requires_approval") {
    return tx("The system may still ask for approval.", "系统可能还需要确认。");
  }

  if (status.hasDifferentEntry) {
    return tx("Another startup entry exists for this app.", "这个应用还有另一个启动项。");
  }

  return status.enabled
    ? tx("Start in the tray after sign-in.", "登录后自动在托盘运行。")
    : tx("Do not start automatically.", "不自动启动。");
}

function renderPreferenceMessage(status, badgeClass) {
  if (!status) {
    return "";
  }

  const kind =
    badgeClass ?? (status.kind === "pending" ? "warning" : status.kind ?? "stale");
  const label =
    status.kind === "pending"
      ? tx("working", "处理中")
      : status.kind === "healthy"
        ? tx("saved", "已保存")
        : tx("check", "检查");

  return `
    <div class="preference-message ${escapeHtml(kind)}">
      <span>
        <strong>${escapeHtml(status.message)}</strong>
        ${
          status.detail
            ? `<small>${escapeHtml(status.detail)}</small>`
            : ""
        }
      </span>
      <span class="badge ${escapeHtml(kind)}">${escapeHtml(label)}</span>
    </div>
  `;
}

function launchAtStartupStatusLabel(status) {
  if (status.requiresApproval) {
    return tx("Needs approval", "需要批准");
  }

  if (status.enabled) {
    return tx("On", "开启");
  }

  if (status.hasDifferentEntry) {
    return tx("Different entry", "不同启动项");
  }

  if (status.supported === false || status.canConfigure === false) {
    return tx("Unavailable", "不可用");
  }

  return tx("Off", "关闭");
}

function launchAtStartupBadgeClass(status) {
  if (status.requiresApproval || status.hasDifferentEntry) {
    return "warning";
  }

  if (status.enabled) {
    return "healthy";
  }

  return "stale";
}

function launchAtStartupDetail(status) {
  if (status.reason === "desktop_bridge_unavailable") {
    return tx(
      "Open this page from the packaged desktop app to control startup.",
      "请从打包后的桌面应用打开此页面来控制开机启动。"
    );
  }

  if (status.reason === "packaged_app_required") {
    return tx(
      "Available after installing the packaged desktop app. Source mode does not create an official startup entry.",
      "安装打包后的桌面应用后可用；源码模式不会创建正式开机启动项。"
    );
  }

  if (status.reason === "unsupported_platform") {
    return tx(
      "Startup control is supported for packaged Windows and macOS desktop builds.",
      "开机启动控制支持打包后的 Windows 和 macOS 桌面版本。"
    );
  }

  if (status.reason === "status_error") {
    return tx("Could not read the OS startup state.", "无法读取系统启动项状态。");
  }

  if (status.reason === "requires_approval") {
    return tx(
      "The OS may require approval before AIQD can launch at sign-in.",
      "系统可能需要批准后，AIQD 才能在登录时启动。"
    );
  }

  if (status.reason === "different_entry_detected") {
    return tx(
      "The AIQD-managed background startup entry is off, but Windows reports another entry for this executable.",
      "AIQD 管理的后台启动项已关闭，但 Windows 报告此程序还有另一条启动项。"
    );
  }

  if (status.enabled) {
    return tx(
      "AIQD will start in the tray when you sign in.",
      "AIQD 会在登录系统时从托盘启动。"
    );
  }

  return tx(
    "AIQD will not add a startup entry unless you enable it here or in the installer.",
    "除非你在这里或安装器里开启，否则 AIQD 不会添加开机启动项。"
  );
}

async function setDashboardClosePreference(mode) {
  if (state.dashboardClosePreferencePending) {
    return;
  }

  if (!window.aiqdDesktop?.setDashboardClosePreference) {
    state.dashboardClosePreferenceSaveStatus = {
      kind: "warning",
      message: tx(
        "Open Settings from the desktop app to change close behavior.",
        "请从桌面应用打开设置后再修改关闭行为。"
      )
    };
    renderDashboardCloseSettings();
    return;
  }

  state.dashboardClosePreferencePending = true;
  state.dashboardClosePreferenceSaveStatus = {
    kind: "pending",
    message: tx("Saving close behavior...", "正在保存关闭行为...")
  };
  renderDashboardCloseSettings();

  try {
    state.dashboardClosePreferenceStatus =
      await window.aiqdDesktop.setDashboardClosePreference(mode);
    state.dashboardClosePreferenceSaveStatus = {
      kind: "healthy",
      message: tx("Close behavior saved.", "关闭行为已保存。")
    };
  } catch (error) {
    state.dashboardClosePreferenceStatus =
      await loadDashboardClosePreferenceStatus();
    state.dashboardClosePreferenceSaveStatus = {
      kind: "warning",
      message: tx("Close behavior could not be changed.", "无法修改关闭行为。"),
      detail: error instanceof Error ? error.message : String(error)
    };
  } finally {
    state.dashboardClosePreferencePending = false;
    renderDashboardCloseSettings();
  }
}

function renderDashboardCloseSettings() {
  if (!elements.dashboardCloseContent) {
    return;
  }

  const status = state.dashboardClosePreferenceStatus;

  if (!status) {
    elements.dashboardCloseContent.innerHTML = `<p class="empty">${escapeHtml(
      tx("Close behavior unavailable.", "关闭行为状态不可用。")
    )}</p>`;
    return;
  }

  const supported = status.supported !== false;
  const mode = status.mode ?? "ask";
  const asksBeforeClose = mode === "ask";
  const pending = state.dashboardClosePreferencePending;
  const disabled = !supported || pending;
  const saveStatus = state.dashboardClosePreferenceSaveStatus;
  const saveBadgeClass =
    saveStatus?.kind === "pending" ? "warning" : saveStatus?.kind;

  elements.dashboardCloseContent.innerHTML = `
    <div class="preference-row ${disabled ? "is-disabled" : ""}">
      <span class="preference-copy">
        <strong>${escapeHtml(tx("Ask before closing", "关闭前询问"))}</strong>
        <span class="settings-detail">${escapeHtml(
          dashboardClosePreferenceDetail(mode, status)
        )}</span>
      </span>
      <label class="preference-control preference-switch-control ${
        disabled ? "is-disabled" : ""
      }">
        <span class="preference-state ${escapeHtml(dashboardCloseBadgeClass(mode, status))}">${escapeHtml(
          asksBeforeClose ? tx("On", "开启") : tx("Off", "关闭")
        )}</span>
        <input
          type="checkbox"
          data-dashboard-close-prompt-toggle
          aria-label="${escapeHtml(tx("Ask before closing the main window", "关闭主窗口前询问"))}"
          ${asksBeforeClose ? "checked" : ""}
          ${disabled ? "disabled" : ""}
        />
        <span class="toggle-switch" aria-hidden="true"></span>
      </label>
    </div>
    ${renderPreferenceMessage(saveStatus, saveBadgeClass)}
  `;
}

function dashboardClosePreferenceDetail(mode, status) {
  if (status.reason === "desktop_bridge_unavailable") {
    return tx("Open AIQD from the desktop app to change this.", "请从桌面应用打开后修改。");
  }

  if (status.reason === "status_error") {
    return tx("Could not read the current setting.", "无法读取当前设置。");
  }

  if (mode === "quit") {
    return tx("Off: X quits AIQD directly.", "关闭：点击 X 会直接退出 AIQD。");
  }

  if (mode === "tray") {
    return tx("Off: X keeps AIQD in the tray.", "关闭：点击 X 会留在托盘。");
  }

  return tx("On: X opens a small choice dialog.", "开启：点击 X 时弹出选择框。");
}

function dashboardCloseBadgeClass(mode, status) {
  if (status.supported === false) {
    return "stale";
  }

  if (mode === "ask") {
    return "healthy";
  }

  return mode === "quit" ? "warning" : "stale";
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
          path.readable
            ? tx("Readable", "可读取")
            : path.exists
              ? tx("Not readable", "不可读取")
              : tx("Not found", "未找到"),
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
        "",
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
      <div>${escapeHtml(value)}</div>
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
  if (!command) {
    return "";
  }

  return `
    <div class="inline-command">
      <code>${escapeHtml(command)}</code>
      ${renderCopyButton(command)}
    </div>
  `;
}

function renderCopyButton(text, label) {
  const buttonLabel = label ?? tx("Copy", "复制");

  return `
    <button
      class="copy-button"
      type="button"
      data-copy-text="${escapeHtml(text)}"
      title="${escapeHtml(tx("Copy command", "复制命令"))}"
      aria-label="${escapeHtml(tx("Copy command", "复制命令"))}"
    >${escapeHtml(buttonLabel)}</button>
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
  const container = button.closest(
    ".command-block, .inline-command, .step-helper-command"
  );
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

// Reset events store the raw per-source agent id (e.g. "claude-code"),
// but the dashboard only ever shows one merged "Claude" card - so this
// list needs the same id -> unified display name mapping the cards use.
function eventAgentDisplayName(agentId) {
  if (agentId === claudeCodeAgentId || agentId === claudeDesktopAgentId) {
    return "Claude";
  }

  return state.agents.find((agent) => agent.agent === agentId)?.displayName ?? agentId;
}

function eventTitle(event) {
  if (event.eventType === "reset_anchor_changed") {
    return tx("{window} reset time changed", "{window}重置时间变化", {
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
      tx("No reported reset", "未报告重置时间")
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

  if (isStaleSnapshot(snapshot)) {
    return escapeHtml(tx("Needs refresh", "需要刷新"));
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

function formatUsed(snapshot) {
  return sharedFormatUsed(snapshot, compactNumber);
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
    session_5h: tx("5 hours", "5 小时"),
    daily: tx("Daily", "每日"),
    weekly: tx("1 week", "1 周"),
    monthly: tx("Monthly", "每月"),
    billing_cycle: tx("Billing", "计费"),
    credits: tx("Credits", "点数")
  };

  return labels[windowType] ?? windowType;
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
    stale: tx("needs refresh", "需刷新"),
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
    ["Expired", "需要刷新"],
    ["Unknown", "未知"],
    ["Setup status unavailable", "设置状态不可用"],
    ["Waiting for visible quota", "等待可见额度"],
    ["No Codex snapshot yet", "还没有 Codex 兜底"],
    ["No Codex fallback yet", "还没有 Codex 兜底"],
    ["Manual Codex fallback ready", "Codex 手动兜底已就绪"],
    ["Waiting for Claude Code data", "等待 Claude Code 数据"],
    ["Waiting for Claude Code CLI command", "等待 Claude Code 命令"],
    ["Claude Code setup needed", "需要设置 Claude Code"],
    ["Codex manual snapshot ready", "Codex 手动兜底已就绪"],
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
      "先刷新检测本地 Codex CLI 额度；如果没有读到，再把可见的剩余百分比和重置时间保存到下方。"
    ],
    [
      "Use Codex once and refresh",
      "使用 Codex 一次后刷新；如果仍没有读到 CLI 额度，再使用手动兜底。"
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
      "Send one short message and wait for Claude to finish replying",
      "从终端打开 Claude Code；发一条短消息，等 Claude 回复完成后再检查。"
    ],
    [
      "send one short message",
      "从终端打开 Claude Code；发一条短消息，等 Claude 回复完成后再检查。"
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
      "只有自动检测不可用时，才记录可见的 Codex 额度值。"
    ]
  ];

  const match = translations.find(([needle]) => action.includes(needle));

  return match?.[1] ?? action;
}

function agentEmptyText(agent) {
  if (agent.emptyState?.reason === "waiting_for_statusline_data") {
    return {
      detail: tx(
        "Open Claude Code from a terminal once, following the current step in Settings.",
        "按设置页当前步骤，从终端启动 Claude Code 一次。"
      ),
      title: tx("Waiting for Claude Code data", "等待 Claude Code 数据")
    };
  }

  if (agent.emptyState?.reason === "waiting_for_desktop_data") {
    return {
      detail: tx(
        "Open Claude Desktop so it records a new usage sample, then refresh AIQD.",
        "打开 Claude Desktop，让它记录一次新的用量样本，然后刷新 AIQD。"
      ),
      title: tx("Waiting for Claude Desktop data", "等待 Claude Desktop 数据")
    };
  }

  if (agent.emptyState?.reason === "adapter_error") {
    return {
      detail: tx("Open Diagnostics to see what went wrong.", "打开诊断页查看出了什么问题。"),
      title: tx("Something went wrong", "出了点问题")
    };
  }

  if (agent.agent === "codex") {
    return {
      detail: tx(
        "AIQD checks for Codex usage automatically first. Use Codex once, then refresh; if nothing appears, use the manual form in Settings.",
        "AIQD 会先自动检查 Codex 用量。使用 Codex 一次后刷新；如果还是没有数据，就用设置页里的手动表单。"
      ),
      title: tx("Waiting for Codex data", "等待 Codex 数据")
    };
  }

  return {
    detail:
      agent.emptyState?.detail ??
      tx(
        "The latest refresh did not find any quota data for this app.",
        "最近一次刷新没有找到这个 App 的额度数据。"
      ),
    title: agent.emptyState?.title ?? tx("No quota data yet", "还没有额度数据")
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
