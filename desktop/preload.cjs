const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiqdDesktop", {
  getLaunchAtStartup: () => ipcRenderer.invoke("launch-at-startup:get"),
  hideCurrentWindow: () => ipcRenderer.invoke("hide-current-window"),
  openDashboard: (view, target) => ipcRenderer.invoke("open-dashboard", view, target),
  setLaunchAtStartup: (enabled) =>
    ipcRenderer.invoke("launch-at-startup:set", Boolean(enabled)),
  toggleWidget: () => ipcRenderer.invoke("toggle-widget")
});
