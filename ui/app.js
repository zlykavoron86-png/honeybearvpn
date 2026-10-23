// ui/app.js - Logic for compact native HoneyBear VPN app (Happ-like Ping, Flags, Live Timer)

// State
let nodes = [];
let activeNodeId = null;
let connectionState = 'disconnected'; // disconnected, connecting, connected
let sessionStartTime = null;
let sessionTimerInterval = null;
let pingMap = {};
let currentSettings = {
  pingType: 'icmp',
  testUrl: 'https://www.gstatic.com/generate_204',
  pingResultType: 'ms'
};

// DOM Elements
const btnMinimize = document.getElementById('btn-minimize');
const btnClose = document.getElementById('btn-close');

const btnQuickPaste = document.getElementById('btn-quick-paste');
const btnRoutingToggle = document.getElementById('btn-routing-toggle');
const btnSettingsToggle = document.getElementById('btn-settings-toggle');

// Routing / Split Tunneling Elements
const routingSheet = document.getElementById('routing-sheet');
const btnCloseRoutingSheet = document.getElementById('btn-close-routing-sheet');
const routingModeRadios = document.querySelectorAll('input[name="routingMode"]');
const toggleDiscord = document.getElementById('toggle-app-discord');
const toggleTelegram = document.getElementById('toggle-app-telegram');
const toggleYoutube = document.getElementById('toggle-app-youtube');
const toggleBrowsers = document.getElementById('toggle-app-browsers');
const toggleAdblock = document.getElementById('toggle-app-adblock');
const customRoutingInput = document.getElementById('custom-routing-input');
const btnAddCustomRoute = document.getElementById('btn-add-custom-route');
const customChipsList = document.getElementById('custom-chips-list');
const routingSuggestionsDropdown = document.getElementById('routing-suggestions-dropdown');

let currentRouting = {
  mode: 'whitelist',
  adblock: true,
  apps: {
    discord: true,
    telegram: false,
    youtube: false,
    browsers: false
  },
  custom: []
};

const mascotFrameOuter = document.querySelector('.mascot-frame-outer');
const statusDot = document.getElementById('status-dot');
const statusTitle = document.getElementById('status-title');

// Active Server Card
const serverCardTrigger = document.getElementById('server-card-trigger');
const activeServerFlag = document.getElementById('active-server-flag');
const activeServerName = document.getElementById('active-server-name');
const activeServerProto = document.getElementById('active-server-proto');
const activeServerPing = document.getElementById('active-server-ping');

// Big Connect Button
const btnConnect = document.getElementById('btn-connect');
const btnPowerIcon = document.getElementById('btn-power-icon');
const btnLabel = document.getElementById('btn-label');


// Stats Strip
const statPing = document.getElementById('stat-ping');
const statServersCount = null; // ID doesn't exist in current HTML
const statServersTrigger = null; // ID doesn't exist in current HTML
const statTime = document.getElementById('stat-time');
const statRoutingMode = document.getElementById('stat-routing-mode');

// Servers Sheet
const serversSheet = document.getElementById('servers-sheet');
const btnCloseServersSheet = document.getElementById('btn-close-servers-sheet');
const btnOpenImportModal = document.getElementById('btn-open-add-dialog');
const btnSheetPingAll = document.getElementById('btn-ping-all');
const btnClearAllNodes = document.getElementById('btn-delete-sub');
const sheetNodesBadge = document.getElementById('servers-count');
const serversList = document.getElementById('servers-list');

// Settings Sheet
const settingsSheet = document.getElementById('settings-sheet');
const btnCloseSettingsSheet = document.getElementById('btn-close-settings-sheet');
const btnEmergencyReset = document.getElementById('btn-emergency-reset');
const btnClearLogs = document.getElementById('btn-clear-logs');
const btnFullQuit = document.getElementById('btn-full-quit');
const logsView = document.getElementById('logs-view');

// Settings Controls
const pingTypeSelect = document.getElementById('setting-ping-type');
const pingTestUrlInput = null; // no separate URL input in current HTML
const pingResultSelect = document.getElementById('setting-ping-result-type');
const settingAutoStart = document.getElementById('setting-auto-start');
const settingSilentStart = document.getElementById('setting-silent-start');
const settingKillSwitch = document.getElementById('setting-kill-switch');

// Admin warning
const adminWarningBanner = document.getElementById('admin-warning-banner');
const adminRestartLink = document.getElementById('admin-restart-link');
const btnCloseAdminBanner = document.getElementById('btn-close-admin-banner');

// Telegram channel button
const btnTelegramChannel = document.getElementById('btn-telegram-channel');

// Subscription meta bar
const subMetaBar = document.getElementById('sub-meta-bar');
const subExpireDate = document.getElementById('sub-expire-date');
const subDaysLeft = document.getElementById('sub-days-left');
const subTrafficRow = document.getElementById('sub-traffic-row');
const subTrafficUsed = document.getElementById('sub-traffic-used');
const btnUpdateSub = document.getElementById('btn-update-sub');

// Main screen subscription badge
const mainSubBadge = document.getElementById('main-sub-badge');
const mainSubDate = document.getElementById('main-sub-date');
const mainSubDays = document.getElementById('main-sub-days');

// Subscription Quick Actions / Delete bar
const subActionsBar = document.getElementById('sub-actions-bar');
const subNodesCount = document.getElementById('sub-nodes-count');
const btnDeleteSub = document.getElementById('btn-delete-sub');
const btnResetHwidSub = document.getElementById('btn-reset-hwid-sub');

// DNS Mode (dns.comss.one) Elements
const settingComssDns = document.getElementById('setting-comss-dns');
const toggleAppComssDns = document.getElementById('toggle-app-comss-dns');
const dnsStatusBadge = document.getElementById('dns-status-badge');

// Import Dialog
const importDialog = document.getElementById('import-dialog');
const btnCloseDialog = document.getElementById('btn-close-dialog');
const btnDialogCancel = document.getElementById('btn-dialog-cancel');
const btnDialogSubmit = document.getElementById('btn-dialog-submit');
const btnDialogPaste = document.getElementById('btn-dialog-paste');
const dialogInput = document.getElementById('dialog-input');
const dialogErrorMsg = document.getElementById('dialog-error-msg');

const appToast = document.getElementById('app-toast');

// --- Helper: Clean Server Name (strips leading emojis, flags, sparkles) ---
function cleanServerName(name) {
  if (!name) return 'Узел';
  return name.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uFE0F\u200D\s\-_–—]+/, '').trim() || name;
}

