const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  shell
} = require("electron");
const { spawn } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const { tmpdir } = require("node:os");
const path = require("node:path");
const {
  buildTrayMenuTemplate,
  resolveDesktopShortcuts,
  resolveWidgetBounds: resolveSavedWidgetBounds,
  shouldRefreshForClaudeStatusline,
  summarizeAgents
} = require("./helpers.cjs");

const projectRoot = path.resolve(__dirname, "..");
const cliPath = path.join(projectRoot, "dist", "index.js");
const preloadPath = path.join(__dirname, "preload.cjs");
const panelSize = { width: 340, height: 236 };
const widgetSize = { width: 340, height: 196 };
const smokeMode = process.argv.includes("--smoke");
const smokeUserDataDir = smokeMode
  ? path.join(tmpdir(), `aiqd-desktop-smoke-${process.pid}`)
  : undefined;
const trayStatusIntervalMs = 30_000;

let backend;
let baseUrl;
let desktopStatePath;
let tray;
let trayStatus = "Starting";
let trayStatusTimer;
let desktopShortcuts = {};
let panelWindow;
let widgetWindow;
let dashboardWindow;
let isQuitting = false;
let isTrayRefreshing = false;
let saveWidgetBoundsTimer;
let showPanelWhenReady = false;

app.setName("AI Agent Quota");
app.setAppUserModelId("com.isToniLiu.ai-agent-quota-dashboard");

if (smokeUserDataDir) {
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.setPath("userData", smokeUserDataDir);
  app.disableHardwareAcceleration();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (smokeMode) {
      return;
    }

    if (!baseUrl || !tray) {
      showPanelWhenReady = true;
      return;
    }

    showPanelWindow();
  });

  app.whenReady().then(async () => {
    desktopStatePath = path.join(app.getPath("userData"), "desktop-state.json");
    const port = await findFreePort(4317, 4399);
    baseUrl = `http://127.0.0.1:${port}`;
    backend = spawn(process.env.AIQD_NODE_PATH ?? "node", backendArgs(port), {
      cwd: projectRoot,
      env: backendEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    backend.stdout.on("data", (chunk) => process.stdout.write(chunk));
    backend.stderr.on("data", (chunk) => process.stderr.write(chunk));
    backend.on("exit", (code) => {
      if (!isQuitting) {
        console.error(`AIQD backend exited with code ${code ?? "unknown"}`);
      }
    });

    await waitForHealth(`${baseUrl}/api/health`);

    if (smokeMode) {
      console.log(`AIQD desktop smoke ready at ${baseUrl}`);
      app.quit();
      return;
    }

    registerIpc();
    desktopShortcuts = resolveDesktopShortcuts(process.env);
    createTray();
    createPanelWindow();
    registerGlobalShortcuts(desktopShortcuts);
    updateTrayStatus();
    trayStatusTimer = setInterval(() => {
      void updateTrayStatus();
    }, trayStatusIntervalMs);

    if (showPanelWhenReady) {
      showPanelWhenReady = false;
      showPanelWindow();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (trayStatusTimer) {
      clearInterval(trayStatusTimer);
    }
    if (backend && !backend.killed) {
      backend.kill();
    }
    globalShortcut.unregisterAll();
  });

  app.on("will-quit", () => {
    if (!smokeUserDataDir) {
      return;
    }

    try {
      rmSync(smokeUserDataDir, { force: true, recursive: true });
    } catch {
      // A locked Electron file should not fail smoke validation.
    }
  });

  app.on("window-all-closed", () => {
    // Keep the tray app alive until the user chooses Quit from the tray menu.
  });
}

function showPanelWindow() {
  if (!panelWindow) {
    createPanelWindow();
  }

  positionPanelWindow();
  panelWindow.show();
  panelWindow.focus();
  updateTrayStatus();
}

function togglePanelWindow() {
  if (panelWindow?.isVisible()) {
    panelWindow.hide();
    return;
  }

  showPanelWindow();
}

function backendArgs(port) {
  const args = [cliPath, "--port", String(port)];

  if (process.argv.includes("--demo")) {
    args.push("--demo");
  }

  return args;
}

function backendEnv() {
  if (!smokeUserDataDir) {
    return process.env;
  }

  return {
    ...process.env,
    AIQD_CONFIG_PATH: path.join(smokeUserDataDir, "config.json"),
    AIQD_DB_PATH: path.join(smokeUserDataDir, "quota.db")
  };
}

function registerIpc() {
  ipcMain.handle("open-dashboard", (_event, view) => {
    openDashboardWindow(view);
    panelWindow?.hide();
  });

  ipcMain.handle("toggle-widget", () => {
    toggleWidgetWindow();
  });

  ipcMain.handle("hide-current-window", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
  });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("AI Agent Quota");
  updateTrayMenu();
  tray.on("click", togglePanelWindow);
}

async function updateTrayStatus() {
  if (!tray || !baseUrl) {
    return;
  }

  try {
    let payload = await getJson(`${baseUrl}/api/agents`);
    const agents = payload.agents ?? [];

    if (await shouldRefreshFromClaudeStatusline(agents)) {
      await postJson(`${baseUrl}/api/refresh`);
      payload = await getJson(`${baseUrl}/api/agents`);
    }

    trayStatus = summarizeAgents(payload.agents ?? []);
  } catch {
    trayStatus = "Local service unavailable";
  }

  applyTrayStatus();
}

async function refreshTrayNow() {
  if (!tray || !baseUrl || isTrayRefreshing) {
    return;
  }

  isTrayRefreshing = true;
  trayStatus = "Refreshing";
  applyTrayStatus();

  try {
    await postJson(`${baseUrl}/api/refresh`);
  } catch {
    trayStatus = "Refresh failed";
    applyTrayStatus();
  } finally {
    isTrayRefreshing = false;
    await updateTrayStatus();
  }
}

function applyTrayStatus() {
  if (!tray) {
    return;
  }

  tray.setToolTip(`AI Agent Quota\n${trayStatus}`);
  updateTrayMenu();
}

function updateTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate(
      buildTrayMenuTemplate({
        actions: {
          openDashboardWindow,
          openDoctorWindow: () => openDashboardWindow("doctor"),
          openSettingsWindow: () => openDashboardWindow("settings"),
          quit: () => {
            isQuitting = true;
            app.quit();
          },
          refreshTrayNow,
          togglePanelWindow,
          toggleWidgetWindow
        },
        isRefreshing: isTrayRefreshing,
        shortcuts: desktopShortcuts,
        trayStatus
      })
    )
  );
}

