const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiqdDesktop", {
  getDashboardClosePreference: () =>
    ipcRenderer.invoke("dashboard-close-preference:get"),
  getFirstRunOnboarding: () => ipcRenderer.invoke("first-run-onboarding:get"),
  getLaunchAtStartup: () => ipcRenderer.invoke("launch-at-startup:get"),
  hideCurrentWindow: () => ipcRenderer.invoke("hide-current-window"),
  openDashboard: (view, target) => ipcRenderer.invoke("open-dashboard", view, target),
  setDashboardClosePreference: (mode) =>
    ipcRenderer.invoke("dashboard-close-preference:set", mode),
  setFirstRunOnboarding: (preferences) =>
    ipcRenderer.invoke("first-run-onboarding:set", preferences),
  setLaunchAtStartup: (enabled) =>
    ipcRenderer.invoke("launch-at-startup:set", Boolean(enabled)),
  toggleWidget: () => ipcRenderer.invoke("toggle-widget")
});