// --- Helper: Flag / Icon Extractor (Returns round SVG flag identical to Happ) ---
function getFlagHtml(name, size = 32) {
  if (!name) return `<div class="flag-circle-globe" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="${Math.round(size*0.65)}" height="${Math.round(size*0.65)}" fill="none" stroke="#FFB300" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>`;
  const lower = name.toLowerCase();

  // 1. Finland
  if (name.includes('🇫🇮') || lower.includes('финлянд') || lower.includes('finland')) {
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);">
      <rect width="32" height="32" fill="#ffffff"/>
      <rect x="0" y="12" width="32" height="8" fill="#003580"/>
      <rect x="9" y="0" width="8" height="32" fill="#003580"/>
    </svg>`;
  }

  // 2. Germany
  if (name.includes('🇩🇪') || lower.includes('герман') || lower.includes('german')) {
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);">
      <rect x="0" y="0" width="32" height="10.66" fill="#151515"/>
      <rect x="0" y="10.66" width="32" height="10.66" fill="#DD0000"/>
      <rect x="0" y="21.32" width="32" height="10.68" fill="#FFCE00"/>
    </svg>`;
  }

  // 3. Netherlands
  if (name.includes('🇳🇱') || lower.includes('нидерланд') || lower.includes('голлан') || lower.includes('netherland')) {
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);">
      <rect x="0" y="0" width="32" height="10.66" fill="#AE1C28"/>
      <rect x="0" y="10.66" width="32" height="10.66" fill="#FFFFFF"/>
      <rect x="0" y="21.32" width="32" height="10.68" fill="#21468B"/>
    </svg>`;
  }

  // 4. USA
  if (name.includes('🇺🇸') || lower.includes('сша') || lower.includes('америк') || lower.includes('usa')) {
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);">
      <rect width="32" height="32" fill="#FFFFFF"/>
      <rect y="0" width="32" height="2.5" fill="#B22234"/>
      <rect y="5" width="32" height="2.5" fill="#B22234"/>
      <rect y="10" width="32" height="2.5" fill="#B22234"/>
      <rect y="15" width="32" height="2.5" fill="#B22234"/>
      <rect y="20" width="32" height="2.5" fill="#B22234"/>
      <rect y="25" width="32" height="2.5" fill="#B22234"/>
      <rect y="29.5" width="32" height="2.5" fill="#B22234"/>
      <rect x="0" y="0" width="14" height="16" fill="#3C3B6E"/>
      <circle cx="4" cy="4" r="1.2" fill="#FFFFFF"/>
      <circle cx="10" cy="4" r="1.2" fill="#FFFFFF"/>
      <circle cx="7" cy="8" r="1.2" fill="#FFFFFF"/>
      <circle cx="4" cy="12" r="1.2" fill="#FFFFFF"/>
      <circle cx="10" cy="12" r="1.2" fill="#FFFFFF"/>
    </svg>`;
  }

  // 5. Sweden
  if (name.includes('🇸🇪') || lower.includes('швеци') || lower.includes('sweden')) {
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);">
      <rect width="32" height="32" fill="#006AA7"/>
      <rect x="0" y="12" width="32" height="8" fill="#FECC00"/>
      <rect x="9" y="0" width="8" height="32" fill="#FECC00"/>
    </svg>`;
  }

  // 6. Russia
  if (name.includes('🇷🇺') || lower.includes('росси') || lower.includes('russia')) {
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);">
      <rect x="0" y="0" width="32" height="10.66" fill="#FFFFFF"/>
      <rect x="0" y="10.66" width="32" height="10.66" fill="#0039A6"/>
      <rect x="0" y="21.32" width="32" height="10.68" fill="#D52B1E"/>
    </svg>`;
  }

  // 7. United Kingdom
  if (name.includes('🇬🇧') || lower.includes('uk') || lower.includes('великобрит') || lower.includes('англи')) {
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.2);">
      <rect width="32" height="32" fill="#012169"/>
      <path d="M0,0 L32,32 M32,0 L0,32" stroke="#fff" stroke-width="6"/>
      <path d="M0,0 L32,32 M32,0 L0,32" stroke="#C8102E" stroke-width="2"/>
      <path d="M16,0 V32 M0,16 H32" stroke="#fff" stroke-width="8"/>
      <path d="M16,0 V32 M0,16 H32" stroke="#C8102E" stroke-width="4.8"/>
    </svg>`;
  }

  // 8. Auto / Sparkle
  if (name.includes('✨') || lower.includes('выбрать') || lower.includes('auto')) {
    return `<div class="flag-circle-auto" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="${Math.round(size*0.6)}" height="${Math.round(size*0.6)}" fill="#FFB300"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z"/></svg></div>`;
  }

  // 9. Any leading emoji fallback
  const emojiMatch = name.match(/^([\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uFE0F\u200D]+)/u);
  if (emojiMatch) {
    return `<div class="flag-circle-emoji" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.55)}px;">${emojiMatch[1]}</div>`;
  }

  return `<div class="flag-circle-globe" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="${Math.round(size*0.65)}" height="${Math.round(size*0.65)}" fill="none" stroke="#FFB300" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>`;
}

// --- Helper: Toast ---
function showToast(msg, duration = 3000) {
  if (!appToast) return;
  appToast.textContent = msg;
  appToast.classList.add('show');
  setTimeout(() => appToast.classList.remove('show'), duration);
}

// --- Speed Graph Wave & Formatter ---
function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec < 1024) return `${bytesPerSec || 0} Б/с`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} КБ/с`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} МБ/с`;
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}


// Window controls
if (btnMinimize) btnMinimize.addEventListener('click', () => window.api.minimize());
if (btnClose) btnClose.addEventListener('click', () => window.api.close());

// --- UI Updates & Live Session Timer ---
const statusSubTimer = document.getElementById('status-sub-timer');
const POWER_ICON_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>';

function updateConnectionUI(state, startTime = null) {
  connectionState = state;

  if (state === 'connected') {
    mascotFrameOuter.classList.add('connected');
    statusDot.className = 'status-dot connected';
    statusTitle.textContent = 'Подключен';

    btnConnect.className = 'connect-button connected';
    btnLabel.textContent = 'Отключить';
    btnPowerIcon.innerHTML = POWER_ICON_SVG;

    if (!sessionStartTime) {
      sessionStartTime = startTime || Date.now();
    }
    startSessionTimer();
  } else if (state === 'connecting') {
    mascotFrameOuter.classList.remove('connected');
    statusDot.className = 'status-dot connecting';
    statusTitle.textContent = 'Подключение...';
    if (statusSubTimer) statusSubTimer.textContent = 'Установка защищенного соединения...';

    btnConnect.className = 'connect-button';
    btnLabel.textContent = 'Подключение...';
    btnPowerIcon.innerHTML = POWER_ICON_SVG;

    stopSessionTimer();
    statTime.textContent = '00:00:00';
  } else {
    mascotFrameOuter.classList.remove('connected');
    statusDot.className = 'status-dot';
    statusTitle.textContent = 'Отключен';
    if (statusSubTimer) statusSubTimer.innerHTML = 'Не в сети &nbsp;•&nbsp; 00:00:00';

    btnConnect.className = 'connect-button';
    btnLabel.textContent = 'Подключить';
    btnPowerIcon.innerHTML = POWER_ICON_SVG;

    stopSessionTimer();
    statTime.textContent = '00:00:00';
  }
}

function startSessionTimer() {
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  
  const tick = () => {
    if (!sessionStartTime || connectionState !== 'connected') return;
    const elapsed = Math.max(0, Math.floor((Date.now() - sessionStartTime) / 1000));
    const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    const timeStr = `${hrs}:${mins}:${secs}`;
    statTime.textContent = timeStr;
    statusTitle.textContent = 'Подключен';
    if (statusSubTimer) statusSubTimer.innerHTML = `В сети &nbsp;•&nbsp; ${timeStr}`;
  };

  tick();
  sessionTimerInterval = setInterval(tick, 1000);
}

function stopSessionTimer() {
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
  sessionStartTime = null;
}

function updateActiveServerView() {
  if (statServersCount) statServersCount.textContent = `${nodes.length} шт`;
  if (sheetNodesBadge) sheetNodesBadge.textContent = nodes.length;

  const active = nodes.find(n => n.id === activeNodeId);
  if (active) {
    activeServerFlag.innerHTML = getFlagHtml(active.name, 34);
    activeServerName.textContent = cleanServerName(active.name);
    activeServerProto.textContent = active.protocol || 'VLESS';

    const ping = pingMap[active.id];
    if (ping && ping.success) {
      activeServerPing.textContent = formatPingResult(ping.latency);
      activeServerPing.className = 'server-ping-tag ' + getPingClass(ping.latency);
      statPing.textContent = formatPingResult(ping.latency);
    } else {
      activeServerPing.textContent = '-- ms';
      activeServerPing.className = 'server-ping-tag';
      statPing.textContent = '-- ms';
    }
  } else {
    activeServerFlag.innerHTML = `<div class="flag-circle-globe" style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFB300" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>`;
    activeServerName.textContent = 'Сервер не выбран';
    activeServerProto.textContent = 'Нажмите, чтобы выбрать узел';
    activeServerPing.textContent = '-- ms';
    activeServerPing.className = 'server-ping-tag';
    statPing.textContent = '-- ms';
  }

  if (nodes.length > 0) {
    if (subActionsBar) subActionsBar.style.display = 'flex';
    if (subNodesCount) subNodesCount.textContent = `${nodes.length} узлов`;
  } else {
    if (subActionsBar) subActionsBar.style.display = 'none';
    if (subMetaBar) subMetaBar.style.display = 'none';
    if (mainSubBadge) mainSubBadge.style.display = 'none';
  }

  renderServersList();
}

function formatPingResult(latency) {
  if (currentSettings.pingResultType === 'status') {
    return latency < 200 ? 'OK' : 'Медленно';
  }
  return `${latency} ms`;
}

function getPingClass(latency) {
  if (latency < 150) return 'fast';
  if (latency < 300) return 'medium';
  return 'slow';
}

