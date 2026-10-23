// main.js - Electron Main Process for HoneyBear VPN
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, clipboard, Notification } = require('electron');

app.name = 'HoneyBearVPN';
if (process.platform === 'win32') {
  app.setAppUserModelId('HoneyBearVPN');
}
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const CoreManager = require('./core-manager');
const UpdaterManager = require('./updater-manager');
const { parseInput } = require('./config-parser');
const {
  enableSystemProxy,
  disableSystemProxy,
  disableSystemProxySync,
  installBootGuard,
  removeBootGuard,
  getSystemProxyStatus,
  setSystemDns,
  restoreSystemDns,
  restoreSystemDnsSync
} = require('./proxy-controller');

let mainWindow = null;
let coreManager = null;
let activeNodeId = null;
let subscriptionUrl = null;
let tray = null;
let isQuitting = false;
let updaterManager = null;

// Instant synchronous cleanup (<15ms) guaranteed to finish during Windows shutdown (WM_ENDSESSION)
function emergencyCleanupSync() {
  try {
    stopTrafficMonitor();
  } catch (e) {}
  try {
    disableSystemProxySync();
  } catch (e) {}
  try {
    removeBootGuard();
  } catch (e) {}
  try {
    restoreSystemDnsSync();
  } catch (e) {}
  try {
    if (coreManager) {
      coreManager.stopSync();
    }
  } catch (e) {}
}

// Traffic streaming & monitoring via sing-box Clash API (127.0.0.1:9095)
let trafficReq = null;
let sessionTotalUp = 0;
let sessionTotalDown = 0;

function startTrafficMonitor() {}

function stopTrafficMonitor() {
  if (trafficReq) {
    try { trafficReq.destroy(); } catch (e) {}
    trafficReq = null;
  }
}

let notificationIconPath = null;
function getNotificationIcon() {
  if (notificationIconPath && fs.existsSync(notificationIconPath)) {
    return notificationIconPath;
  }
  try {
    const userData = app.getPath('userData');
    const targetPath = path.join(userData, 'honeybear-logo.jpg');
    if (!fs.existsSync(targetPath)) {
      const srcBear = path.join(__dirname, 'assets', 'bear.jpg');
      const srcIco = path.join(__dirname, 'assets', 'icon.ico');
      if (fs.existsSync(srcBear)) {
        fs.copyFileSync(srcBear, targetPath);
      } else if (fs.existsSync(srcIco)) {
        fs.copyFileSync(srcIco, targetPath);
      }
    }
    if (fs.existsSync(targetPath)) {
      notificationIconPath = targetPath;
      return notificationIconPath;
    }
  } catch (e) {}
  return path.join(__dirname, 'assets', 'icon.ico');
}

// Windows native desktop notifications
function showNativeNotification(title, body) {
  try {
    if (Notification.isSupported()) {
      const icon = getNotificationIcon();
      const notif = new Notification({
        title,
        body,
        icon: icon,
        silent: false
      });
      notif.show();
    }
  } catch (e) {}
}

// Check if running as Windows Administrator
function checkIsAdmin() {
  try {
    const { execSync } = require('child_process');
    const result = execSync('net session 2>&1', { windowsHide: true, timeout: 2000 });
    return true;
  } catch (e) {
    return false;
  }
}
const isAdmin = checkIsAdmin();

function getStoragePath() {
  const dir = app.getPath('userData');
  return path.join(dir, 'honey-bear-nodes.json');
}

function getSettingsPath() {
  const dir = app.getPath('userData');
  return path.join(dir, 'honey-bear-settings.json');
}

function loadSavedData() {
  try {
    const p = getStoragePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      activeNodeId = data.activeNodeId || null;
      return data.nodes || [];
    }
  } catch (err) {
    console.error('Failed to load saved nodes:', err);
  }
  return [];
}

