const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiqdDesktop", {
  hideCurrentWindow: () => ipcRenderer.invoke("hide-current-window"),
  openDashboard: (view, target) => ipcRenderer.invoke("open-dashboard", view, target),
  toggleWidget: () => ipcRenderer.invoke("toggle-widget")
});