function renderServersList() {
  serversList.innerHTML = '';

  if (nodes.length === 0) {
    serversList.innerHTML = `
      <div class="no-sub-promo-card">
        <div class="promo-bear-wrap">
          <div class="promo-bear-halo"></div>
          <img src="../assets/bear.jpg" alt="Honey Bear" class="promo-bear-img">
        </div>
        <div class="promo-title">У вас ещё нет активной подписки</div>
        <p class="promo-desc">
          Здесь пока пусто. Приобрести игровую подписку <b>Hysteria 2</b> с обходом замедлений можно в нашем Telegram-канале:
        </p>
        <button id="btn-promo-buy-telegram" class="btn-telegram-buy">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <circle cx="12" cy="12" r="11" fill="#FFFFFF"/>
            <path d="M5.5 11.5L17.5 7L15 17.5L11.5 14L8.5 15.5L8 12.5L14.5 9L7 13.5L5.5 11.5Z" fill="#2AABEE"/>
          </svg>
          <span>Купить подписку в @honeybearvpn</span>
        </button>
        <div class="promo-footer">
          <span>Уже купили?</span>
          <button id="btn-promo-paste" class="promo-paste-link">Вставить ссылку или ключ</button>
        </div>
      </div>
    `;

    const promoBuyBtn = document.getElementById('btn-promo-buy-telegram');
    if (promoBuyBtn) {
      promoBuyBtn.addEventListener('click', () => {
        window.api.openUrl('https://t.me/honeybearvpn');
      });
    }

    const promoPasteBtn = document.getElementById('btn-promo-paste');
    if (promoPasteBtn) {
      promoPasteBtn.addEventListener('click', async () => {
        try {
          const text = await window.api.readClipboard();
          if (text && text.trim()) {
            showToast('Вставка из буфера...');
            await executeImport(text.trim(), false);
          } else {
            openImportDialog();
          }
        } catch (e) {
          openImportDialog();
        }
      });
    }
    return;
  }

  nodes.forEach((node) => {
    const isSelected = node.id === activeNodeId;
    const ping = pingMap[node.id];
    let pingTag = '<span class="server-ping-tag">-- ms</span>';
    if (ping) {
      if (ping.success) {
        pingTag = `<span class="server-ping-tag ${getPingClass(ping.latency)}">${formatPingResult(ping.latency)}</span>`;
      } else {
        pingTag = '<span class="server-ping-tag slow">Таймаут</span>';
      }
    }

    const flagHtml = getFlagHtml(node.name, 32);
    const cleanName = cleanServerName(node.name);

    const item = document.createElement('div');
    item.className = `server-item ${isSelected ? 'selected' : ''}`;
    item.innerHTML = `
      <div class="server-item-left">
        <div class="server-flag-box">${flagHtml}</div>
        <div>
          <div class="server-item-title">${escapeHtml(cleanName)}</div>
          <div class="server-item-meta">${node.protocol || 'VLESS'}</div>
        </div>
      </div>
      <div class="server-item-right">
        ${pingTag}
        <button class="delete-btn" title="Удалить этот сервер"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>
    `;

    if (item) item.addEventListener('click', async (e) => {
      if (e.target.classList.contains('delete-btn')) return;
      activeNodeId = node.id;
      await window.api.saveNodes({ nodes, activeId: activeNodeId });
      updateActiveServerView();
      serversSheet.classList.remove('open');
      showToast(`Выбран: ${cleanName}`);
      if (connectionState === 'connected') reconnect();
    });

    const delBtn = item.querySelector('.delete-btn');
    if (delBtn) delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await window.api.deleteNode(node.id);
      nodes = res.nodes;
      activeNodeId = res.activeNodeId;
      if (nodes.length === 0) {
        if (subMetaBar) subMetaBar.style.display = 'none';
        if (mainSubBadge) mainSubBadge.style.display = 'none';
        if (subActionsBar) subActionsBar.style.display = 'none';
      }
      updateActiveServerView();
      showToast('Узел удален');
    });

    serversList.appendChild(item);
  });
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Delete Subscription / Clear All Nodes ---
if (btnClearAllNodes) btnClearAllNodes.addEventListener('click', async () => {
  if (confirm('Удалить подписку и все сохранённые серверы?')) {
    await window.api.clearAllNodes();
    nodes = [];
    activeNodeId = null;
    pingMap = {};
    if (subMetaBar) subMetaBar.style.display = 'none';
    if (mainSubBadge) mainSubBadge.style.display = 'none';
    if (subActionsBar) subActionsBar.style.display = 'none';
    updateActiveServerView();
    showToast('Подписка и данные полностью удалены');
  }
});

// --- Ping Handling ---
async function pingAllServers() {
  showToast(`Проверка пинга (${currentSettings.pingType})...`);
  for (const node of nodes) {
    window.api.pingNode(node, currentSettings).then(res => {
      pingMap[node.id] = res;
      updateActiveServerView();
    }).catch(err => {
      pingMap[node.id] = { success: false, latency: -1, error: err.message };
      updateActiveServerView();
    });
  }
}

if (btnSheetPingAll) btnSheetPingAll.addEventListener('click', pingAllServers);

// --- Settings Event Handlers ---
if (pingTypeSelect) pingTypeSelect.addEventListener('change', async (e) => {
  currentSettings.pingType = e.target.value;
  await window.api.saveSettings(currentSettings);
  showToast(`Тип пинга: ${currentSettings.pingType}`);
  pingAllServers();
});

if (pingTestUrlInput) pingTestUrlInput.addEventListener('change', async (e) => {
  currentSettings.testUrl = e.target.value.trim();
  await window.api.saveSettings(currentSettings);
  showToast('Тестовый URL обновлен');
});

if (pingResultSelect) pingResultSelect.addEventListener('change', async (e) => {
  currentSettings.pingResultType = e.target.value;
  await window.api.saveSettings(currentSettings);
  updateActiveServerView();
});

if (settingAutoStart) settingAutoStart.addEventListener('change', async (e) => {
  currentSettings.autoStart = e.target.checked;
  await window.api.saveSettings(currentSettings);
  showToast(e.target.checked ? 'Автозапуск при старте Windows включен' : 'Автозапуск выключен');
});

if (settingSilentStart) settingSilentStart.addEventListener('change', async (e) => {
  currentSettings.silentStart = e.target.checked;
  await window.api.saveSettings(currentSettings);
  showToast(e.target.checked ? 'Тихий запуск в трей включен' : 'Тихий запуск отключен');
});

if (settingKillSwitch) settingKillSwitch.addEventListener('change', async (e) => {
  currentSettings.killSwitch = e.target.checked;
  await window.api.saveSettings(currentSettings);
  showToast(e.target.checked ? 'Kill Switch (блокировка утечек) активирован' : 'Kill Switch выключен');
});

// --- Telegram Channel Button ---
if (btnTelegramChannel) btnTelegramChannel.addEventListener('click', () => {
  window.api.openUrl('https://t.me/honeybearvpn');
});

// --- Admin restart link & close banner ---
if (adminRestartLink) adminRestartLink.addEventListener('click', async (e) => {
  e.preventDefault();
  if (window.api && window.api.relaunchAdmin) {
    showToast('Перезапуск от имени администратора...', 3000);
    const res = await window.api.relaunchAdmin();
    if (!res || !res.success) {
      showToast('Закройте приложение → ПКМ по HoneyBearVPN.exe → «Запуск от имени администратора»', 6000);
    }
  } else {
    showToast('Закройте приложение → ПКМ по HoneyBearVPN.exe → «Запуск от имени администратора»', 6000);
  }
});

if (btnCloseAdminBanner) {
  btnCloseAdminBanner.addEventListener('click', () => {
    sessionStorage.setItem('dismissedAdminWarning', 'true');
    if (adminWarningBanner) {
      adminWarningBanner.classList.add('banner-closing');
      setTimeout(() => {
        adminWarningBanner.style.display = 'none';
        adminWarningBanner.classList.remove('banner-closing');
      }, 250);
    }
  });
}

