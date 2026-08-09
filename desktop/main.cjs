const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } =
  require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const cliPath = path.join(projectRoot, "dist", "index.js");
const preloadPath = path.join(__dirname, "preload.cjs");
const panelSize = { width: 340, height: 236 };
const widgetSize = { width: 340, height: 196 };
const smokeMode = process.argv.includes("--smoke");

let backend;
let baseUrl;
let tray;
let panelWindow;
let widgetWindow;
let dashboardWindow;
let isQuitting = false;

app.setName("AI Agent Quota");

app.whenReady().then(async () => {
  const port = await findFreePort(4317, 4399);
  baseUrl = `http://127.0.0.1:${port}`;
  backend = spawn(process.env.AIQD_NODE_PATH ?? "node", backendArgs(port), {
    cwd: projectRoot,
    env: process.env,
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
  createTray();
  createPanelWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (backend && !backend.killed) {
    backend.kill();
  }
});

app.on("window-all-closed", () => {
  // Keep the tray app alive until the user chooses Quit from the tray menu.
});

function backendArgs(port) {
  const args = [cliPath, "--port", String(port)];

  if (process.argv.includes("--demo")) {
    args.push("--demo");
  }

  return args;
}

function registerIpc() {
  ipcMain.handle("open-dashboard", () => {
    openDashboardWindow();
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Mini Panel", click: togglePanelWindow },
      { label: "Toggle Desktop Widget", click: toggleWidgetWindow },
      { label: "Open Dashboard", click: openDashboardWindow },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on("click", togglePanelWindow);
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

function togglePanelWindow() {
  if (!panelWindow) {
    createPanelWindow();
  }

  if (panelWindow.isVisible()) {
    panelWindow.hide();
    return;
  }

  positionPanelWindow();
  panelWindow.show();
  panelWindow.focus();
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
    widgetWindow.on("closed", () => {
      widgetWindow = undefined;
    });
  }

  if (widgetWindow.isVisible()) {
    widgetWindow.hide();
    return;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  widgetWindow.setBounds({
    x: workArea.x + workArea.width - widgetSize.width - 24,
    y: workArea.y + 72,
    ...widgetSize
  });
  widgetWindow.show();
}

function openDashboardWindow() {
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

  dashboardWindow.loadURL(baseUrl);
  dashboardWindow.show();
  dashboardWindow.focus();
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
