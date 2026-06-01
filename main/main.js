const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage } = require('electron');
const path = require('path');

let win;
let tray;
let isQuitting = false;
let timerState = { phase: 'idle', time: '25:00' };

function createTrayIcon() {
  // Generate a 16x16 red circle icon for the tray
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, r = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        canvas[i] = 239;     // R
        canvas[i + 1] = 68;  // G
        canvas[i + 2] = 68;  // B
        canvas[i + 3] = 255; // A
      } else {
        canvas[i + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createWindow() {
  win = new BrowserWindow({
    width: 380,
    height: 540,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    icon: createTrayIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('src/index.html');
  win.setAlwaysOnTop(false);

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Pomodoro - 25:00');
  updateTrayMenu();

  tray.on('double-click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
}

function updateTrayMenu() {
  const phaseLabel = timerState.phase === 'focus' ? 'Focus' :
    timerState.phase === 'shortBreak' ? 'Short Break' :
    timerState.phase === 'longBreak' ? 'Long Break' : 'Idle';

  const contextMenu = Menu.buildFromTemplate([
    { label: `${phaseLabel} - ${timerState.time}`, enabled: false },
    { type: 'separator' },
    {
      label: win.isVisible() ? 'Hide Window' : 'Show Window',
      click: () => {
        if (win.isVisible()) { win.hide(); }
        else { win.show(); win.focus(); }
      }
    },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: win.isAlwaysOnTop(),
      click: (item) => {
        win.setAlwaysOnTop(item.checked);
        win.webContents.send('always-on-top-changed', item.checked);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

// IPC handlers
ipcMain.on('update-tray', (_, data) => {
  timerState = data;
  tray.setToolTip(`Pomodoro - ${data.time}`);
  updateTrayMenu();
});

ipcMain.on('show-notification', (_, data) => {
  if (Notification.isSupported()) {
    new Notification({ title: data.title, body: data.body, silent: false }).show();
  }
});

ipcMain.on('hide-window', () => {
  if (win) win.hide();
});

ipcMain.on('toggle-always-on-top', (_, enabled) => {
  if (win) win.setAlwaysOnTop(enabled);
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Don't quit — keep running in tray
});

app.on('activate', () => {
  if (win) { win.show(); }
});

app.on('before-quit', () => {
  isQuitting = true;
});