// --- Subscription Meta Display ---
function updateSubMeta(meta) {
  if (!meta) return;

  if (meta.expireDate) {
    if (subMetaBar) subMetaBar.style.display = '';
    if (subExpireDate) subExpireDate.textContent = meta.expireDate;

    const days = meta.daysLeft || 0;
    if (subDaysLeft) {
      subDaysLeft.textContent = days > 0 ? `${days} дн.` : 'Истекла!';
      subDaysLeft.className = 'sub-days-badge';
      if (days <= 0) subDaysLeft.classList.add('danger');
      else if (days <= 7) subDaysLeft.classList.add('warning');
    }

    // Also show prominent badge on main screen under server card!
    if (mainSubBadge) {
      mainSubBadge.style.display = 'inline-flex';
      if (mainSubDate) mainSubDate.textContent = meta.expireDate;
      if (mainSubDays) mainSubDays.textContent = days > 0 ? `${days} дн.` : 'Истекла!';
    }
  }

  if (meta.total && meta.download !== undefined) {
    const usedBytes = (meta.upload || 0) + meta.download;
    const toGB = (b) => (b / 1073741824).toFixed(2) + ' GB';
    if (subTrafficRow) subTrafficRow.style.display = '';
    if (subTrafficUsed) subTrafficUsed.textContent = toGB(usedBytes);
    if (subTrafficTotal) subTrafficTotal.textContent = toGB(meta.total);
  }
}

// Click on main sub badge opens servers sheet
if (mainSubBadge) mainSubBadge.addEventListener('click', () => {
  if (serversSheet) serversSheet.classList.add('open');
});

// --- Subscription Refresh ---
if (btnUpdateSub) btnUpdateSub.addEventListener('click', async () => {
  showToast('Обновление подписки...', 2000);
  const res = await window.api.refreshSubscription();
  if (res.success) {
    nodes = res.nodes;
    activeNodeId = res.activeNodeId;
    updateActiveServerView();
    if (res.meta) updateSubMeta(res.meta);
    showToast(`Обновлено: ${res.count} узлов`);
    pingAllServers();
  } else {
    showToast('Ошибка обновления: ' + res.error, 4000);
  }
});

// --- Import & Clipboard Handling ---
function openImportDialog() {
  dialogInput.value = '';
  dialogErrorMsg.textContent = '';
  importDialog.classList.add('open');
  dialogInput.focus();
}

function closeImportDialog() {
  importDialog.classList.remove('open');
}

if (btnOpenImportModal) btnOpenImportModal.addEventListener('click', () => {
  serversSheet.classList.remove('open');
  openImportDialog();
});

if (btnCloseDialog) btnCloseDialog.addEventListener('click', closeImportDialog);
if (btnDialogCancel) btnDialogCancel.addEventListener('click', closeImportDialog);

if (btnDialogPaste) btnDialogPaste.addEventListener('click', async () => {
  try {
    const text = await window.api.readClipboard();
    if (text && text.trim()) {
      dialogInput.value = text.trim();
      dialogErrorMsg.textContent = '';
      showToast('Вставлено из буфера');
    } else {
      dialogErrorMsg.textContent = 'Буфер обмена пуст. Скопируйте ссылку!';
    }
  } catch (err) {
    dialogErrorMsg.textContent = 'Ошибка чтения: ' + err.message;
  }
});

if (btnDialogSubmit) btnDialogSubmit.addEventListener('click', async () => {
  const text = dialogInput.value.trim();
  if (!text) {
    dialogErrorMsg.textContent = 'Вставьте ссылку или ключ';
    return;
  }
  dialogErrorMsg.textContent = 'Загрузка...';
  await executeImport(text, true);
});

// Quick 1-click paste from header
if (btnQuickPaste) btnQuickPaste.addEventListener('click', async () => {
  try {
    let text = await window.api.readClipboard();
    if (!text || typeof text !== 'string' || text.trim() === '') {
      showToast('Буфер обмена пуст. Скопируйте ссылку или ключ!');
      openImportDialog();
      return;
    }
    text = text.trim();
    showToast('Вставка из буфера...', 1500);
    await executeImport(text, false);
  } catch (err) {
    showToast('Ошибка буфера: ' + err.message);
    openImportDialog();
  }
});

async function executeImport(rawText, fromDialog = false) {
  try {
    showToast('Распознавание ссылки...', 2000);
    const res = await window.api.importLink(rawText);
    if (res.success) {
      nodes = res.nodes;
      activeNodeId = res.activeNodeId;
      updateActiveServerView();
      if (res.meta) updateSubMeta(res.meta);
      showToast(`Добавлено узлов: ${res.count}`);
      if (fromDialog) closeImportDialog();
      pingAllServers();
    } else {
      let msg = res.error || 'Не удалось распознать формат';
      if (!msg.toLowerCase().includes('лимит устройств') && (msg.toLowerCase().includes('не найдено') || msg.toLowerCase().includes('app not supported') || msg.toLowerCase().includes('узлов') || msg.toLowerCase().includes('серверов'))) {
        msg += '. Возможно, у вас превышен лимит устройств в панели управления.';
      }
      if (fromDialog) {
        dialogErrorMsg.textContent = msg;
      } else {
        showToast(`Ошибка: ${msg}`, 5000);
        dialogInput.value = rawText;
        dialogErrorMsg.textContent = msg;
        openImportDialog();
      }
    }
  } catch (err) {
    let msg = err.message || 'Ошибка импорта';
    if (!msg.toLowerCase().includes('лимит устройств') && (msg.toLowerCase().includes('не найдено') || msg.toLowerCase().includes('app not supported') || msg.toLowerCase().includes('узлов') || msg.toLowerCase().includes('серверов'))) {
      msg += '. Возможно, у вас превышен лимит устройств в панели управления.';
    }
    if (fromDialog) {
      dialogErrorMsg.textContent = msg;
    } else {
      showToast('Ошибка: ' + msg, 5000);
      dialogInput.value = rawText;
      dialogErrorMsg.textContent = msg;
      openImportDialog();
    }
  }
}

// --- Connection Control ---
async function toggleConnection() {
  if (connectionState === 'connected' || connectionState === 'connecting') {
    updateConnectionUI('connecting');
    const res = await window.api.disconnect();
    if (res.success) {
      updateConnectionUI('disconnected');
      showToast('Отключено');
    } else {
      // Always go to disconnected on error — don't pretend we're connected
      updateConnectionUI('disconnected');
      showToast('Ошибка при отключении: ' + res.error);
    }
  } else {
    if (!activeNodeId) {
      showToast('Сначала добавьте и выберите сервер!');
      openImportDialog();
      return;
    }

    updateConnectionUI('connecting');
    const res = await window.api.connect(activeNodeId);
    if (res.success) {
      updateConnectionUI('connected', Date.now());
      showToast('Подключено! Защита активна');
    } else {
      updateConnectionUI('disconnected');
      showToast(`Ошибка подключения: ${res.error}`, 4500);
    }
  }
}

async function reconnect() {
  await window.api.disconnect();
  updateConnectionUI('connecting');
  const res = await window.api.connect(activeNodeId);
  if (res.success) {
    updateConnectionUI('connected', Date.now());
    showToast('Переподключено к новому узлу');
  } else {
    updateConnectionUI('disconnected');
    showToast('Ошибка подключения: ' + res.error);
  }
}

if (btnConnect) btnConnect.addEventListener('click', toggleConnection);

// --- Sheets ---
function closeAllSheets() {
  if (serversSheet) serversSheet.classList.remove('open');
  if (settingsSheet) settingsSheet.classList.remove('open');
  if (routingSheet) routingSheet.classList.remove('open');
  if (btnSettingsToggle) btnSettingsToggle.classList.remove('active-tab');
  if (btnRoutingToggle) btnRoutingToggle.classList.remove('active-tab');
}

if (serverCardTrigger) serverCardTrigger.addEventListener('click', () => {
  closeAllSheets();
  serversSheet.classList.add('open');
});
if (statServersTrigger) statServersTrigger.addEventListener('click', () => {
  closeAllSheets();
  serversSheet.classList.add('open');
});
if (btnCloseServersSheet) btnCloseServersSheet.addEventListener('click', closeAllSheets);

if (btnSettingsToggle) btnSettingsToggle.addEventListener('click', () => {
  const wasOpen = settingsSheet.classList.contains('open');
  closeAllSheets();
  if (!wasOpen) {
    settingsSheet.classList.add('open');
    btnSettingsToggle.classList.add('active-tab');
  }
});
if (btnCloseSettingsSheet) btnCloseSettingsSheet.addEventListener('click', closeAllSheets);

