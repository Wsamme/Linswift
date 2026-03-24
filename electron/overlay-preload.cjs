const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('overlayBridge', {
  onData: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('desktop:translation-overlay-data', handler)
    return () => ipcRenderer.removeListener('desktop:translation-overlay-data', handler)
  },
  writeClipboardText: (text) => ipcRenderer.invoke('desktop:write-clipboard-text', text),
  collectWords: (words) => ipcRenderer.invoke('desktop:collect-overlay-words', words),
  updateSettings: (partial) => ipcRenderer.invoke('desktop:update-screenshot-settings', partial),
  requestLanguageChange: (targetLang) => ipcRenderer.invoke('desktop:overlay-change-language', targetLang),
  close: () => ipcRenderer.invoke('desktop:hide-translation-overlay'),
})
