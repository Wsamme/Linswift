const { app, BrowserWindow, shell, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')

const isDev = Boolean(process.env.ELECTRON_START_URL)

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

  const filePath = path.join(
    os.tmpdir(),
    `linswift-screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  )

  try {
    await runExecFile('screencapture', ['-i', '-x', filePath])
    const fileBuffer = await fs.readFile(filePath)
    return {
      dataUrl: `data:image/png;base64,${fileBuffer.toString('base64')}`,
      capturedAt: new Date().toISOString(),
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
    return
  }

  win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
}

app.whenReady().then(() => {
  const dockIcon = path.join(app.getAppPath(), 'dist', 'pwa-512x512.png')
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(dockIcon)
  }

  ipcMain.handle('desktop:capture-screenshot', async () => {
    return captureScreenshotSelection()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