if (btnEmergencyReset) btnEmergencyReset.addEventListener('click', async () => {
  showToast('Сброс системного прокси, ядра sing-box и очистка DNS...', 2500);
  const res = await window.api.resetProxy();
  updateConnectionUI('disconnected');
  targetSpeed = 0;
  if (res && res.success) {
    showToast('✅ Сетевой стек, DNS и адаптеры успешно освобождены!');
  } else {
    showToast('Сброс выполнен: ' + (res.error || 'OK'));
  }
});

if (btnClearLogs) btnClearLogs.addEventListener('click', () => {
  logsView.innerHTML = '';
});

if (btnFullQuit) btnFullQuit.addEventListener('click', async () => {
  showToast('Завершение работы и очистка сетевых адаптеров...', 3000);
  await window.api.quit();
});

// --- Routing & Split Tunneling Handlers ---
if (btnRoutingToggle) btnRoutingToggle.addEventListener('click', () => {
  const wasOpen = routingSheet.classList.contains('open');
  closeAllSheets();
  if (!wasOpen) {
    routingSheet.classList.add('open');
    btnRoutingToggle.classList.add('active-tab');
  }
});
if (btnCloseRoutingSheet) btnCloseRoutingSheet.addEventListener('click', closeAllSheets);

async function loadRoutingState() {
  try {
    const routing = await window.api.getRouting();
    if (routing) {
      currentRouting = {
        ...currentRouting,
        ...routing,
        adblock: routing.adblock !== undefined ? routing.adblock : true,
        apps: { ...currentRouting.apps, ...(routing.apps || {}) },
        custom: routing.custom || []
      };
    }

    // Update radios
    const radio = document.querySelector(`input[name="routingMode"][value="${currentRouting.mode}"]`);
    if (radio) radio.checked = true;

    // Update toggles
    if (toggleDiscord) toggleDiscord.checked = !!currentRouting.apps.discord;
    if (toggleTelegram) toggleTelegram.checked = !!currentRouting.apps.telegram;
    if (toggleYoutube) toggleYoutube.checked = !!currentRouting.apps.youtube;
    if (toggleBrowsers) toggleBrowsers.checked = !!currentRouting.apps.browsers;
    if (toggleAdblock) toggleAdblock.checked = currentRouting.adblock !== false;

    renderCustomChips();
    updateRoutingModeDisplay();
  } catch (err) {
    console.error('Error loading routing:', err);
  }
}

let routingDebounceTimer = null;

function saveCurrentRouting() {
  updateRoutingModeDisplay();
  if (routingDebounceTimer) clearTimeout(routingDebounceTimer);

  routingDebounceTimer = setTimeout(async () => {
    try {
      if (connectionState === 'connected') {
        showToast('Обновление правил на лету...', 1500);
      }
      await window.api.saveRouting(currentRouting);
      if (connectionState === 'connected') {
        showToast('Маршруты обновлены!', 2000);
      }
    } catch (err) {
      console.error('Error saving routing:', err);
    }
  }, 400);
}

function updateRoutingModeDisplay() {
  if (!statRoutingMode) return;
  const modeNames = {
    whitelist: 'Только выбранное',
    blacklist: 'Все, кроме выбранного',
    all: 'Весь трафик'
  };
  statRoutingMode.textContent = modeNames[currentRouting.mode] || currentRouting.mode;
}

const SERVICE_CATALOG = [
  {
    id: 'gemini',
    name: 'Google Gemini / Flow',
    sub: 'gemini.google.com, flow.google.com, labs.google',
    value: 'Gemini',
    keywords: ['gemini', 'гемини', 'джемини', 'bard', 'бард', 'google ai', 'ии', 'flow', 'флоу', 'гугл флоу', 'google flow', 'labs.google'],
    iconBg: '#1A73E8',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"/></svg>`
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT / OpenAI',
    sub: 'chatgpt.com, openai.com',
    value: 'ChatGPT',
    keywords: ['чатгпт', 'chatgpt', 'openai', 'gpt', 'чат гпт', 'ai', 'ии', 'нейросеть'],
    iconBg: '#10A37F',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10a9.96 9.96 0 0 1-4.7-1.17L2 22l1.17-5.3A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2z"/><path d="M8 12h8M12 8v8"/></svg>`
  },
  {
    id: 'twitch',
    name: 'Twitch',
    sub: 'Стримы, чат, видео (twitch.tv, ttvnw)',
    value: 'Twitch',
    keywords: ['твич', 'твитч', 'твитч тв', 'твич тв', 'twitch', 'twitch tv', 'ttv', 'стримы'],
    iconBg: '#9146FF',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`
  },
  {
    id: 'youtube',
    name: 'YouTube',
    sub: 'Видео, клипы (youtube.com, ytimg)',
    value: 'YouTube',
    keywords: ['ютуб', 'ютубчик', 'youtube', 'yt', 'видео'],
    iconBg: '#FF0000',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`
  },
  {
    id: 'spotify',
    name: 'Spotify',
    sub: 'Музыка и подкасты (spotify.com)',
    value: 'Spotify',
    keywords: ['спотифай', 'споти', 'spotify', 'музыка'],
    iconBg: '#1DB954',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.495 17.305a.75.75 0 0 1-1.03.247c-2.825-1.727-6.38-2.118-10.569-1.16a.75.75 0 1 1-.334-1.462c4.584-1.048 8.52-.607 11.686 1.345a.75.75 0 0 1 .247 1.03zm1.467-3.264a.938.938 0 0 1-1.29.309c-3.235-1.99-8.166-2.564-11.992-1.402a.937.937 0 0 1-.55-1.791c4.372-1.327 9.805-.688 13.523 1.594a.938.938 0 0 1 .309 1.29zm.126-3.41c-3.878-2.303-10.28-2.515-13.987-1.389a1.125 1.125 0 1 1-.656-2.154c4.256-1.292 11.328-1.047 15.795 1.605a1.125 1.125 0 0 1-1.152 1.938z"/></svg>`
  },
  {
    id: 'steam',
    name: 'Steam',
    sub: 'Игры, магазин (steampowered.com)',
    value: 'Steam',
    keywords: ['стим', 'steam', 'игры', 'steam.exe'],
    iconBg: '#171A21',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#66C0F4"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.528 3.528 0 0 1 2.012-.624c.068 0 .135.004.202.011l2.977-4.316a4.858 4.858 0 0 1 4.85-4.85 4.858 4.858 0 0 1 4.85 4.85 4.858 4.858 0 0 1-4.85 4.85c-.066 0-.131-.004-.196-.01l-4.269 3.013c.007.086.012.172.012.26a3.535 3.535 0 0 1-3.533 3.534 3.538 3.538 0 0 1-3.524-3.238L.484 15.02C2.08 20.25 6.945 24 12.684 24 18.985 24 24 18.627 24 12.326 24 5.517 18.483 0 11.979 0z"/></svg>`
  },
  {
    id: 'roblox',
    name: 'Roblox',
    sub: 'Игры, сервера (roblox.com)',
    value: 'Roblox',
    keywords: ['роблокс', 'roblox', 'roblox.exe'],
    iconBg: '#E2231A',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><path d="M5.165 0L0 18.835 18.835 24 24 5.165 5.165 0zm9.497 13.916l-4.717-1.285 1.285-4.717 4.717 1.285-1.285 4.717z"/></svg>`
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    sub: 'x.com, twitter.com, twimg',
    value: 'Twitter / X',
    keywords: ['твиттер', 'твитер', 'twitter', 'x', 'x.com', 'твит'],
    iconBg: '#000000',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`
  },
  {
    id: 'instagram',
    name: 'Instagram',
    sub: 'Лента, сторис, reels (instagram.com)',
    value: 'Instagram',
    keywords: ['инстаграм', 'инста', 'инстаграмм', 'instagram', 'инст'],
    iconBg: '#E1306C',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    sub: 'Видео и тренды (tiktok.com)',
    value: 'TikTok',
    keywords: ['тикток', 'тик ток', 'tiktok', 'tt'],
    iconBg: '#010101',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#00F2FE"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.43 5.92 5.92 0 0 0 1.87-4.29V8.58a8.28 8.28 0 0 0 4.86 1.57v-3.46z"/></svg>`
  },
  {
    id: 'rutracker',
    name: 'RuTracker',
    sub: 'Торрент-трекер (rutracker.org)',
    value: 'RuTracker',
    keywords: ['рутрекер', 'рутрек', 'rutracker', 'торрент', 'трекер'],
    iconBg: '#2B5278',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"><path d="M12 2v14M12 16l-4-4M12 16l4-4M4 18h16M4 21h16"/></svg>`
  },
  {
    id: 'reddit',
    name: 'Reddit',
    sub: 'Форумы, треды (reddit.com)',
    value: 'Reddit',
    keywords: ['реддит', 'редит', 'reddit'],
    iconBg: '#FF4500',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><circle cx="12" cy="12" r="10"/><circle cx="9" cy="11" r="1.5" fill="#FF4500"/><circle cx="15" cy="11" r="1.5" fill="#FF4500"/><path d="M8.5 15.5c1.5 1.2 5.5 1.2 7 0" stroke="#FF4500" stroke-width="1.5" stroke-linecap="round"/></svg>`
  },
  {
    id: 'notion',
    name: 'Notion',
    sub: 'Заметки и документы (notion.so)',
    value: 'Notion',
    keywords: ['ноушен', 'нотион', 'notion', 'документы'],
    iconBg: '#000000',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.047-.327L17.851 1.78c-.42-.327-1.073-.653-2.146-.56L2.965 2.388c-.373.047-.466.327-.327.56zm1.446 4.76v12.414c0 .84.42 1.166 1.353 1.12l14.195-.84c.933-.047 1.027-.607 1.027-1.213V7.94c0-.7-.373-1.073-1.12-1.027l-14.335.84c-.793.047-1.12.467-1.12 1.214z"/></svg>`
  },
  {
    id: 'github',
    name: 'GitHub',
    sub: 'Репозитории и код (github.com)',
    value: 'GitHub',
    keywords: ['гитхаб', 'гит', 'github', 'git', 'код'],
    iconBg: '#24292E',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    sub: 'Идеи и фото (pinterest.com)',
    value: 'Pinterest',
    keywords: ['пинтерест', 'пин', 'pinterest'],
    iconBg: '#E60023',
    iconSvg: `<svg viewBox="0 0 24 24" width="15" height="15" fill="#FFFFFF"><path d="M12 0a12 12 0 0 0-4.37 23.18c-.07-.98-.13-2.48.03-3.55l1.09-4.63s-.28-.56-.28-1.39c0-1.3.75-2.28 1.7-2.28.8 0 1.19.6 1.19 1.33 0 .81-.51 2.01-.78 3.13-.22.95.48 1.72 1.41 1.72 1.7 0 3-1.79 3-4.37 0-2.29-1.64-3.89-3.99-3.89-2.72 0-4.32 2.04-4.32 4.15 0 .82.32 1.7.71 2.18.08.1.09.18.07.28l-.26 1.09c-.04.18-.15.22-.34.13-1.27-.59-2.07-2.44-2.07-3.93 0-3.2 2.33-6.14 6.71-6.14 3.52 0 6.26 2.51 6.26 5.87 0 3.5-2.2 6.32-5.27 6.32-1.03 0-2-.53-2.33-1.16l-.63 2.42c-.23.89-.86 2-1.28 2.68A12 12 0 1 0 12 0z"/></svg>`
  }
];

