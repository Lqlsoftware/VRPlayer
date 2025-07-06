const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

// Enable hardware acceleration and GPU decoding
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization');

let mainWindow;

// Function to get the appropriate icon based on system theme
function getAppIcon() {
  if (process.platform === 'darwin') {
    // On macOS, use theme-specific icons
    if (nativeTheme.shouldUseDarkColors) {
      return path.join(__dirname, 'assets/icon-macOS-Dark.icns');
    } else {
      return path.join(__dirname, 'assets/icon-macOS-Default.icns');
    }
  } else {
    // On other platforms, use the default icon
    return path.join(__dirname, 'assets/icon.png');
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    },
    icon: getAppIcon(),
    show: false
  });

  // Load the app's index.html
  mainWindow.loadFile('index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Listen for system theme changes on macOS
  if (process.platform === 'darwin') {
    nativeTheme.on('updated', () => {
      // Update the app icon when theme changes
      const newIcon = getAppIcon();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setIcon(newIcon);
      }
    });
  }
}

// Initialize app when ready
app.whenReady().then(() => {
  createWindow();

  // Handle activate event on macOS
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep app running until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开视频文件',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            openVideoFile();
          }
        },
        {
          label: '打开文件夹',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            openVideoFolder();
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'VR',
      submenu: [
        {
          label: '进入VR模式',
          accelerator: 'F11',
          click: () => {
            mainWindow.webContents.send('enter-vr-mode');
          }
        },
        {
          label: '退出VR模式',
          accelerator: 'Escape',
          click: () => {
            mainWindow.webContents.send('exit-vr-mode');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Open video file dialog
async function openVideoFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '视频文件', extensions: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v'] },
      { name: '360度视频', extensions: ['mp4', 'webm'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    mainWindow.webContents.send('load-video', filePath);
  }
}

// Open video folder dialog
async function openVideoFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    const files = fs.readdirSync(folderPath)
      .filter(file => /\.(mp4|webm|avi|mov|mkv|m4v)$/i.test(file))
      .map(file => path.join(folderPath, file));
    
    mainWindow.webContents.send('load-video-folder', files);
  }
}

// IPC event handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// Window control events
ipcMain.on('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('close-window', () => {
  mainWindow.close();
});

// File dialog events
ipcMain.on('open-file-dialog', () => {
  openVideoFile();
});

ipcMain.on('open-folder-dialog', () => {
  openVideoFolder();
});

// Initialize menu
app.whenReady().then(createMenu); 