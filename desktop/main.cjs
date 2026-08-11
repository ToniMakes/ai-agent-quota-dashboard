const {
  app,
  BrowserWindow,
  dialog,
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
  buildSmokeBackendEnv,
  buildTrayMenuTemplate,
  dashboardPath,
  firstRunGuideTarget,
  formatStartupError,
  resolveDesktopShortcuts,
  resolveWidgetBounds: resolveSavedWidgetBounds,
  shouldRefreshForClaudeStatusline,
  summarizeDesktopStatus
} = require("./helpers.cjs");

const projectRoot = path.resolve(__dirname, "..");
const appIconPngPath = path.join(projectRoot, "assets", "icon.png");
const appIconSvgPath = path.join(projectRoot, "assets", "icon.svg");
const trayIconPngPath = path.join(projectRoot, "assets", "tray-icon.png");
const trayIconSvgPath = path.join(projectRoot, "assets", "tray-icon.svg");
const cliPath = path.join(projectRoot, "dist", "index.js");
const preloadPath = path.join(__dirname, "preload.cjs");
const panelSize = { width: 340, height: 236 };
const widgetSize = { width: 340, height: 196 };
const smokeMode = process.argv.includes("--smoke");
const firstRunGuideSmokeMode = process.argv.includes("--smoke-first-run-guide");
const smokeLikeMode = smokeMode || firstRunGuideSmokeMode;
const smokeUserDataDir = smokeLikeMode
  ? path.join(tmpdir(), `aiqd-desktop-smoke-${process.pid}`)
  : undefined;
const trayStatusIntervalMs = 30_000;

let backend;
let backendFailure;
let backendStderrTail = "";
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
let showDashboardWhenReady = false;

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
  console.log("AIQD desktop is already running; focusing the existing instance.");
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (smokeLikeMode) {
      return;
    }

    const wantsDashboard = shouldOpenDashboard(commandLine);

    if (!baseUrl || !tray) {
      if (wantsDashboard) {
        showDashboardWhenReady = true;
      } else {
        showPanelWhenReady = true;
      }
      return;
    }

    if (wantsDashboard) {
      openDashboardWindow();
    } else {
      showPanelWindow();
    }
  });

  app.whenReady().then(startDesktopApp).catch(reportStartupFailure);

  app.on("before-quit", shutdownDesktopRuntime);

  app.on("will-quit", cleanupSmokeUserDataDir);

  app.on("window-all-closed", () => {
    // Keep the tray app alive until the user chooses Quit from the tray menu.
  });
}