function getServiceIconForChip(item) {
  const clean = (item || '').trim().toLowerCase();
  const found = SERVICE_CATALOG.find(s => 
    s.id === clean || 
    s.value.toLowerCase() === clean ||
    s.name.toLowerCase().includes(clean) || 
    s.keywords.some(k => k === clean || clean === k.toLowerCase()) ||
    clean.includes(s.id)
  );

  if (found) {
    return `<div class="custom-chip-icon" style="background:${found.iconBg};border-radius:4px;padding:2px;display:flex;align-items:center;justify-content:center;">${found.iconSvg}</div>`;
  }

  if (clean.endsWith('.exe')) {
    return `<div class="custom-chip-icon"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg></div>`;
  }

  // Default web / domain icon
  return `<div class="custom-chip-icon"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>`;
}

function renderCustomChips() {
  customChipsList.innerHTML = '';
  if (!currentRouting.custom || currentRouting.custom.length === 0) {
    customChipsList.innerHTML = `
      <div class="empty-bear-state">
        <img src="../assets/bear.jpg" class="empty-state-bear-img" alt="Honey Bear">
        <p style="font-size:12px; font-weight:700; color:#fff; margin-top:4px;">HoneyBear готов к туннелированию</p>
        <small style="font-size:10.5px;">Выберите сервис из каталога выше или введите свой домен / .exe</small>
      </div>
    `;
    return;
  }

  currentRouting.custom.forEach((item, index) => {
    const chip = document.createElement('div');
    chip.className = 'custom-chip';
    const iconHtml = getServiceIconForChip(item);
    chip.innerHTML = `
      ${iconHtml}
      <span class="custom-chip-text">${escapeHtml(item)}</span>
      <button class="custom-chip-del" title="Удалить"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    `;

    chip.querySelector('.custom-chip-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      currentRouting.custom.splice(index, 1);
      renderCustomChips();
      await saveCurrentRouting();
      showToast(`Удалено: ${item}`);
    });

    customChipsList.appendChild(chip);
  });
}

routingModeRadios.forEach((radio) => {
  if (radio) radio.addEventListener('change', async (e) => {
    currentRouting.mode = e.target.value;
    await saveCurrentRouting();
    const modeName = currentRouting.mode === 'whitelist' ? 'Только выбранное' : (currentRouting.mode === 'blacklist' ? 'Все, кроме выбранного' : 'Весь трафик');
    showToast(`Режим: ${modeName}`);
  });
});

if (toggleDiscord) toggleDiscord.addEventListener('change', async (e) => {
  currentRouting.apps.discord = e.target.checked;
  await saveCurrentRouting();
  showToast(`Discord: ${e.target.checked ? 'В туннеле' : 'Прямое'}`);
});

if (toggleTelegram) toggleTelegram.addEventListener('change', async (e) => {
  currentRouting.apps.telegram = e.target.checked;
  await saveCurrentRouting();
  showToast(`Telegram: ${e.target.checked ? 'В туннеле' : 'Прямое'}`);
});

if (toggleYoutube) toggleYoutube.addEventListener('change', async (e) => {
  currentRouting.apps.youtube = e.target.checked;
  await saveCurrentRouting();
  showToast(`YouTube: ${e.target.checked ? 'В туннеле' : 'Прямое'}`);
});

if (toggleBrowsers) toggleBrowsers.addEventListener('change', async (e) => {
  currentRouting.apps.browsers = e.target.checked;
  await saveCurrentRouting();
  showToast(`Браузеры: ${e.target.checked ? 'В туннеле' : 'Прямое'}`);
});

if (toggleAdblock) toggleAdblock.addEventListener('change', async (e) => {
  currentRouting.adblock = e.target.checked;
  await saveCurrentRouting();
  showToast(e.target.checked ? 'Блокировка рекламы (AdBlock) включена' : 'Блокировка рекламы отключена');
});

function addCustomRoute(overrideVal) {
  const rawVal = overrideVal !== undefined ? overrideVal : (customRoutingInput.value || '');
  const val = (rawVal || '').trim();
  if (!val) return;

  // Check if val matches a known service in catalog to use its clean display name
  const lower = val.toLowerCase();
  const match = SERVICE_CATALOG.find(s => 
    s.id === lower || 
    s.name.toLowerCase() === lower || 
    s.value.toLowerCase() === lower ||
    s.keywords.some(k => k === lower)
  );

  const finalVal = match ? match.value : val;

  if (!currentRouting.custom.includes(finalVal)) {
    currentRouting.custom.push(finalVal);
    renderCustomChips();
    saveCurrentRouting();
    showToast(`Добавлено: ${finalVal}`);
  } else {
    showToast(`Уже добавлено: ${finalVal}`);
  }

  customRoutingInput.value = '';
  hideSuggestionsDropdown();
}

let activeDropdownIndex = -1;