function registerGlobalShortcuts(shortcuts) {
  const registrations = [
    {
      accelerator: shortcuts.panel,
      action: togglePanelWindow,
      label: "mini panel"
    },
    {
      accelerator: shortcuts.refresh,
      action: () => {
        void refreshTrayNow();
      },
      label: "refresh"
    },
    {
      accelerator: shortcuts.widget,
      action: toggleWidgetWindow,
      label: "desktop widget"
    }
  ];

  for (const registration of registrations) {
    if (!registration.accelerator) {
      continue;
    }

    const registered = globalShortcut.register(
      registration.accelerator,
      registration.action
    );

    if (!registered) {
      console.warn(
        `Could not register ${registration.label} shortcut: ${registration.accelerator}`
      );
    }
  }
}

function createPanelWindow() {
  panelWindow = new BrowserWindow({
    ...panelSize,
    alwaysOnTop: true,
    frame: false,
    maximizable: false,
    minimizable: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: secureWebPreferences()
  });

  panelWindow.loadURL(`${baseUrl}/mini.html?mode=panel`);
  panelWindow.on("blur", () => panelWindow?.hide());
  panelWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      panelWindow?.hide();
    }
  });
}

function positionPanelWindow() {
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y
  });
  const workArea = display.workArea;
  const x = clamp(
    Math.round(trayBounds.x + trayBounds.width / 2 - panelSize.width / 2),
    workArea.x + 8,
    workArea.x + workArea.width - panelSize.width - 8
  );
  const preferBelow = trayBounds.y < workArea.y + workArea.height / 2;
  const y = preferBelow
    ? trayBounds.y + trayBounds.height + 8
    : trayBounds.y - panelSize.height - 8;

  panelWindow.setBounds({ x, y, ...panelSize });
}

function toggleWidgetWindow() {
  if (!widgetWindow) {
    widgetWindow = new BrowserWindow({
      ...widgetSize,
      alwaysOnTop: true,
      frame: false,
      resizable: false,
      show: false,
      skipTaskbar: false,
      transparent: true,
      webPreferences: secureWebPreferences()
    });
    widgetWindow.loadURL(`${baseUrl}/mini.html?mode=widget`);
    widgetWindow.on("move", scheduleSaveWidgetBounds);
    widgetWindow.on("closed", () => {
      widgetWindow = undefined;
    });
  }

  if (widgetWindow.isVisible()) {
    widgetWindow.hide();
    return;
  }

  widgetWindow.setBounds(resolveWidgetBounds());
  widgetWindow.show();
  updateTrayStatus();
}

