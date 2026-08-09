const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiqdDesktop", {
  hideCurrentWindow: () => ipcRenderer.invoke("hide-current-window"),
  openDashboard: () => ipcRenderer.invoke("open-dashboard"),
  toggleWidget: () => ipcRenderer.invoke("toggle-widget")
});
