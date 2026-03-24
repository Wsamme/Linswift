const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronShell', {
  isDesktop: true,
  platform: process.platform,
  captureScreenshot: () => ipcRenderer.invoke('desktop:capture-screenshot'),
  getDesktopScreenshotSettings: () => ipcRenderer.invoke('desktop:get-screenshot-settings'),
  updateDesktopScreenshotSettings: (partial) =>
    ipcRenderer.invoke('desktop:update-screenshot-settings', partial),
  writeClipboardText: (text) => ipcRenderer.invoke('desktop:write-clipboard-text', text),
  showCaptureIndicator: (payload) =>
    ipcRenderer.invoke('desktop:show-capture-indicator', payload),
  hideCaptureIndicator: () =>
    ipcRenderer.invoke('desktop:hide-capture-indicator'),
  showDesktopTranslationOverlay: (payload) =>
    ipcRenderer.invoke('desktop:show-translation-overlay', payload),
  hideDesktopTranslationOverlay: () =>
    ipcRenderer.invoke('desktop:hide-translation-overlay'),
  requestOverlayLanguageChange: (targetLang) =>
    ipcRenderer.invoke('desktop:overlay-change-language', targetLang),
  onCollectOverlayWords: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('desktop:collect-overlay-words', handler)
    return () => ipcRenderer.removeListener('desktop:collect-overlay-words', handler)
  },
  onScreenshotSettingsUpdated: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('desktop:screenshot-settings-updated', handler)
    return () => ipcRenderer.removeListener('desktop:screenshot-settings-updated', handler)
  },
  onScreenshotShortcut: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = () => callback()
    ipcRenderer.on('desktop:screenshot-shortcut-trigger', handler)
    return () => ipcRenderer.removeListener('desktop:screenshot-shortcut-trigger', handler)
  },
  onOverlayTargetLanguageChange: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('desktop:overlay-target-language', handler)
    return () => ipcRenderer.removeListener('desktop:overlay-target-language', handler)
  },
})