function openDashboardWindow(view) {
  if (!dashboardWindow) {
    dashboardWindow = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 900,
      minHeight: 620,
      title: "AI Agent Quota",
      webPreferences: secureWebPreferences()
    });
    dashboardWindow.on("closed", () => {
      dashboardWindow = undefined;
    });
    dashboardWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });
  }

  dashboardWindow.loadURL(dashboardUrl(view));
  dashboardWindow.show();
  dashboardWindow.focus();
  updateTrayStatus();
}

function dashboardUrl(view) {
  const allowedViews = new Set(["dashboard", "doctor", "settings"]);

  if (!allowedViews.has(view)) {
    return baseUrl;
  }

  return `${baseUrl}/?view=${encodeURIComponent(view)}`;
}

function secureWebPreferences() {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    preload: preloadPath,
    sandbox: false
  };
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#1f2520"/>
      <circle cx="16" cy="16" r="9" fill="none" stroke="#6ec3a5" stroke-width="3"/>
      <path d="M16 8a8 8 0 0 1 8 8h-4a4 4 0 0 0-4-4z" fill="#e3aa4a"/>
      <circle cx="16" cy="16" r="3" fill="#f6f5f2"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
  );
}

function resolveWidgetBounds() {
  const savedBounds = readDesktopState().widgetBounds;
  const workArea = screen.getPrimaryDisplay().workArea;
  const bounds = resolveSavedWidgetBounds({
    clampToWorkArea: false,
    savedBounds,
    widgetSize,
    workArea
  });

  return clampBoundsToNearestDisplay(bounds);
}

function clampBoundsToNearestDisplay(bounds) {
  const display = screen.getDisplayNearestPoint({
    x: bounds.x,
    y: bounds.y
  });
  const workArea = display.workArea;

  return {
    ...bounds,
    x: clamp(bounds.x, workArea.x + 8, workArea.x + workArea.width - bounds.width - 8),
    y: clamp(bounds.y, workArea.y + 8, workArea.y + workArea.height - bounds.height - 8)
  };
}

function scheduleSaveWidgetBounds() {
  if (!widgetWindow || !widgetWindow.isVisible()) {
    return;
  }

  if (saveWidgetBoundsTimer) {
    clearTimeout(saveWidgetBoundsTimer);
  }

  saveWidgetBoundsTimer = setTimeout(saveWidgetBounds, 250);
}

function saveWidgetBounds() {
  if (!widgetWindow) {
    return;
  }

  const state = readDesktopState();
  const bounds = widgetWindow.getBounds();
  writeDesktopState({
    ...state,
    widgetBounds: {
      x: bounds.x,
      y: bounds.y
    }
  });
}

function readDesktopState() {
  try {
    if (!existsSync(desktopStatePath)) {
      return {};
    }

    const parsed = JSON.parse(readFileSync(desktopStatePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDesktopState(state) {
  mkdirSync(path.dirname(desktopStatePath), { recursive: true });
  writeFileSync(desktopStatePath, JSON.stringify(state, null, 2));
}

async function shouldRefreshFromClaudeStatusline(agents) {
  const setupPayload = await getJson(`${baseUrl}/api/setup/claude-statusline`);

  return shouldRefreshForClaudeStatusline(agents, setupPayload.status);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function postJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: "POST" }, (response) => {
      response.resume();

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.on("end", resolve);
    });

    request.on("error", reject);
    request.end();
  });
}

async function findFreePort(start, end) {
  for (let port = start; port <= end; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error(`No free localhost port between ${start} and ${end}`);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function waitForHealth(url) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (response) => {
          response.resume();

          if (response.statusCode === 200) {
            resolve();
            return;
          }

          retry(check, startedAt, reject);
        })
        .on("error", () => retry(check, startedAt, reject));
    };

    check();
  });
}

function retry(callback, startedAt, reject) {
  if (Date.now() - startedAt > 10_000) {
    reject(new Error("AIQD backend did not become ready within 10 seconds"));
    return;
  }

  setTimeout(callback, 200);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
