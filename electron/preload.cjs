const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronShell', {
  isDesktop: true,
  platform: process.platform,
  captureScreenshot: () => ipcRenderer.invoke('desktop:capture-screenshot'),
})