function saveData(nodes, activeId) {
  try {
    const p = getStoragePath();
    fs.writeFileSync(p, JSON.stringify({ nodes, activeNodeId: activeId }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save data:', err);
  }
}

function loadSettings() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (!data.routing) {
        data.routing = {
          mode: 'whitelist',
          apps: { discord: true, telegram: false, youtube: false, browsers: false },
          custom: [],
          adblock: true
        };
      } else if (data.routing.adblock === undefined) {
        data.routing.adblock = true;
      }
      if (data.killSwitch === undefined) data.killSwitch = false;
      if (data.silentStart === undefined) data.silentStart = false;
      if (data.comssDns === undefined) data.comssDns = true;
      if (!data.pingType || data.pingType === 'viaProxy') {
        data.pingType = 'icmp';
      }
      if (!data.pingResultType || data.pingResultType === 'time') {
        data.pingResultType = 'ms';
      }
      return data;
    }
  } catch (e) {}
  return {
    pingType: 'icmp',
    testUrl: 'https://www.gstatic.com/generate_204',
    pingResultType: 'ms',
    tunMode: true,
    killSwitch: false,
    silentStart: false,
    comssDns: true,
    routing: {
      mode: 'whitelist',
      apps: { discord: true, telegram: false, youtube: false, browsers: false },
      custom: [],
      adblock: true
    }
  };
}

