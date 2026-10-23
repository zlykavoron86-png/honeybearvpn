// preload.js
const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),

  // Direct native clipboard
  readClipboard: async () => {
    try {
      return await ipcRenderer.invoke('clipboard:read');
    } catch (e) {
      return clipboard.readText();
    }
  },
  writeClipboard: (text) => clipboard.writeText(text),

  // Node & Subscription Management
  getNodes: () => ipcRenderer.invoke('nodes:get'),
  saveNodes: (nodes) => ipcRenderer.invoke('nodes:save', nodes),
  importLink: (text) => ipcRenderer.invoke('nodes:import', text),
  deleteNode: (id) => ipcRenderer.invoke('nodes:delete', id),
  clearAllNodes: () => ipcRenderer.invoke('nodes:clear-all'),
  pingNode: (node, options) => ipcRenderer.invoke('nodes:ping', { node, options }),
  pingAll: (options) => ipcRenderer.invoke('nodes:ping-all', options),

  // Settings & Routing
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getRouting: () => ipcRenderer.invoke('routing:get'),
  saveRouting: (routing) => ipcRenderer.invoke('routing:save', routing),

  // VPN Connection Controls
  connect: (nodeId) => ipcRenderer.invoke('vpn:connect', nodeId),
  disconnect: () => ipcRenderer.invoke('vpn:disconnect'),
  getStatus: () => ipcRenderer.invoke('vpn:get-status'),
  resetProxy: () => ipcRenderer.invoke('vpn:reset-proxy'),

  // Event Listeners
  onStatusChange: (callback) => {
    ipcRenderer.on('vpn:status', (event, status) => callback(status));
  },
  onLog: (callback) => {
    ipcRenderer.on('core:log', (event, log) => callback(log));
  },
  onTrafficStats: (callback) => {
    ipcRenderer.on('traffic:stats', (event, stats) => callback(stats));
  },
  onKillSwitchAlert: (callback) => {
    ipcRenderer.on('vpn:killswitch-alert', () => callback());
  },

  // System
  getAdminStatus: () => ipcRenderer.invoke('sys:admin-status'),
  openUrl: (url) => ipcRenderer.send('open:url', url),

  // Subscription management
  refreshSubscription: () => ipcRenderer.invoke('sub:refresh'),
  getSubMeta: () => ipcRenderer.invoke('sub:get-meta'),

  // HoneyBear Remnawave integration
  botResetHwid: (subUrl, user) => ipcRenderer.invoke('bot:reset-hwid', { subUrl, user }),
  botGetSubStatus: (subUrl, user) => ipcRenderer.invoke('bot:sub-status', { subUrl, user }),

  // Auto-Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  startUpdate: (downloadUrl) => ipcRenderer.invoke('updater:start', downloadUrl),
  getUpdateStatus: () => ipcRenderer.invoke('updater:get-status'),
  onUpdateEvent: (callback) => {
    ipcRenderer.on('updater:event', (event, data) => callback(data));
  },

  // Clean application exit
  quit: () => ipcRenderer.invoke('app:quit'),
  relaunchAdmin: () => ipcRenderer.invoke('app:relaunch-admin')
});
