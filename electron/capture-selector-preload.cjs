const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('captureSelectorBridge', {
  onInit: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('desktop:capture-selector-init', handler)
    return () => ipcRenderer.removeListener('desktop:capture-selector-init', handler)
  },
  complete: (selectionRect) => ipcRenderer.send('desktop:capture-selection-complete', { selectionRect }),
  cancel: () => ipcRenderer.send('desktop:capture-selection-cancel'),
})
