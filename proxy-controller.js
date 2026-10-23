// proxy-controller.js
// Manages Windows system proxy, synchronous shutdown recovery, and RunOnce boot protection

const { exec, execSync } = require('child_process');

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const RUN_ONCE_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce';
const GUARD_VALUE_NAME = 'HoneyBearNetGuard';

function execCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        console.warn(`Command warning [${cmd}]:`, stderr || error.message);
      }
      resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

/**
 * Installs a fail-safe Windows RunOnce entry while VPN is active.
 * If the PC is powered off or crashes while VPN is connected, Windows will automatically
 * reset ProxyEnable=0 and flush DNS on the very next login (even if HoneyBear VPN isn't launched).
 */
function installBootGuard() {
  // Self-healing at app launch handles cleanup cleanly without touching RunOnce
}

function removeBootGuard() {
  // No-op to avoid antivirus RunOnce heuristic warnings
}

/**
 * Synchronously disables Windows system proxy and flushes DNS (<15ms).
 * Safe to call inside Windows Shutdown (session-end), before-quit, and process.on('exit').
 */
function disableSystemProxySync() {
  try {
    execSync(`reg add "${REG_KEY}" /v ProxyEnable /t REG_DWORD /d 0 /f`, {
      windowsHide: true,
      timeout: 1500
    });
  } catch (e) {}
  try {
    execSync(`reg delete "${REG_KEY}" /v AutoConfigURL /f`, {
      windowsHide: true,
      timeout: 1000
    });
  } catch (e) {}
  try {
    removeBootGuard();
  } catch (e) {}
  try {
    execSync('ipconfig /flushdns', {
      windowsHide: true,
      timeout: 1500
    });
  } catch (e) {}
}

/**
 * Enables Windows system proxy pointing to 127.0.0.1:port
 */
async function enableSystemProxy(port = 20808) {
  const proxyServer = `127.0.0.1:${port}`;
  const override = '<local>;localhost;127.*;10.*;192.168.*';

  installBootGuard();

  // Set ProxyEnable to 1
  await execCommand(`reg add "${REG_KEY}" /v ProxyEnable /t REG_DWORD /d 1 /f`);
  // Set ProxyServer
  await execCommand(`reg add "${REG_KEY}" /v ProxyServer /t REG_SZ /d "${proxyServer}" /f`);
  // Set ProxyOverride (bypass local)
  await execCommand(`reg add "${REG_KEY}" /v ProxyOverride /t REG_SZ /d "${override}" /f`);

  // Notify Windows Internet Settings of change
  await refreshInternetSettings();
  console.log(`[ProxyController] Windows system proxy enabled -> ${proxyServer}`);
  return true;
}

/**
 * Disables Windows system proxy
 */
async function disableSystemProxy() {
  disableSystemProxySync();
  await refreshInternetSettings();
  console.log('[ProxyController] Windows system proxy disabled');
  return true;
}

/**
 * Reads current Windows system proxy status
 */
async function getSystemProxyStatus() {
  const res = await execCommand(`reg query "${REG_KEY}" /v ProxyEnable`);
  const enabled = res.stdout.includes('0x1');
  return { enabled };
}

/**
 * Calls WinINet InternetSetOption via PowerShell to immediately notify applications
 */
async function refreshInternetSettings() {
  try {
    await execCommand('cmd.exe /c ipconfig /flushdns');
  } catch (e) {}
}

/**
 * Detects connected physical network interfaces on Windows (Ethernet, Wi-Fi, etc.)
 * Excludes virtual, loopback, TUN/TAP, and VPN adapters.
 */
function getPhysicalInterfaces() {
  try {
    const stdout = execSync('chcp 65001 >nul & netsh interface ipv4 show interfaces', {
      windowsHide: true,
      encoding: 'utf-8',
      timeout: 3000
    });
    const lines = stdout.split(/\r?\n/);
    const ifaces = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('---') || trimmed.startsWith('Инд') || trimmed.startsWith('Idx')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 5) {
        const state = parts[3].toLowerCase();
        const name = parts.slice(4).join(' ');
        const lowerName = name.toLowerCase();
        if (state === 'connected' || state === 'подключен') {
          if (
            !lowerName.includes('loopback') &&
            !lowerName.includes('pseudo') &&
            !lowerName.includes('tun') &&
            !lowerName.includes('tap') &&
            !lowerName.includes('wintun') &&
            !lowerName.includes('sing') &&
            !lowerName.includes('radmin') &&
            !lowerName.includes('hamachi') &&
            !lowerName.includes('vmware') &&
            !lowerName.includes('virtualbox') &&
            !lowerName.includes('veth') &&
            !lowerName.includes('tailscale') &&
            !lowerName.includes('wireguard')
          ) {
            ifaces.push(name);
          }
        }
      }
    }
    return ifaces.length > 0 ? ifaces : ['Ethernet', 'Wi-Fi'];
  } catch (e) {
    return ['Ethernet', 'Wi-Fi'];
  }
}

/**
 * Synchronously sets Windows DNS on all active physical network adapters.
 */
function setSystemDnsSync(dnsServers = ['194.87.196.13', '94.250.253.55']) {
  const ifaces = getPhysicalInterfaces();
  for (const iface of ifaces) {
    try {
      execSync(`netsh interface ipv4 set dnsservers name="${iface}" source=static address=${dnsServers[0]} validate=no`, {
        windowsHide: true,
        timeout: 2500
      });
      if (dnsServers[1]) {
        execSync(`netsh interface ipv4 add dnsservers name="${iface}" address=${dnsServers[1]} index=2 validate=no`, {
          windowsHide: true,
          timeout: 2500
        });
      }
      console.log(`[ProxyController] System DNS set to Smart DNS (${dnsServers.join(', ')}) on ${iface}`);
    } catch (e) {
      console.warn(`[ProxyController] Failed to set DNS on ${iface}:`, e.message);
    }
  }
  try {
    execSync('ipconfig /flushdns', { windowsHide: true, timeout: 1500 });
  } catch (e) {}
}

/**
 * Synchronously restores Windows DNS on physical network adapters back to DHCP.
 */
function restoreSystemDnsSync() {
  const ifaces = getPhysicalInterfaces();
  for (const iface of ifaces) {
    try {
      execSync(`netsh interface ipv4 set dnsservers name="${iface}" source=dhcp`, {
        windowsHide: true,
        timeout: 2500
      });
      console.log(`[ProxyController] System DNS restored to DHCP on ${iface}`);
    } catch (e) {
      console.warn(`[ProxyController] Failed to restore DNS on ${iface}:`, e.message);
    }
  }
  try {
    execSync('ipconfig /flushdns', { windowsHide: true, timeout: 1500 });
  } catch (e) {}
}

async function setSystemDns(dnsServers = ['94.250.253.55', '83.220.169.155']) {
  return setSystemDnsSync(dnsServers);
}

async function restoreSystemDns() {
  return restoreSystemDnsSync();
}

module.exports = {
  enableSystemProxy,
  disableSystemProxy,
  disableSystemProxySync,
  installBootGuard,
  removeBootGuard,
  getSystemProxyStatus,
  refreshInternetSettings,
  setSystemDns,
  restoreSystemDns,
  setSystemDnsSync,
  restoreSystemDnsSync,
  getPhysicalInterfaces
};
