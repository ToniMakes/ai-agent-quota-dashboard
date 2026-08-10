const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiqdDesktop", {
  hideCurrentWindow: () => ipcRenderer.invoke("hide-current-window"),
  openDashboard: (view) => ipcRenderer.invoke("open-dashboard", view),
  toggleWidget: () => ipcRenderer.invoke("toggle-widget")
});