async function startDesktopApp() {
  desktopStatePath = path.join(app.getPath("userData"), "desktop-state.json");
  const port = await findFreePort(4317, 4399);
  baseUrl = `http://127.0.0.1:${port}`;
  backend = spawn(backendCommand(), backendArgs(port), {
    cwd: projectRoot,
    env: backendEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  backend.stdout.on("data", (chunk) => process.stdout.write(chunk));
  backend.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    backendStderrTail = `${backendStderrTail}${text}`.slice(-4000);
    process.stderr.write(chunk);
  });
  backend.on("error", (error) => {
    backendFailure = `Backend process failed to start: ${error.message}`;
  });
  backend.on("exit", (code, signal) => {
    const status = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;

    if (!isQuitting) {
      backendFailure = `Backend exited with ${status}.`;
      console.error(`AIQD backend exited with ${status}`);
    }
  });

  await waitForHealth(`${baseUrl}/api/health`, {
    getFailure: () => backendFailure
  });

  if (smokeMode) {
    console.log(`AIQD desktop smoke ready at ${baseUrl}`);
    exitDesktopProcess(0);
    return;
  }

  if (firstRunGuideSmokeMode) {
    const ok = await runFirstRunGuideSmoke();
    exitDesktopProcess(ok ? 0 : 1);
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

  if (showDashboardWhenReady || shouldOpenDashboard(process.argv)) {
    showDashboardWhenReady = false;
    void openFirstRunGuide({ readyFallback: "dashboard" });
  } else if (showPanelWhenReady) {
    showPanelWhenReady = false;
    showPanelWindow();
  } else {
    void openFirstRunGuide();
  }
}

function reportStartupFailure(error) {
  const detail = error instanceof Error ? error.message : String(error);
  const message = formatStartupError({
    backendExit: backendFailure,
    backendStderr: backendStderrTail,
    detail: detail === backendFailure ? undefined : detail,
    portRange: "4317-4399",
    reason: "AIQD desktop could not start the local backend."
  });

  console.error(message);
  process.exitCode = 1;
  shutdownDesktopRuntime();

  if (!smokeLikeMode) {
    dialog.showErrorBox("AIQD could not start", message);
  }

  cleanupSmokeUserDataDir();
  app.exit(1);
}

function shutdownDesktopRuntime() {
  isQuitting = true;

  if (trayStatusTimer) {
    clearInterval(trayStatusTimer);
    trayStatusTimer = undefined;
  }

  if (backend && !backend.killed) {
    backend.kill();
  }

  globalShortcut.unregisterAll();
}

function exitDesktopProcess(exitCode) {
  process.exitCode = exitCode;
  shutdownDesktopRuntime();
  cleanupSmokeUserDataDir();
  app.exit(exitCode);
}

function cleanupSmokeUserDataDir() {
  if (!smokeUserDataDir) {
    return;
  }

  try {
    rmSync(smokeUserDataDir, { force: true, recursive: true });
  } catch {
    // A locked Electron file should not fail smoke validation.
  }
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

function backendCommand() {
  if (process.env.AIQD_NODE_PATH) {
    return process.env.AIQD_NODE_PATH;
  }

  return app.isPackaged ? process.execPath : "node";
}

function backendEnv() {
  const env = smokeUserDataDir
    ? buildSmokeBackendEnv(process.env, smokeUserDataDir)
    : { ...process.env };

  if (app.isPackaged && !process.env.AIQD_NODE_PATH) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }

  return env;
}

function registerIpc() {
  ipcMain.handle("open-dashboard", (_event, view, target) => {
    openDashboardWindow(view, target);
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

    const readinessPayload = await getJson(`${baseUrl}/api/trial-readiness`).catch(
      () => undefined
    );
    trayStatus = summarizeDesktopStatus(
      payload.agents ?? [],
      readinessPayload?.readiness
    );
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

function openDashboardWindow(view, target) {
  if (!dashboardWindow) {
    dashboardWindow = new BrowserWindow({
      width: 1180,
      height: 820,
      icon: createAppIcon(64),
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

  dashboardWindow.loadURL(dashboardUrl(view, target));
  dashboardWindow.show();
  dashboardWindow.focus();
  updateTrayStatus();
}

function dashboardUrl(view, target) {
  return `${baseUrl}${dashboardPath(view, target)}`;
}

async function openFirstRunGuide(options = {}) {
  try {
    const result = await resolveFirstRunGuide();

    if (result.skipped) {
      if (options.readyFallback === "dashboard") {
        openDashboardWindow();
      }
      return;
    }

    if (result.guideTarget) {
      openDashboardWindow(result.guideTarget.view, result.guideTarget.target);
      return;
    }

    if (options.readyFallback === "dashboard") {
      openDashboardWindow();
    } else {
      showPanelWindow();
    }
  } catch {
    // Keep startup quiet if the guide cannot be resolved.
  }
}

function shouldOpenDashboard(commandLine = []) {
  return commandLine.includes("--open-dashboard");
}

async function runFirstRunGuideSmoke() {
  const result = await resolveFirstRunGuide();
  const state = readDesktopState();
  const guidePath = result.guideTarget
    ? dashboardPath(result.guideTarget.view, result.guideTarget.target)
    : "mini-panel";
  const expectedPath = "/?view=settings#codex-snapshot-content";
  const ok = !result.skipped && guidePath === expectedPath && Boolean(
    state.firstRunGuideShownAt
  );
  const output = {
    expectedPath,
    firstRunGuideShownAt: state.firstRunGuideShownAt ?? null,
    guidePath,
    ok,
    skipped: result.skipped
  };

  console.log(`AIQD desktop first-run guide smoke ${ok ? "passed" : "failed"}`);
  console.log(JSON.stringify(output, null, 2));

  return ok;
}

async function resolveFirstRunGuide() {
  const state = readDesktopState();

  if (state.firstRunGuideShownAt) {
    return {
      guideTarget: undefined,
      skipped: true
    };
  }

  const payload = await getJson(`${baseUrl}/api/agents`);
  const readinessPayload = await getJson(`${baseUrl}/api/trial-readiness`).catch(
    () => undefined
  );
  const guideTarget = firstRunGuideTarget(
    payload.agents ?? [],
    readinessPayload?.readiness
  );

  writeDesktopState({
    ...readDesktopState(),
    firstRunGuideShownAt: new Date().toISOString()
  });

  return {
    guideTarget,
    skipped: false
  };
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
  return createIconFromPaths(trayIconPngPath, trayIconSvgPath, 32);
}

function createAppIcon(size) {
  return createIconFromPaths(appIconPngPath, appIconSvgPath, size);
}

function createIconFromPaths(pngPath, svgPath, size) {
  try {
    const image = nativeImage.createFromPath(pngPath);

    if (!image.isEmpty()) {
      return size
        ? image.resize({ height: size, quality: "best", width: size })
        : image;
    }
  } catch {
    // Fall through to the inline fallback icon.
  }

  try {
    const svg = readFileSync(svgPath, "utf8");
    const image = nativeImage.createFromDataURL(
      `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
    );

    if (!image.isEmpty()) {
      return size
        ? image.resize({ height: size, quality: "best", width: size })
        : image;
    }
  } catch {
    // Fall through to the inline fallback icon.
  }

  return createFallbackIcon(size);
}

function createFallbackIcon(size) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <rect x="6" y="6" width="244" height="244" rx="56" fill="#151a17"/>
      <circle cx="112" cy="112" r="73" fill="none" stroke="#56d6af" stroke-width="22" stroke-linecap="round"/>
      <path d="M112 39a73 73 0 0 1 70 52" fill="none" stroke="#e7b35c" stroke-width="22" stroke-linecap="round"/>
      <circle cx="112" cy="112" r="35" fill="#f6f5f2"/>
      <circle cx="112" cy="112" r="18" fill="#151a17"/>
      <path d="M157 158l50 50" fill="none" stroke="#f6f5f2" stroke-width="22" stroke-linecap="round"/>
      <path d="M171 172l36 36" fill="none" stroke="#56d6af" stroke-width="10" stroke-linecap="round"/>
    </svg>
  `;

  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
  );

  return size
    ? image.resize({ height: size, quality: "best", width: size })
    : image;
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

function waitForHealth(url, options = {}) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const failure = options.getFailure?.();

      if (failure) {
        reject(new Error(failure));
        return;
      }

      http
        .get(url, (response) => {
          response.resume();

          if (response.statusCode === 200) {
            resolve();
            return;
          }

          retry(check, startedAt, reject, options);
        })
        .on("error", () => retry(check, startedAt, reject, options));
    };

    check();
  });
}

function retry(callback, startedAt, reject, options = {}) {
  const failure = options.getFailure?.();

  if (failure) {
    reject(new Error(failure));
    return;
  }

  if (Date.now() - startedAt > 10_000) {
    reject(new Error("AIQD backend did not become ready within 10 seconds"));
    return;
  }

  setTimeout(callback, 200);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
