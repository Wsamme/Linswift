const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('captureIndicatorBridge', {
  onData: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('desktop:capture-indicator-data', handler)
    return () => ipcRenderer.removeListener('desktop:capture-indicator-data', handler)
  },
})
