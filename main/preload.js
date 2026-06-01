const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  updateTray: (data) => ipcRenderer.send('update-tray', data),
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  onAlwaysOnTopChanged: (callback) => {
    ipcRenderer.on('always-on-top-changed', (_, value) => callback(value));
  },
  hideWindow: () => ipcRenderer.send('hide-window'),
  toggleAlwaysOnTop: (enabled) => ipcRenderer.send('toggle-always-on-top', enabled)
});