function showSuggestionsDropdown() {
  if (!routingSuggestionsDropdown) return;
  const query = (customRoutingInput.value || '').trim().toLowerCase();

  let matches = [];
  if (!query) {
    // Show popular default services
    matches = SERVICE_CATALOG.slice(0, 8);
  } else {
    matches = SERVICE_CATALOG.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.sub.toLowerCase().includes(query) ||
      s.id.includes(query) ||
      s.keywords.some(k => k.includes(query))
    );
  }

  if (matches.length === 0) {
    routingSuggestionsDropdown.classList.add('hidden');
    return;
  }

  activeDropdownIndex = -1;
  routingSuggestionsDropdown.innerHTML = `
    <div class="routing-dropdown-header">${query ? 'Результаты поиска' : 'Популярные сервисы (быстрый выбор)'}</div>
  `;

  matches.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'routing-dropdown-item';
    row.dataset.index = idx;
    row.innerHTML = `
      <div class="routing-item-icon" style="background:${item.iconBg};">
        ${item.iconSvg}
      </div>
      <div class="routing-item-info">
        <div class="routing-item-title">${escapeHtml(item.name)}</div>
        <div class="routing-item-sub">${escapeHtml(item.sub)}</div>
      </div>
      <div class="routing-item-badge">+ Выбрать</div>
    `;

    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      addCustomRoute(item.value);
    });

    routingSuggestionsDropdown.appendChild(row);
  });

  routingSuggestionsDropdown.classList.remove('hidden');
}

function hideSuggestionsDropdown() {
  if (routingSuggestionsDropdown) {
    routingSuggestionsDropdown.classList.add('hidden');
    activeDropdownIndex = -1;
  }
}

if (customRoutingInput) {
  customRoutingInput.addEventListener('focus', showSuggestionsDropdown);
  customRoutingInput.addEventListener('input', showSuggestionsDropdown);
  
  customRoutingInput.addEventListener('keydown', (e) => {
    if (!routingSuggestionsDropdown || routingSuggestionsDropdown.classList.contains('hidden')) {
      if (e.key === 'Enter') addCustomRoute();
      return;
    }

    const items = routingSuggestionsDropdown.querySelectorAll('.routing-dropdown-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeDropdownIndex = (activeDropdownIndex + 1) % items.length;
      updateActiveDropdownItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeDropdownIndex = (activeDropdownIndex - 1 + items.length) % items.length;
      updateActiveDropdownItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeDropdownIndex >= 0 && items[activeDropdownIndex]) {
        items[activeDropdownIndex].dispatchEvent(new MouseEvent('mousedown'));
      } else {
        addCustomRoute();
      }
    } else if (e.key === 'Escape') {
      hideSuggestionsDropdown();
    }
  });

  customRoutingInput.addEventListener('blur', () => {
    // Small timeout to allow mousedown to fire on items
    setTimeout(hideSuggestionsDropdown, 200);
  });
}

