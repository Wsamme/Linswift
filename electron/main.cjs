const { app, BrowserWindow, shell, ipcMain, globalShortcut, clipboard, screen } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')

const isDev = Boolean(process.env.ELECTRON_START_URL)
const DEFAULT_DESKTOP_SCREENSHOT_SETTINGS = {
  shortcut: 'CommandOrControl+Shift+2',
  autoCopyText: false,
  previewMode: 'side',
  smartWordsEnabled: true,
}
let desktopScreenshotSettingsCache = null
let registeredScreenshotShortcut = ''
let mainWindow = null
let translationOverlayWindow = null
let captureSelectorWindow = null
let captureIndicatorWindow = null

function runExecFile(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr })
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

async function captureScreenshotSelection() {
  if (process.platform !== 'darwin') {
    throw new Error('截图翻译当前仅支持 macOS 桌面端。')
  }

  const selectionRect = await openCaptureSelectionWindow()
  if (!selectionRect) {
    return null
  }

  const filePath = path.join(
    os.tmpdir(),
    `linswift-screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  )

  try {
    const captureRect = [
      Math.round(selectionRect.x),
      Math.round(selectionRect.y),
      Math.max(1, Math.round(selectionRect.width)),
      Math.max(1, Math.round(selectionRect.height)),
    ].join(',')

    await runExecFile('screencapture', ['-R', captureRect, '-x', filePath])
    const fileBuffer = await fs.readFile(filePath)
    const anchorPoint = {
      x: selectionRect.x + selectionRect.width / 2,
      y: selectionRect.y + selectionRect.height,
    }
    return {
      dataUrl: `data:image/png;base64,${fileBuffer.toString('base64')}`,
      capturedAt: new Date().toISOString(),
      anchorPoint,
      selectionRect,
    }
  } catch (result) {
    const stderr = String(result?.stderr || '')
    const message = stderr.trim().toLowerCase()

    if (
      result?.error?.code === 1 ||
      message.includes('cancel') ||
      message.includes('user canceled')
    ) {
      return null
    }

    if (
      message.includes('not permitted') ||
      message.includes('permission') ||
      message.includes('screen recording')
    ) {
      throw new Error('截图失败：请在系统设置 > 隐私与安全性 > 屏幕录制 中允许 Linswift。')
    }

    throw new Error('截图失败，请检查系统截图权限后重试。')
  } finally {
    await fs.unlink(filePath).catch(() => {})
  }
}

function getDesktopSettingsFilePath() {
  return path.join(app.getPath('userData'), 'desktop-screenshot-settings.json')
}

function normalizeDesktopScreenshotSettings(input = {}) {
  const shortcut = typeof input.shortcut === 'string'
    ? input.shortcut.trim()
    : DEFAULT_DESKTOP_SCREENSHOT_SETTINGS.shortcut
  const previewMode = input.previewMode === 'cover' ? 'cover' : 'side'

  return {
    shortcut: shortcut || DEFAULT_DESKTOP_SCREENSHOT_SETTINGS.shortcut,
    autoCopyText: Boolean(input.autoCopyText),
    previewMode,
    smartWordsEnabled: input.smartWordsEnabled !== false,
  }
}

async function loadDesktopScreenshotSettings() {
  if (desktopScreenshotSettingsCache) return desktopScreenshotSettingsCache

  const filePath = getDesktopSettingsFilePath()
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    desktopScreenshotSettingsCache = normalizeDesktopScreenshotSettings(JSON.parse(raw))
  } catch {
    desktopScreenshotSettingsCache = { ...DEFAULT_DESKTOP_SCREENSHOT_SETTINGS }
  }

  return desktopScreenshotSettingsCache
}

async function saveDesktopScreenshotSettings(nextSettings) {
  const normalized = normalizeDesktopScreenshotSettings(nextSettings)
  desktopScreenshotSettingsCache = normalized
  await fs.writeFile(
    getDesktopSettingsFilePath(),
    JSON.stringify(normalized, null, 2),
    'utf8'
  )
  return normalized
}

function emitScreenshotShortcutTrigger(targetWindow) {
  if (targetWindow.isMinimized()) targetWindow.restore()
  targetWindow.show()
  targetWindow.focus()

  if (targetWindow.webContents.isLoading()) {
    targetWindow.webContents.once('did-finish-load', () => {
      targetWindow.webContents.send('desktop:screenshot-shortcut-trigger')
    })
    return
  }

  targetWindow.webContents.send('desktop:screenshot-shortcut-trigger')
}

function getTranslationOverlayWindow() {
  if (translationOverlayWindow && !translationOverlayWindow.isDestroyed()) {
    return translationOverlayWindow
  }

  const preload = path.join(__dirname, 'overlay-preload.cjs')
  const overlayWindow = new BrowserWindow({
    width: 420,
    height: 520,
    minWidth: 360,
    minHeight: 320,
    maxWidth: 480,
    maxHeight: 760,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    movable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.loadFile(path.join(__dirname, 'translation-overlay.html'))
  overlayWindow.on('closed', () => {
    translationOverlayWindow = null
  })

  translationOverlayWindow = overlayWindow
  return overlayWindow
}

function getCaptureIndicatorWindow(displayBounds) {
  if (captureIndicatorWindow && !captureIndicatorWindow.isDestroyed()) {
    return captureIndicatorWindow
  }

  const preload = path.join(__dirname, 'capture-indicator-preload.cjs')
  const indicatorWindow = new BrowserWindow({
    x: displayBounds.x,
    y: displayBounds.y,
    width: displayBounds.width,
    height: displayBounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  indicatorWindow.setAlwaysOnTop(true, 'screen-saver')
  indicatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  indicatorWindow.setIgnoreMouseEvents(true, { forward: true })
  indicatorWindow.loadFile(path.join(__dirname, 'capture-indicator.html'))
  indicatorWindow.on('closed', () => {
    captureIndicatorWindow = null
  })

  captureIndicatorWindow = indicatorWindow
  return indicatorWindow
}

function showCaptureIndicator(payload) {
  if (!payload?.selectionRect) return

  const rect = payload.selectionRect
  const centerPoint = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
  const display = screen.getDisplayNearestPoint(centerPoint)
  const indicatorWindow = getCaptureIndicatorWindow(display.bounds)
  const sendPayload = () => {
    indicatorWindow.setBounds(display.bounds, false)
    indicatorWindow.webContents.send('desktop:capture-indicator-data', {
      ...payload,
      displayBounds: display.bounds,
    })
    indicatorWindow.showInactive()
  }

  if (indicatorWindow.webContents.isLoading()) {
    indicatorWindow.webContents.once('did-finish-load', sendPayload)
    return
  }

  sendPayload()
}

function hideCaptureIndicator() {
  if (captureIndicatorWindow && !captureIndicatorWindow.isDestroyed()) {
    captureIndicatorWindow.hide()
  }
}

function openCaptureSelectionWindow() {
  return new Promise((resolve) => {
    const cursorPoint = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursorPoint)
    const preload = path.join(__dirname, 'capture-selector-preload.cjs')

    const selectorWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      fullscreenable: false,
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    let settled = false

    const finalize = (value) => {
      if (settled) return
      settled = true
      ipcMain.removeListener('desktop:capture-selection-complete', onComplete)
      ipcMain.removeListener('desktop:capture-selection-cancel', onCancel)
      if (captureSelectorWindow === selectorWindow) {
        captureSelectorWindow = null
      }
      if (!selectorWindow.isDestroyed()) {
        selectorWindow.close()
      }
      resolve(value)
    }

    const onComplete = (event, payload) => {
      if (event.sender !== selectorWindow.webContents) return
      finalize(payload?.selectionRect || null)
    }

    const onCancel = (event) => {
      if (event.sender !== selectorWindow.webContents) return
      finalize(null)
    }

    ipcMain.on('desktop:capture-selection-complete', onComplete)
    ipcMain.on('desktop:capture-selection-cancel', onCancel)

    selectorWindow.on('closed', () => finalize(null))
    selectorWindow.setAlwaysOnTop(true, 'screen-saver')
    selectorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    selectorWindow.loadFile(path.join(__dirname, 'capture-selector.html'))
    selectorWindow.webContents.once('did-finish-load', () => {
      selectorWindow.webContents.send('desktop:capture-selector-init', {
        displayBounds: display.bounds,
      })
      selectorWindow.show()
      selectorWindow.focus()
    })

    captureSelectorWindow = selectorWindow
  })
}

function calculateOverlayBounds(anchorPoint, selectionRect, contentLength) {
  const width = 456
  const estimatedHeight = Math.max(420, Math.min(760, 300 + contentLength * 34))
  const currentPoint = selectionRect
    ? {
        x: selectionRect.x + selectionRect.width / 2,
        y: selectionRect.y + selectionRect.height,
      }
    : (anchorPoint || screen.getCursorScreenPoint())
  const display = screen.getDisplayNearestPoint(currentPoint)
  const workArea = display.workArea

  let x = selectionRect
    ? selectionRect.x
    : currentPoint.x - Math.round(width * 0.4)
  if (x + width > workArea.x + workArea.width - 16) {
    x = workArea.x + workArea.width - width - 16
  }
  if (x < workArea.x + 16) {
    x = workArea.x + 16
  }

  let y = selectionRect
    ? selectionRect.y + selectionRect.height + 28
    : currentPoint.y + 18
  if (y + estimatedHeight > workArea.y + workArea.height - 16) {
    y = selectionRect
      ? selectionRect.y - estimatedHeight - 28
      : currentPoint.y - estimatedHeight - 18
  }
  if (y < workArea.y + 16) {
    y = workArea.y + 16
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height: Math.round(estimatedHeight),
  }
}

function showTranslationOverlay(payload) {
  const overlayWindow = getTranslationOverlayWindow()
  const contentLength = String(payload?.ocrText || '').length
    + String(payload?.translatedText || '').length
    + (Array.isArray(payload?.words) ? payload.words.length * 28 : 0)
  const bounds = calculateOverlayBounds(payload?.anchorPoint, payload?.selectionRect, contentLength)
  const sendPayload = () => {
    overlayWindow.setBounds(bounds, false)
    overlayWindow.webContents.send('desktop:translation-overlay-data', payload)
    overlayWindow.show()
    overlayWindow.focus()
  }

  if (overlayWindow.webContents.isLoading()) {
    overlayWindow.webContents.once('did-finish-load', sendPayload)
    return
  }

  sendPayload()
}

function hideTranslationOverlay() {
  if (translationOverlayWindow && !translationOverlayWindow.isDestroyed()) {
    translationOverlayWindow.hide()
  }
}

function registerDesktopScreenshotShortcut(shortcut) {
  if (registeredScreenshotShortcut) {
    globalShortcut.unregister(registeredScreenshotShortcut)
    registeredScreenshotShortcut = ''
  }

  const normalizedShortcut = String(shortcut || '').trim()
  if (!normalizedShortcut) return false

  const registered = globalShortcut.register(normalizedShortcut, () => {
    const existingWindow = mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : createWindow()
    emitScreenshotShortcutTrigger(existingWindow)
  })

  if (registered) {
    registeredScreenshotShortcut = normalizedShortcut
  }

  return registered
}

function getDesktopScreenshotSettingsPayload(settings) {
  return {
    ...settings,
    shortcutRegistered: settings.shortcut === registeredScreenshotShortcut,
  }
}

function createWindow() {
  const preload = path.join(__dirname, 'preload.cjs')
  const appIcon = path.join(app.getAppPath(), 'dist', 'pwa-512x512.png')

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: '#FFFFFF',
    title: 'Linswift',
    icon: appIcon,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL)
    win.webContents.openDevTools({ mode: 'detach' })
    mainWindow = win
    return win
  }

  win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })
  return win
}

app.whenReady().then(() => {
  const dockIcon = path.join(app.getAppPath(), 'dist', 'pwa-512x512.png')
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(dockIcon)
  }

  loadDesktopScreenshotSettings()
    .then((settings) => {
      registerDesktopScreenshotShortcut(settings.shortcut)
    })
    .catch(() => {})

  ipcMain.handle('desktop:capture-screenshot', async () => {
    return captureScreenshotSelection()
  })

  ipcMain.handle('desktop:show-translation-overlay', async (_event, payload) => {
    showTranslationOverlay(payload || {})
    return { ok: true }
  })

  ipcMain.handle('desktop:show-capture-indicator', async (_event, payload) => {
    showCaptureIndicator(payload || {})
    return { ok: true }
  })

  ipcMain.handle('desktop:hide-capture-indicator', async () => {
    hideCaptureIndicator()
    return { ok: true }
  })

  ipcMain.handle('desktop:hide-translation-overlay', async () => {
    hideTranslationOverlay()
    return { ok: true }
  })

  ipcMain.handle('desktop:get-screenshot-settings', async () => {
    const settings = await loadDesktopScreenshotSettings()
    return getDesktopScreenshotSettingsPayload(settings)
  })

  ipcMain.handle('desktop:update-screenshot-settings', async (_event, partial) => {
    const current = await loadDesktopScreenshotSettings()
    const next = await saveDesktopScreenshotSettings({
      ...current,
      ...(partial || {}),
    })
    const shortcutRegistered = registerDesktopScreenshotShortcut(next.shortcut)
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
      mainWindow.webContents.send('desktop:screenshot-settings-updated', {
        ...next,
        shortcutRegistered,
      })
    }
    return {
      ...next,
      shortcutRegistered,
    }
  })

  ipcMain.handle('desktop:write-clipboard-text', async (_event, text) => {
    clipboard.writeText(String(text || ''))
    return { ok: true }
  })

  ipcMain.handle('desktop:collect-overlay-words', async (_event, words) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:collect-overlay-words', Array.isArray(words) ? words : [])
    }
    return { ok: true }
  })

  ipcMain.handle('desktop:overlay-change-language', async (_event, targetLang) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:overlay-target-language', String(targetLang || ''))
    }
    return { ok: true }
  })

  createWindow()

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
