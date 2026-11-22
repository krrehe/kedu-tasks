const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, shell, globalShortcut } = require('electron')
const path = require('node:path')

let mainWindow = null
let httpServer = null
let tray = null
let quitting = false
let serverPort = 8787
let hideNoticeShown = false

const startHidden = process.argv.includes('--hidden')

app.setAppUserModelId('com.kedu.tasks')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })
}

async function startEmbeddedServer() {
  const serverEntry = path.join(app.getAppPath(), 'app', 'server', 'index.js')
  const distDir = path.join(app.getAppPath(), 'app', 'client', 'dist')
  const dataDir = path.join(app.getPath('userData'), 'data')
  const { startServer } = require(serverEntry)
  const started = await startServer({
    port: 8787,
    host: '0.0.0.0',
    dataDir,
    distDir,
    quiet: true
  })
  httpServer = started.server
  return started.port
}

function showWindow(quickAdd = false) {
  if (!mainWindow) {
    createWindow(serverPort, true)
  }
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()

  if (quickAdd) {
    const dispatch = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents
        .executeJavaScript("window.dispatchEvent(new CustomEvent('kedu-quick-add'))")
        .catch(() => undefined)
    }
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => setTimeout(dispatch, 400))
    } else {
      setTimeout(dispatch, 160)
    }
  }
}

function createWindow(port, show) {
  serverPort = port
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: '刻度清单',
    backgroundColor: '#f5f6fa',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  Menu.setApplicationMenu(null)

  mainWindow.once('ready-to-show', () => {
    if (show) mainWindow.show()
  })

  mainWindow.on('close', (event) => {
    if (!quitting && tray) {
      event.preventDefault()
      mainWindow.hide()
      if (!hideNoticeShown) {
        hideNoticeShown = true
        try {
          tray.displayBalloon({
            title: '刻度清单',
            content: '已最小化到托盘，任务提醒会继续工作。'
          })
        } catch {
          /* 忽略气泡提示失败 */
        }
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  void mainWindow.loadURL(`http://127.0.0.1:${port}`)
}

function setupTray() {
  if (tray) return
  try {
    let icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon.png'))
    if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 })
    tray = new Tray(icon)
  } catch (err) {
    console.warn('[tray] 创建托盘失败:', err.message)
    tray = null
    return
  }

  tray.setToolTip('刻度清单')
  const login = app.getLoginItemSettings()

  const menu = Menu.buildFromTemplate([
    { label: `刻度清单 ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: '打开刻度清单', click: () => showWindow() },
    { label: '添加任务', click: () => showWindow(true) },
    { type: 'separator' },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: !!login.openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          path: process.execPath,
          args: ['--hidden']
        })
      }
    },
    {
      label: '打开数据文件夹',
      click: () => {
        void shell.openPath(app.getPath('userData'))
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)
  tray.on('click', () => showWindow())
  tray.on('double-click', () => showWindow())
}

function setupGlobalShortcut() {
  try {
    const registered = globalShortcut.register('Control+Alt+K', () => showWindow(true))
    if (!registered) console.warn('[shortcut] 全局快捷键注册失败')
  } catch (err) {
    console.warn('[shortcut]', err.message)
  }
}

async function boot() {
  try {
    const port = await startEmbeddedServer()
    setupTray()
    createWindow(port, !startHidden || !tray)
    setupGlobalShortcut()
  } catch (err) {
    dialog.showErrorBox(
      '刻度清单启动失败',
      `本地服务端口 8787 可能被占用，请关闭占用该端口的程序后重试。\n\n${err.message}`
    )
    app.quit()
  }
}

app.whenReady().then(() => {
  void boot()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(serverPort, true)
    else showWindow()
  })
})

app.on('window-all-closed', () => {
  // 有托盘时保持后台运行，任务提醒才能继续工作
  if (!tray) app.quit()
})

app.on('before-quit', () => {
  quitting = true
  if (httpServer) {
    try {
      httpServer.close()
    } catch {
      /* ignore */
    }
    httpServer = null
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
