const assert = require("node:assert/strict");
const path = require("node:path");
const { describe, it } = require("node:test");
const {
  buildSmokeBackendEnv,
  buildLaunchAtStartupStatus,
  buildTrayMenuTemplate,
  clampBoundsToWorkArea,
  dashboardPath,
  desktopLaunchMode,
  formatStartupError,
  firstRunGuideTarget,
  hasClaudeWaitingState,
  isBackgroundLaunch,
  isSavedWidgetBounds,
  launchAtStartupArgsForPlatform,
  launchAtStartupQueryOptions,
  launchAtStartupSetOptions,
  parseLaunchAtStartupCliValue,
  resolveDesktopShortcuts,
  resolveWidgetBounds,
  shouldShowPanelFromLaunch,
  shouldOpenDashboardFromLaunch,
  shouldRefreshForClaudeStatusline,
  summarizeDesktopStatus,
  summarizeAgents
} = require("./helpers.cjs");

const nowMs = Date.parse("2026-08-10T00:00:00.000Z");

describe("desktop helpers", () => {
  it("builds tray menu actions for real-data setup", () => {
    const template = buildTrayMenuTemplate({
      actions: {
        openDashboardWindow() {},
        openDoctorWindow() {},
        openSettingsWindow() {},
        quit() {},
        refreshTrayNow() {},
        togglePanelWindow() {},
        toggleWidgetWindow() {}
      },
      isRefreshing: false,
      shortcuts: {
        panel: "CommandOrControl+Alt+Q",
        refresh: "CommandOrControl+Alt+R",
        widget: "CommandOrControl+Alt+W"
      },
      trayStatus: "Codex: setup | Claude: waiting"
    });
    const labels = template
      .filter((item) => item.label)
      .map((item) => item.label);

    assert.deepEqual(labels, [
      "Codex: setup | Claude: waiting",
      "Open Mini Panel",
      "Toggle Desktop Widget",
      "Refresh Now",
      "Open Dashboard",
      "Open Doctor",
      "Open Settings",
      "Quit"
    ]);
    assert.equal(
      template.find((item) => item.label === "Refresh Now")?.enabled,
      true
    );
    assert.equal(
      template.find((item) => item.label === "Open Mini Panel")?.accelerator,
      "CommandOrControl+Alt+Q"
    );
    assert.equal(
      template.find((item) => item.label === "Refresh Now")?.accelerator,
      "CommandOrControl+Alt+R"
    );
  });

  it("disables tray refresh while refresh is running", () => {
    const template = buildTrayMenuTemplate({
      actions: {},
      isRefreshing: true,
      trayStatus: "Codex: setup"
    });
    const refreshItem = template.find((item) => item.label === "Refreshing");

    assert.equal(refreshItem?.enabled, false);
  });

  it("builds safe dashboard deep links", () => {
    assert.equal(
      dashboardPath("settings", "codex-snapshot-content"),
      "/?view=settings#codex-snapshot-content"
    );
    assert.equal(
      dashboardPath("doctor", "#refresh-run-list"),
      "/?view=doctor#refresh-run-list"
    );
    assert.equal(dashboardPath("unknown", "codex-snapshot-content"), "/");
    assert.equal(dashboardPath("settings", "../bad"), "/?view=settings");
  });

  it("opens the dashboard for normal desktop launches", () => {
    assert.equal(desktopLaunchMode([]), "dashboard");
    assert.equal(shouldOpenDashboardFromLaunch([]), true);
    assert.equal(
      shouldOpenDashboardFromLaunch([
        "AI Agent Quota Dashboard.exe"
      ]),
      true
    );
    assert.equal(
      shouldOpenDashboardFromLaunch([
        "AI Agent Quota Dashboard.exe",
        "--open-dashboard"
      ]),
      true
    );
    assert.equal(
      shouldOpenDashboardFromLaunch([
        "AI Agent Quota Dashboard.exe",
        "--background"
      ]),
      false
    );
    assert.equal(
      isBackgroundLaunch([
        "AI Agent Quota Dashboard.exe",
        "--background"
      ]),
      true
    );
    assert.equal(
      shouldShowPanelFromLaunch([
        "AI Agent Quota Dashboard.exe",
        "--open-mini"
      ]),
      true
    );
    assert.equal(desktopLaunchMode(["AIQD.exe", "--tray"]), "background");
  });

  it("builds launch-at-startup login item options", () => {
    assert.deepEqual(launchAtStartupArgsForPlatform("win32"), ["--background"]);
    assert.deepEqual(launchAtStartupArgsForPlatform("darwin"), []);
    assert.deepEqual(
      launchAtStartupQueryOptions("C:\\Program Files\\AIQD\\AIQD.exe", "win32"),
      {
        args: ["--background"],
        path: "C:\\Program Files\\AIQD\\AIQD.exe"
      }
    );
    assert.deepEqual(
      launchAtStartupSetOptions(true, "C:\\Program Files\\AIQD\\AIQD.exe", "win32"),
      {
        args: ["--background"],
        enabled: true,
        name: "AI Agent Quota Dashboard",
        openAtLogin: true,
        path: "C:\\Program Files\\AIQD\\AIQD.exe"
      }
    );
    assert.deepEqual(launchAtStartupSetOptions(false, "/Applications/AIQD.app", "darwin"), {
      openAsHidden: true,
      openAtLogin: false
    });
  });

  it("normalizes launch-at-startup status", () => {
    assert.deepEqual(
      buildLaunchAtStartupStatus({
        isPackaged: false,
        platform: "win32"
      }),
      {
        canConfigure: false,
        enabled: false,
        platform: "win32",
        reason: "packaged_app_required",
        supported: false
      }
    );
    assert.deepEqual(
      buildLaunchAtStartupStatus({
        isPackaged: true,
        platform: "linux"
      }),
      {
        canConfigure: false,
        enabled: false,
        platform: "linux",
        reason: "unsupported_platform",
        supported: false
      }
    );
    assert.deepEqual(
      buildLaunchAtStartupStatus({
        isPackaged: true,
        platform: "win32",
        settings: {
          executableWillLaunchAtLogin: true,
          openAtLogin: true
        }
      }),
      {
        canConfigure: true,
        enabled: true,
        executableWillLaunchAtLogin: true,
        hasDifferentEntry: false,
        launchBehavior: "background",
        platform: "win32",
        reason: "enabled",
        requiresApproval: false,
        status: undefined,
        supported: true
      }
    );
    assert.equal(
      buildLaunchAtStartupStatus({
        isPackaged: true,
        platform: "win32",
        settings: {
          executableWillLaunchAtLogin: true,
          openAtLogin: false
        }
      }).reason,
      "different_entry_detected"
    );
    assert.equal(
      buildLaunchAtStartupStatus({
        isPackaged: true,
        platform: "darwin",
        settings: {
          openAtLogin: false,
          status: "requires-approval"
        }
      }).reason,
      "requires_approval"
    );
  });

  it("parses installer launch-at-startup command line values", () => {
    assert.equal(parseLaunchAtStartupCliValue([]), undefined);
    assert.equal(
      parseLaunchAtStartupCliValue(["AIQD.exe", "--set-launch-at-login=1"]),
      true
    );
    assert.equal(
      parseLaunchAtStartupCliValue(["AIQD.exe", "--set-launch-at-startup", "off"]),
      false
    );
    assert.equal(
      parseLaunchAtStartupCliValue(["AIQD.exe", "--set-launch-at-login"]),
      true
    );
    assert.throws(
      () => parseLaunchAtStartupCliValue(["AIQD.exe", "--set-launch-at-login=maybe"]),
      /must be true or false/
    );
  });

  it("chooses a first-run guide target for missing real-data setup", () => {
    assert.deepEqual(firstRunGuideTarget([]), {
      target: "real-data-content",
      view: "settings"
    });

    assert.deepEqual(
      firstRunGuideTarget([
        {
          agent: "codex",
          emptyState: { reason: "no_supported_source" }
        },
        {
          agent: "claude-code",
          primarySnapshot: { remainingPercent: 80 }
        }
      ]),
      {
        target: "codex-snapshot-content",
        view: "settings"
      }
    );

    assert.deepEqual(
      firstRunGuideTarget([
        {
          agent: "codex",
          primarySnapshot: { remainingPercent: 40 }
        },
        {
          agent: "claude-code",
          emptyState: { reason: "no_supported_source" }
        }
      ]),
      {
        target: "settings-content",
        view: "settings"
      }
    );
  });

  it("opens first-run guide failures in Doctor and skips ready agents", () => {
    assert.deepEqual(
      firstRunGuideTarget([
        {
          agent: "codex",
          emptyState: { reason: "adapter_error" }
        }
      ]),
      {
        target: "doctor-list",
        view: "doctor"
      }
    );

    assert.equal(
      firstRunGuideTarget([
        {
          agent: "codex",
          primarySnapshot: { remainingPercent: 70 }
        },
        {
          agent: "claude-code",
          primarySnapshot: { remainingPercent: 64 }
        }
      ]),
      undefined
    );
  });

  it("uses strict readiness for first-run guide targets", () => {
    assert.deepEqual(
      firstRunGuideTarget(
        [
          {
            agent: "codex",
            primarySnapshot: { remainingPercent: 70 }
          }
        ],
        {
          ok: false,
          checks: [
            {
              agent: "codex",
              displayName: "Codex",
              message: "Codex quota data is stale.",
              provider: "openai",
              status: "fail"
            }
          ]
        }
      ),
      {
        target: "codex-snapshot-content",
        view: "settings"
      }
    );

    assert.deepEqual(
      firstRunGuideTarget([], {
        ok: false,
        checks: [
          {
            agent: "doctor",
            displayName: "Doctor",
            message: "Blocking diagnostics must pass.",
            provider: "local",
            status: "fail"
          }
        ]
      }),
      {
        target: "doctor-list",
        view: "doctor"
      }
    );
  });

  it("formats desktop startup recovery guidance", () => {
    const message = formatStartupError({
      detail: "No free localhost port between 4317 and 4399",
      portRange: "4317-4399",
      reason: "AIQD desktop could not find a port."
    });

    assert.match(message, /AIQD desktop could not find a port/);
    assert.match(message, /npm run desktop:smoke/);
    assert.match(message, /localhost ports 4317-4399/);
    assert.match(message, /Detail: No free localhost port/);
  });

  it("includes backend exit and stderr details in startup guidance", () => {
    const message = formatStartupError({
      backendExit: "exited with code 1",
      backendStderr: "node: bad things happened",
      reason: "AIQD backend failed."
    });

    assert.match(message, /AIQD backend failed/);
    assert.match(message, /Backend: exited with code 1/);
    assert.match(message, /Backend stderr/);
    assert.match(message, /bad things happened/);
  });

  it("summarizes compact agent status for tray text", () => {
    const summary = summarizeAgents(
      [
        {
          agent: "codex",
          shortName: "Codex",
          primarySnapshot: {
            remainingPercent: 42,
            resetAt: "2026-08-10T02:00:00.000Z"
          }
        },
        {
          agent: "claude-code",
          shortName: "Claude",
          emptyState: {
            reason: "waiting_for_statusline_data"
          }
        }
      ],
      { nowMs }
    );

    assert.equal(summary, "Codex: 42% 2h left | Claude: waiting");
  });

  it("prioritizes strict trial readiness for desktop status text", () => {
    assert.equal(
      summarizeDesktopStatus(
        [
          {
            agent: "codex",
            shortName: "Codex",
            primarySnapshot: {
              remainingPercent: 70
            }
          }
        ],
        {
          ok: false,
          checks: [
            {
              agent: "codex",
              displayName: "Codex",
              provider: "openai",
              status: "fail",
              message: "Codex quota data is stale."
            },
            {
              agent: "claude-code",
              displayName: "Claude Code",
              provider: "anthropic",
              status: "pass",
              message: "5h quota from statusline."
            }
          ]
        }
      ),
      "Trial: 1/2 ready - Codex"
    );

    assert.equal(
      summarizeDesktopStatus(
        [
          {
            agent: "codex",
            shortName: "Codex",
            primarySnapshot: {
              remainingPercent: 70
            }
          }
        ],
        {
          ok: true,
          checks: []
        }
      ),
      "Codex: 70%"
    );
  });

  it("summarizes first-run empty states for tray text", () => {
    const summary = summarizeAgents([
      {
        agent: "codex",
        shortName: "Codex",
        emptyState: {
          reason: "no_supported_source"
        }
      },
      {
        agent: "claude-code",
        shortName: "Claude",
        emptyState: {
          reason: "adapter_error"
        }
      }
    ]);

    assert.equal(summary, "Codex: setup | Claude: check");
  });

  it("detects when Claude waiting state should refresh after rate limits arrive", () => {
    const agents = [
      {
        agent: "claude-code",
        emptyState: {
          reason: "waiting_for_statusline_data"
        }
      }
    ];

    assert.equal(hasClaudeWaitingState(agents), true);
    assert.equal(
      shouldRefreshForClaudeStatusline(agents, { latestHasRateLimits: true }),
      true
    );
    assert.equal(
      shouldRefreshForClaudeStatusline(agents, { latestHasRateLimits: false }),
      false
    );
  });

  it("resolves default and user-configured desktop shortcuts", () => {
    assert.deepEqual(resolveDesktopShortcuts({}), {
      panel: "CommandOrControl+Alt+Q",
      refresh: "CommandOrControl+Alt+R",
      widget: "CommandOrControl+Alt+W"
    });
    assert.deepEqual(
      resolveDesktopShortcuts({
        AIQD_SHORTCUT_PANEL: "F3",
        AIQD_SHORTCUT_REFRESH: "off",
        AIQD_SHORTCUT_WIDGET: "CommandOrControl+Shift+W"
      }),
      {
        panel: "F3",
        refresh: undefined,
        widget: "CommandOrControl+Shift+W"
      }
    );
  });

  it("validates and clamps remembered widget bounds", () => {
    const workArea = {
      height: 600,
      width: 800,
      x: 0,
      y: 0
    };
    const widgetSize = {
      height: 196,
      width: 340
    };

    assert.equal(isSavedWidgetBounds({ x: 12, y: 24 }), true);
    assert.equal(isSavedWidgetBounds({ x: "12", y: 24 }), false);
    assert.deepEqual(
      clampBoundsToWorkArea(
        { ...widgetSize, x: 900, y: -40 },
        workArea
      ),
      { ...widgetSize, x: 452, y: 8 }
    );
    assert.deepEqual(
      resolveWidgetBounds({
        savedBounds: { x: 720, y: 500 },
        widgetSize,
        workArea
      }),
      { ...widgetSize, x: 452, y: 396 }
    );
    assert.deepEqual(
      resolveWidgetBounds({
        clampToWorkArea: false,
        savedBounds: { x: 720, y: 500 },
        widgetSize,
        workArea
      }),
      { ...widgetSize, x: 720, y: 500 }
    );
  });

  it("isolates smoke backend provider paths", () => {
    const smokeRoot = path.join("tmp", "aiqd-smoke");
    const env = buildSmokeBackendEnv(
      {
        AIQD_CONFIG_PATH: "real-config.json",
        AIQD_DEMO_DATA: "1",
        APPDATA: "real-appdata",
        CODEX_HOME: "real-codex",
        HOME: "real-home",
        LOCALAPPDATA: "real-localappdata",
        USERPROFILE: "real-profile"
      },
      smokeRoot
    );
    const smokeHome = path.join(smokeRoot, "home");
    const smokeAppData = path.join(smokeRoot, "aiqd-data");

    assert.equal(env.HOME, smokeHome);
    assert.equal(env.USERPROFILE, smokeHome);
    assert.equal(env.CODEX_HOME, path.join(smokeHome, ".codex"));
    assert.equal(env.APPDATA, path.join(smokeRoot, "appdata"));
    assert.equal(env.LOCALAPPDATA, path.join(smokeRoot, "localappdata"));
    assert.equal(env.CLAUDE_CONFIG_DIR, path.join(smokeHome, ".claude"));
    assert.equal(env.AIQD_CONFIG_PATH, path.join(smokeAppData, "config.json"));
    assert.equal(env.AIQD_DEMO_DATA, "0");
  });
});