function updateActiveDropdownItem(items) {
  items.forEach((item, idx) => {
    if (idx === activeDropdownIndex) {
      item.classList.add('active');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
}

if (btnAddCustomRoute) btnAddCustomRoute.addEventListener('click', () => addCustomRoute());

// Logs & IPC
window.api.onLog((log) => {
  const row = document.createElement('div');
  row.className = 'log-row ' + (log.includes('ERR') || log.includes('error') ? 'err' : 'info');
  row.textContent = log.trim();
  logsView.appendChild(row);
  logsView.scrollTop = logsView.scrollHeight;
});

window.api.onStatusChange((status) => {
  updateConnectionUI(status.state, status.startTime);
});

if (window.api.onKillSwitchAlert) {
  window.api.onKillSwitchAlert(() => {
    updateConnectionUI('disconnected');
    showToast('⚠️ Внимание! Kill Switch заблокировал незашифрованный трафик после сбоя VPN.', 6000);
  });
}

// ==========================================
// Remnawave HWID & Comss.one DNS Handlers
// ==========================================

async function doResetHwid(btnElement) {
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.dataset.origHtml = btnElement.innerHTML;
    btnElement.innerHTML = '⏳ Сброс...';
  }
  showToast('Сбрасываем привязку HWID...', 2000);
  try {
    const res = await window.api.botResetHwid();
    if (res && res.success) {
      showToast('⚡ ' + (res.message || 'HWID успешно сброшен!'), 4500);
    } else {
      showToast('Ошибка: ' + (res?.error || res?.message || 'Не удалось сбросить HWID'), 4000);
    }
  } catch (err) {
    showToast('Ошибка сети: ' + err.message, 4000);
  } finally {
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.innerHTML = btnElement.dataset.origHtml || 'Сбросить HWID';
    }
  }
}

function updateDnsBadge(enabled) {
  if (!dnsStatusBadge) return;
  if (enabled) {
    dnsStatusBadge.textContent = 'Активен';
    dnsStatusBadge.classList.add('active');
    dnsStatusBadge.classList.remove('inactive');
  } else {
    dnsStatusBadge.textContent = 'Выключен';
    dnsStatusBadge.classList.remove('active');
    dnsStatusBadge.classList.add('inactive');
  }
}

async function handleComssDnsChange(enabled) {
  currentSettings.comssDns = enabled;
  if (settingComssDns) settingComssDns.checked = enabled;
  if (toggleAppComssDns) toggleAppComssDns.checked = enabled;
  updateDnsBadge(enabled);
  showToast(enabled ? '⚡ Применение Умного DNS (DNS-AI & Comss)...' : '⏳ Отключение Smart DNS...', 1500);
  try {
    await window.api.saveSettings(currentSettings);
    showToast(enabled ? '✅ Умный DNS (dns-ai.ru + comss.one) активен!' : 'Умный DNS отключен', 3000);
  } catch (err) {
    showToast('Ошибка DNS: ' + err.message, 4000);
  }
}

if (settingComssDns) {
  settingComssDns.addEventListener('change', (e) => handleComssDnsChange(e.target.checked));
}
if (toggleAppComssDns) {
  toggleAppComssDns.addEventListener('change', (e) => handleComssDnsChange(e.target.checked));
}
if (btnResetHwidSub) {
  btnResetHwidSub.addEventListener('click', () => doResetHwid(btnResetHwidSub));
}

// =========================================================
// AUTO-UPDATER & CHANGELOG UI LOGIC
// =========================================================
const updateIndicator = document.getElementById('update-indicator');
const updateBadgeText = document.getElementById('update-badge-text');
const updateModal = document.getElementById('update-modal');
const btnCloseUpdateModal = document.getElementById('btn-close-update-modal');
const updateModalTitle = document.getElementById('update-modal-title');
const modalCurrentVersion = document.getElementById('modal-current-version');
const modalNewVersion = document.getElementById('modal-new-version');
const modalReleaseDate = document.getElementById('modal-release-date');
const modalChangelogText = document.getElementById('modal-changelog-text');
const modalProgressWrap = document.getElementById('modal-progress-wrap');
const modalProgressPercent = document.getElementById('modal-progress-percent');
const modalProgressBarFill = document.getElementById('modal-progress-bar-fill');
const btnUpdateLater = document.getElementById('btn-update-later');
const btnUpdateNow = document.getElementById('btn-update-now');
const btnUpdateNowText = document.getElementById('btn-update-now-text');

let currentUpdateInfo = null;
let updateState = 'idle'; // 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date'
let isViewingChangelogOnly = false;

function setUpdateIndicatorState(state, text, tooltip) {
  if (!updateIndicator) return;
  updateState = state;
  updateIndicator.className = `update-indicator ${state}`;
  if (updateBadgeText && text) {
    updateBadgeText.textContent = text;
  }
  if (tooltip) {
    updateIndicator.title = tooltip;
  }
}

function formatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h3>$1</h3>')
    .replace(/^# (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/gim, '<br>');
}

function openUpdateModal(info, changelogOnly = false) {
  if (!updateModal) return;
  isViewingChangelogOnly = changelogOnly;
  currentUpdateInfo = info;

  if (updateModalTitle) {
    updateModalTitle.textContent = changelogOnly ? 'Что нового в HoneyBear VPN' : 'Обновление HoneyBear VPN';
  }

  if (modalCurrentVersion) {
    modalCurrentVersion.textContent = `v${info.currentVersion || '1.2.0'}`;
  }
  if (modalNewVersion) {
    modalNewVersion.textContent = `v${info.version || '1.2.0'}`;
  }
  if (modalReleaseDate) {
    modalReleaseDate.textContent = info.publishedAt ? new Date(info.publishedAt).toLocaleDateString('ru-RU') : '';
  }

  if (modalChangelogText) {
    modalChangelogText.innerHTML = formatMarkdown(info.changelog || 'Регулярные улучшения стабильности и обхода блокировок.');
  }

  if (modalProgressWrap) {
    modalProgressWrap.style.display = 'none';
  }

  if (btnUpdateLater) {
    btnUpdateLater.style.display = changelogOnly ? 'none' : 'block';
  }

  if (btnUpdateNowText) {
    btnUpdateNowText.textContent = changelogOnly ? 'Отлично!' : 'Обновить и перезапустить';
  }

  updateModal.style.display = 'flex';
}

function closeUpdateModal() {
  if (updateModal) {
    updateModal.style.display = 'none';
  }
}

async function triggerUpdateCheck(manual = false) {
  setUpdateIndicatorState('checking', 'Проверка...', 'Проверяем обновления на GitHub...');
  try {
    const res = await window.api.checkForUpdates();
    if (res && res.hasUpdate && res.updateInfo) {
      setUpdateIndicatorState('available', `v${res.updateInfo.version} ✨`, `Доступно обновление v${res.updateInfo.version}! Нажмите для установки.`);
      currentUpdateInfo = res.updateInfo;
      if (manual) {
        openUpdateModal(res.updateInfo, false);
      } else {
        showToast(`⚡ Доступно обновление v${res.updateInfo.version}!`, 3500);
      }
    } else if (res && res.error) {
      setUpdateIndicatorState('idle', 'v1.2.0', 'Версия 1.2.0 (Нажмите для проверки обновлений)');
      if (manual) {
        showToast('Не удалось связаться с сервером обновлений: ' + res.error, 3500);
      }
    } else {
      setUpdateIndicatorState('up-to-date', 'v1.2.0', 'Установлена последняя версия');
      if (manual) {
        showToast('У вас установлена последняя версия HoneyBear VPN (v1.2.0)!', 2500);
      }
      setTimeout(() => {
        setUpdateIndicatorState('idle', 'v1.2.0', 'HoneyBear VPN v1.2.0 (Нажмите для проверки обновлений)');
      }, 4000);
    }
  } catch (err) {
    setUpdateIndicatorState('idle', 'v1.2.0', 'HoneyBear VPN v1.2.0');
  }
}

async function triggerUpdateDownload() {
  if (isViewingChangelogOnly) {
    closeUpdateModal();
    return;
  }

  if (!currentUpdateInfo || !currentUpdateInfo.downloadUrl) {
    showToast('Ссылка на обновление отсутствует', 3000);
    return;
  }

  try {
    if (btnUpdateNow) btnUpdateNow.disabled = true;
    if (btnUpdateNowText) btnUpdateNowText.textContent = 'Загрузка...';
    if (modalProgressWrap) modalProgressWrap.style.display = 'block';

    setUpdateIndicatorState('downloading', 'Загрузка...', 'Загрузка обновления HoneyBear VPN...');
    await window.api.startUpdate(currentUpdateInfo.downloadUrl);
  } catch (err) {
    showToast('Ошибка обновления: ' + err.message, 4000);
    if (btnUpdateNow) btnUpdateNow.disabled = false;
    if (btnUpdateNowText) btnUpdateNowText.textContent = 'Обновить и перезапустить';
  }
}

if (updateIndicator) {
  updateIndicator.addEventListener('click', () => {
    if (updateState === 'available' && currentUpdateInfo) {
      openUpdateModal(currentUpdateInfo, false);
    } else {
      triggerUpdateCheck(true);
    }
  });
}

if (btnCloseUpdateModal) {
  btnCloseUpdateModal.addEventListener('click', closeUpdateModal);
}
if (btnUpdateLater) {
  btnUpdateLater.addEventListener('click', closeUpdateModal);
}
if (btnUpdateNow) {
  btnUpdateNow.addEventListener('click', triggerUpdateDownload);
}

// IPC Events from updater-manager
if (window.api && window.api.onUpdateEvent) {
  window.api.onUpdateEvent((data) => {
    if (data.type === 'checking') {
      setUpdateIndicatorState('checking', 'Проверка...', 'Проверяем обновления на GitHub...');
    } else if (data.type === 'available' && data.updateInfo) {
      currentUpdateInfo = data.updateInfo;
      setUpdateIndicatorState('available', `v${data.updateInfo.version} ✨`, `Доступно обновление v${data.updateInfo.version}! Нажмите для установки.`);
    } else if (data.type === 'up-to-date') {
      setUpdateIndicatorState('up-to-date', 'v1.2.0', 'Установлена последняя версия');
      setTimeout(() => {
        setUpdateIndicatorState('idle', 'v1.2.0', 'HoneyBear VPN v1.2.0');
      }, 4000);
    } else if (data.type === 'downloading') {
      const pct = data.percent || 0;
      setUpdateIndicatorState('downloading', `${pct}%`, `Загрузка обновления: ${pct}%`);
      if (modalProgressPercent) modalProgressPercent.textContent = `${pct}%`;
      if (modalProgressBarFill) modalProgressBarFill.style.width = `${pct}%`;
    } else if (data.type === 'ready') {
      setUpdateIndicatorState('ready', 'Перезапуск...', 'Обновление готово! Перезапуск приложения...');
      if (btnUpdateNowText) btnUpdateNowText.textContent = 'Перезапуск...';
    }
  });
}

// --- Init ---
async function init() {
  try {
    // Check admin rights and show warning banner if not admin
    if (window.api.getAdminStatus) {
      const adminStatus = await window.api.getAdminStatus();
      if (!adminStatus.isAdmin && adminWarningBanner) {
        if (!sessionStorage.getItem('dismissedAdminWarning')) {
          adminWarningBanner.style.display = 'flex';
        }
      }
    }

    const data = await window.api.getNodes();
    nodes = data.nodes || [];
    activeNodeId = data.activeNodeId || (nodes.length > 0 ? nodes[0].id : null);

    // Load settings
    const settings = await window.api.getSettings();
    if (settings) {
      currentSettings = { ...currentSettings, ...settings };
      if (pingTypeSelect) pingTypeSelect.value = currentSettings.pingType || 'icmp';
      if (pingTestUrlInput) pingTestUrlInput.value = currentSettings.testUrl || 'https://www.gstatic.com/generate_204';
      if (pingResultSelect) pingResultSelect.value = currentSettings.pingResultType || 'ms';
      if (settingAutoStart) settingAutoStart.checked = !!currentSettings.autoStart;
      if (settingSilentStart) settingSilentStart.checked = !!currentSettings.silentStart;
      if (settingKillSwitch) settingKillSwitch.checked = !!currentSettings.killSwitch;
      if (settingComssDns) settingComssDns.checked = currentSettings.comssDns !== false;
      if (toggleAppComssDns) toggleAppComssDns.checked = currentSettings.comssDns !== false;
      updateDnsBadge(currentSettings.comssDns !== false);
    }

    // Load routing rules
    await loadRoutingState();

    updateActiveServerView();

    // Load saved subscription meta (expiry / traffic)
    if (window.api.getSubMeta) {
      const meta = await window.api.getSubMeta();
      if (meta) updateSubMeta(meta);
    }

    const status = await window.api.getStatus();
    if (status.isRunning) {
      updateConnectionUI('connected', status.startTime);
    } else {
      updateConnectionUI('disconnected');
    }

    if (nodes.length > 0) {
      pingAllServers();
    }

    // Check if app was just updated via updater
    if (window.api.getUpdateStatus) {
      const updStatus = await window.api.getUpdateStatus();
      if (updStatus && updStatus.wasJustUpdated) {
        openUpdateModal({
          currentVersion: '1.2.0',
          version: '1.2.0',
          changelog: '### 🐻 HoneyBear VPN успешно обновлён до v1.2.0!\n\n- ✨ **Dual-Outbound AI Routing**: Google Gemini и Google Flow работают на любом сервере без конфликтов.\n- 🛡️ **WebRTC STUN Shield**: блокировка утечек локального и публичного IP провайдера.\n- 🔄 **Авто-апдейтер**: мгновенные обновления с GitHub в один клик.\n- 💎 **Обсидиановый люкс интерфейс**: микро-анимации, индикаторы и плавные переходы.'
        }, true);
      }
    }
  } catch (err) {
    console.error('Init error:', err);
  }
}

init();