function saveSettings(settings) {
  try {
    const p = getSettingsPath();
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {}
}

function createWindow(startSilent = false) {
  mainWindow = new BrowserWindow({
    width: 620,
    height: 800,
    minWidth: 500,
    minHeight: 680,
    maxWidth: 950,
    maxHeight: 1150,
    resizable: true,
    frame: false,
    autoHideMenuBar: true,
    transparent: false,
    backgroundColor: '#0B0C0E',
    show: !startSilent,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'HoneyBear VPN',
    icon: path.join(__dirname, 'assets', 'icon.ico')
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => console.error('FAIL LOAD:', code, desc));

  if (!startSilent) {
    mainWindow.once('ready-to-show', () => {
      if (mainWindow) mainWindow.show();
    });
  }

  mainWindow.on('session-end', () => {
    emergencyCleanupSync();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Force clean quit with complete termination of sing-box and network cleanup
async function forceCleanQuit() {
  if (isQuitting) return;
  isQuitting = true;
  console.log('[HoneyBear] Полный выход: очистка сетевых настроек и остановка процессов...');
  emergencyCleanupSync();
  try {
    await disableSystemProxy();
  } catch (e) {}
  try {
    if (coreManager) await coreManager.stop();
  } catch (e) {}
  if (tray) {
    try { tray.destroy(); } catch (e) {}
    tray = null;
  }
  app.exit(0);
}

function updateTrayStatus(state, nodeName = null) {
  if (!tray) return;

  const isConnected = state === 'connected';
  const isConnecting = state === 'connecting';

  let statusText = 'Отключено';
  let statusEmoji = '⚪';
  if (isConnected) {
    statusText = `Подключено: ${nodeName || 'VPN'}`;
    statusEmoji = '🟢';
  } else if (isConnecting) {
    statusText = 'Подключение...';
    statusEmoji = '🟡';
  }

  tray.setToolTip(`HoneyBear VPN • ${statusText}`);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `${statusEmoji} HoneyBear VPN: ${statusText}`,
      enabled: false
    },
    {
      type: 'separator'
    },
    {
      label: mainWindow && mainWindow.isVisible() ? 'Скрыть окно' : 'Открыть главное окно',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: isConnected ? '⏹ Отключить VPN' : '▶ Подключить VPN',
      click: async () => {
        if (isConnected) {
          disableSystemProxySync();
          await disableSystemProxy();
          if (coreManager) await coreManager.stop();
        } else {
          const nodes = loadSavedData();
          const target = nodes.find(n => n.id === activeNodeId) || nodes[0];
          if (target) {
            const settings = loadSettings();
            await coreManager.start(target, {
              mixedPort: 20808,
              routing: settings.routing,
              tunMode: settings.tunMode !== false,
              comssDns: settings.comssDns !== false,
              allNodes: nodes
            });
            if (!coreManager.activeTunMode) {
              await enableSystemProxy(20808);
            } else {
              disableSystemProxySync();
              installBootGuard();
            }
          }
        }
      }
    },
    {
      label: '🛡 Сбросить прокси и адаптеры',
      click: async () => {
        emergencyCleanupSync();
        await disableSystemProxy();
        if (coreManager) await coreManager.stop();
        showNativeNotification('HoneyBear VPN', 'Сетевые адаптеры и DNS сброшены!');
      }
    },
    {
      type: 'separator'
    },
    {
      label: '❌ Выход (закрыть всё и отключить)',
      click: async () => {
        await forceCleanQuit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon);
  updateTrayStatus(coreManager && coreManager.isRunning ? 'connected' : 'disconnected');

  tray.on('click', () => {
    if (!mainWindow) {
      createWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('right-click', () => {
    const isVpnRunning = coreManager ? coreManager.isRunning : false;
    const nodes = loadSavedData();
    const node = nodes.find(n => n.id === activeNodeId);
    updateTrayStatus(isVpnRunning ? 'connected' : 'disconnected', node ? (node.name || node.server) : null);
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Startup Self-Healing: automatically clear any leftover system proxy, stale sing-box, or DNS cache from a previous power-off
  emergencyCleanupSync();

  coreManager = new CoreManager(app.getPath('userData'));
  coreManager.prewarmBinaries();

  coreManager.onLog((log) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('core:log', log);
    }
  });

  coreManager.onStatus((status) => {
    const nodes = loadSavedData();
    const node = nodes.find(n => n.id === activeNodeId);
    const nodeName = node ? (node.name || node.server) : null;
    updateTrayStatus(status.state, nodeName);

    if (status.state === 'connected') {
      setTimeout(() => startTrafficMonitor(), 600);
      showNativeNotification('HoneyBear VPN', `Подключено: ${nodeName || 'VPN'}`);
    } else if (status.state === 'disconnected') {
      stopTrafficMonitor();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('traffic:stats', {
          up: 0,
          down: 0,
          totalUp: sessionTotalUp,
          totalDown: sessionTotalDown
        });
      }
      showNativeNotification('HoneyBear VPN', 'VPN отключен');
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('vpn:status', {
        state: status.state,
        startTime: status.startTime,
        activeNodeId: activeNodeId
      });
    }
  });

  // Handle sing-box crash / unexpected disconnect
  coreManager.onCrash(async (code) => {
    console.warn(`[HoneyBear] sing-box неожиданно упал (код ${code})`);
    stopTrafficMonitor();
    const currentSet = loadSettings();
    if (currentSet.killSwitch) {
      console.warn('[HoneyBear] Kill Switch активен: предотвращение утечки трафика');
      showNativeNotification('HoneyBear VPN • Kill Switch', 'Внимание! Соединение разорвано. Доступ в интернет временно заблокирован для защиты ваших данных.');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('vpn:killswitch-alert');
      }
    } else {
      try {
        await disableSystemProxy();
      } catch (e) {
        console.error('[HoneyBear] Ошибка сброса прокси после падения:', e);
      }
    }
  });

  const settings = loadSettings();
  if (settings.comssDns) {
    setSystemDns().catch((e) => console.warn('[HoneyBear] Auto-set DNS on launch warning:', e.message));
  }
  const isSilentLaunch = settings.silentStart || process.argv.includes('--silent') || process.argv.includes('--minimized');
  createWindow(isSilentLaunch);
  createTray();

  // Initialize GitHub Auto-Updater
  updaterManager = new UpdaterManager({
    currentVersion: '1.2.0',
    repo: settings.updateRepo || 'zlykavoron86-png/honeybearvpn',
    checkOnStartup: settings.autoUpdate !== false
  });

  updaterManager.onEvent((eventData) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:event', eventData);
    }
  });

  if (settings.autoUpdate !== false) {
    setTimeout(() => {
      if (updaterManager) {
        updaterManager.checkForUpdates().catch((e) => {
          console.log('[HoneyBear Updater] Startup update check failed:', e.message);
        });
      }
    }, 2500);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Window controls
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:close', () => {
  // Hide to tray instead of quitting to keep VPN alive in background
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('app:quit', async () => {
  await forceCleanQuit();
});

// Node & Subscriptions IPC
ipcMain.handle('nodes:get', async () => {
  const nodes = loadSavedData();
  return { nodes, activeNodeId };
});

ipcMain.handle('nodes:save', async (event, { nodes, activeId }) => {
  activeNodeId = activeId;
  saveData(nodes, activeId);
  return true;
});

ipcMain.handle('nodes:import', async (event, text) => {
  try {
    const res = await parseInput(text);
    const existing = loadSavedData();
    const newNodes = [...existing];

    for (const server of res.servers) {
      const idx = newNodes.findIndex(n => n.server === server.server && n.name === server.name);
      if (idx >= 0) {
        newNodes[idx] = server;
      } else {
        newNodes.push(server);
      }
    }

    if (!activeNodeId && newNodes.length > 0) {
      activeNodeId = newNodes[0].id;
    }

    // Track subscription URL for later refresh
    if (res.type === 'subscription' && res.url) {
      subscriptionUrl = res.url;
      const s = loadSettings();
      s.subscriptionUrl = res.url;
      s.subscriptionMeta = res.meta || null;
      saveSettings(s);
    }

    saveData(newNodes, activeNodeId);
    return { success: true, count: res.servers.length, nodes: newNodes, activeNodeId, meta: res.meta || null };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('nodes:delete', async (event, id) => {
  const existing = loadSavedData();
  const updated = existing.filter(n => n.id !== id);
  if (activeNodeId === id) {
    activeNodeId = updated.length > 0 ? updated[0].id : null;
  }
  if (updated.length === 0) {
    subscriptionUrl = null;
    const settings = loadSettings();
    settings.subscriptionUrl = null;
    settings.subscriptionMeta = null;
    saveSettings(settings);
  }
  saveData(updated, activeNodeId);
  return { success: true, nodes: updated, activeNodeId };
});

ipcMain.handle('nodes:clear-all', async () => {
  saveData([], null);
  activeNodeId = null;
  subscriptionUrl = null;
  const settings = loadSettings();
  settings.subscriptionUrl = null;
  settings.subscriptionMeta = null;
  saveSettings(settings);
  return { success: true, nodes: [], activeNodeId: null };
});

// Native Clipboard IPC
ipcMain.handle('clipboard:read', () => {
  try {
    return clipboard.readText();
  } catch (e) {
    return '';
  }
});

// Settings IPC
ipcMain.handle('settings:get', async () => {
  return loadSettings();
});

ipcMain.handle('settings:save', async (event, newSettings) => {
  const existing = loadSettings();
  const merged = { ...existing, ...newSettings };
  // Preserve routing if not explicitly provided in the new settings
  if (existing.routing && !newSettings.routing) {
    merged.routing = existing.routing;
  }
  saveSettings(merged);

  // Check if Comss.one DNS setting changed
  if (newSettings.comssDns !== undefined && newSettings.comssDns !== existing.comssDns) {
    try {
      if (newSettings.comssDns) {
        await setSystemDns();
      } else {
        await restoreSystemDns();
      }
    } catch (err) {
      console.warn('[HoneyBear] DNS system switch warning:', err.message);
    }

    if (coreManager && coreManager.isRunning) {
      await coreManager.updateOptions({ comssDns: newSettings.comssDns });
    }
  }

  return true;
});

ipcMain.handle('nodes:ping', async (event, { node, options }) => {
  const settings = loadSettings();
  const opts = { ...settings, ...(options || {}) };
  return await coreManager.pingNode(node, opts);
});

ipcMain.handle('nodes:ping-all', async (event, options) => {
  const nodes = loadSavedData();
  const settings = loadSettings();
  const opts = { ...settings, ...(options || {}) };
  const results = {};
  await Promise.all(nodes.map(async (node) => {
    results[node.id] = await coreManager.pingNode(node, opts);
  }));
  return results;
});

// Connection IPC
ipcMain.handle('vpn:connect', async (event, nodeId) => {
  try {
    const nodes = loadSavedData();
    const target = nodes.find(n => n.id === nodeId) || nodes[0];
    if (!target) {
      return { success: false, error: 'Сервер не выбран' };
    }

    activeNodeId = target.id;
    saveData(nodes, activeNodeId);

    const settings = loadSettings();

    // 1. Start core with routing options & TUN mode & Comss DNS & all available nodes
    await coreManager.start(target, {
      mixedPort: 20808,
      routing: settings.routing,
      tunMode: settings.tunMode !== false,
      comssDns: settings.comssDns !== false,
      allNodes: nodes
    });

    // 2. Pure TUN mode: do NOT enable Windows System Proxy (which forces all browser traffic into 127.0.0.1:20808).
    // Only enable System Proxy if TUN mode is off/unavailable.
    if (!coreManager.activeTunMode) {
      await enableSystemProxy(20808);
    } else {
      disableSystemProxySync();
      installBootGuard();
    }

    return { success: true, node: target };
  } catch (err) {
    disableSystemProxySync();
    await disableSystemProxy();
    return { success: false, error: err.message };
  }
});

// Routing IPC
ipcMain.handle('routing:get', async () => {
  const settings = loadSettings();
  return settings.routing;
});

ipcMain.handle('routing:save', async (event, routingSettings) => {
  const settings = loadSettings();
  settings.routing = routingSettings;
  saveSettings(settings);
  if (coreManager) {
    await coreManager.updateRouting(routingSettings);
  }
  return true;
});

ipcMain.handle('vpn:disconnect', async () => {
  try {
    stopTrafficMonitor();
    disableSystemProxySync();
    await disableSystemProxy();
    await coreManager.stop();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('vpn:get-status', async () => {
  const proxyStatus = await getSystemProxyStatus();
  return {
    isRunning: coreManager ? coreManager.isRunning : false,
    activeNodeId: activeNodeId,
    systemProxy: proxyStatus.enabled,
    startTime: coreManager ? coreManager.startTime : null
  };
});

ipcMain.handle('vpn:reset-proxy', async () => {
  try {
    emergencyCleanupSync();
    await disableSystemProxy();
    if (coreManager) await coreManager.stop();
    showNativeNotification('HoneyBear VPN', 'Сетевые адаптеры и DNS сброшены!');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Clean shutdown & Windows session-end protection (PC Shutdown / Restart / Sign-out)
app.on('session-end', () => {
  emergencyCleanupSync();
});

app.on('before-quit', () => {
  emergencyCleanupSync();
});

app.on('will-quit', () => {
  emergencyCleanupSync();
});

process.on('exit', () => {
  emergencyCleanupSync();
});

process.on('SIGINT', () => {
  emergencyCleanupSync();
  process.exit(0);
});

process.on('SIGTERM', () => {
  emergencyCleanupSync();
  process.exit(0);
});

// System / UI helpers
ipcMain.handle('sys:admin-status', () => {
  return { isAdmin };
});

ipcMain.handle('app:relaunch-admin', async () => {
  try {
    const { exec } = require('child_process');
    const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
    const rootLauncher = path.resolve(__dirname, '..', '..', '..', '..', 'HoneyBearVPN.exe');
    const rootLauncher2 = path.resolve(process.cwd(), 'HoneyBearVPN.exe');
    const localLauncher = path.join(path.dirname(process.execPath), 'HoneyBearVPN.exe');
    let target = process.execPath;
    if (portableExe && fs.existsSync(portableExe)) target = portableExe;
    else if (fs.existsSync(rootLauncher)) target = rootLauncher;
    else if (fs.existsSync(rootLauncher2)) target = rootLauncher2;
    else if (fs.existsSync(localLauncher)) target = localLauncher;

    console.log('[HoneyBear] Перезапуск с правами Администратора:', target);
    exec(`powershell -NoProfile -Command "Start-Process -FilePath '${target}' -Verb RunAs"`, { windowsHide: true });
    setTimeout(async () => {
      await forceCleanQuit();
    }, 600);
    return { success: true };
  } catch (err) {
    console.error('[HoneyBear] Ошибка relaunch-admin:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.on('open:url', (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('tg://'))) {
    shell.openExternal(url);
  }
});

// Subscription refresh IPC
ipcMain.handle('sub:refresh', async () => {
  try {
    const settings = loadSettings();
    let url = subscriptionUrl || settings.subscriptionUrl;
    if (!url) {
      const nodes = loadSavedData();
      const subNode = nodes.find(n => n.subscriptionUrl);
      if (subNode) {
        url = subNode.subscriptionUrl;
        settings.subscriptionUrl = url;
        saveSettings(settings);
      }
    }
    if (!url) return { success: false, error: 'URL подписки не сохранён. Добавьте подписку заново.' };

    const res = await parseInput(url);
    const newNodes = res.servers;
    if (!activeNodeId && newNodes.length > 0) activeNodeId = newNodes[0].id;
    saveData(newNodes, activeNodeId);

    if (res.meta) {
      settings.subscriptionMeta = res.meta;
      saveSettings(settings);
    }

    return { success: true, count: newNodes.length, nodes: newNodes, activeNodeId, meta: res.meta || null };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sub:get-meta', async () => {
  const settings = loadSettings();
  if (settings.subscriptionMeta) return settings.subscriptionMeta;

  // Auto-recover meta from node subscriptionUrl if missing
  let url = subscriptionUrl || settings.subscriptionUrl;
  if (!url) {
    const nodes = loadSavedData();
    const subNode = nodes.find(n => n.subscriptionUrl);
    if (subNode) url = subNode.subscriptionUrl;
  }

  if (url) {
    try {
      const res = await parseInput(url);
      if (res.meta) {
        settings.subscriptionMeta = res.meta;
        settings.subscriptionUrl = url;
        saveSettings(settings);
        return res.meta;
      }
    } catch (e) {}
  }

  return null;
});

// ==========================================
// HoneyBear Bot & Remnawave Integration IPC
// ==========================================
function getBotApiEndpoints() {
  const endpoints = [];
  try {
    const settings = loadSettings();
    if (settings && settings.botApiUrl) {
      endpoints.push(settings.botApiUrl.trim().replace(/\/+$/, ''));
    }
  } catch (e) {}

  // Secure public endpoint fallback (HTTPS only, no hardcoded IPs)
  const defaultSecureEndpoint = 'https://russia.honeybear.surf';
  if (!endpoints.includes(defaultSecureEndpoint)) {
    endpoints.push(defaultSecureEndpoint);
  }
  return endpoints;
}

function getBotApiPin() {
  try {
    if (process.env.HONEYBEAR_API_PIN) return process.env.HONEYBEAR_API_PIN.trim();
    const settings = loadSettings();
    if (settings && settings.botApiPin) return settings.botApiPin.trim();
  } catch (e) {}
  return null;
}

async function callBotApi(endpointPath, body = {}) {
  const endpoints = getBotApiEndpoints();
  const pin = getBotApiPin();

  for (const base of endpoints) {
    try {
      const url = `${base}${endpointPath}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const headers = {
        'Content-Type': 'application/json'
      };
      if (pin) {
        headers['X-Radar-Pin'] = pin;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      return { success: res.ok, data, status: res.status };
    } catch (err) {
      continue;
    }
  }
  return { success: false, error: 'Сервер HoneyBear AI временно недоступен' };
}

function resolveSubscriptionUrl(subUrl) {
  if (subUrl) return subUrl;
  try {
    const settings = loadSettings();
    if (settings && settings.subscriptionUrl) return settings.subscriptionUrl;
    const nodes = loadSavedData();
    const subNode = nodes.find(n => n.subscriptionUrl);
    if (subNode) return subNode.subscriptionUrl;
  } catch (e) {}
  return null;
}

ipcMain.handle('bot:reset-hwid', async (event, args = {}) => {
  try {
    const subUrl = resolveSubscriptionUrl(args.subUrl);
    const user = args.user || null;
    const res = await callBotApi('/api/vpn/reset-hwid', {
      subscription_url: subUrl,
      username: user
    });
    if (res.success && res.data) {
      showNativeNotification('HoneyBear VPN', res.data.message || 'Привязка HWID успешно сброшена!');
      return { success: true, message: res.data.message, username: res.data.username };
    }
    return { success: false, error: res.data?.message || res.error || 'Ошибка сброса HWID' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('bot:sub-status', async (event, args = {}) => {
  try {
    const subUrl = resolveSubscriptionUrl(args.subUrl);
    const user = args.user || null;
    const res = await callBotApi('/api/vpn/subscription-status', {
      subscription_url: subUrl,
      username: user
    });
    if (res.success && res.data) {
      return { success: true, data: res.data };
    }
    return { success: false, error: res.data?.message || res.error || 'Ошибка получения статуса' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Auto-Updater IPC
ipcMain.handle('updater:check', async () => {
  if (!updaterManager) return { hasUpdate: false, error: 'Updater not initialized' };
  return await updaterManager.checkForUpdates();
});

ipcMain.handle('updater:start', async (event, downloadUrl) => {
  if (!updaterManager) throw new Error('Updater not initialized');
  return await updaterManager.downloadAndInstall(downloadUrl);
});

ipcMain.handle('updater:get-status', () => {
  if (!updaterManager) return { status: 'idle', currentVersion: '1.2.0' };
  return {
    status: updaterManager.status,
    currentVersion: updaterManager.appVersion,
    updateInfo: updaterManager.updateInfo,
    lastChecked: updaterManager.lastChecked,
    wasJustUpdated: process.argv.includes('--updated')
  };
});


