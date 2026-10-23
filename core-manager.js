// core-manager.js - Robust Ping Engine and sing-box Process Lifecycle

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const os = require('os');
const { generateSingBoxConfig } = require('./config-parser');

class CoreManager {
  constructor(appPath) {
    this.appPath = appPath;
    this.process = null;
    this.isRunning = false;
    this.startTime = null;
    this.logCallbacks = [];
    this.statusCallbacks = [];
    this.crashCallbacks = [];
    this.currentPort = 20808;
    this.activeTunMode = false;
    this.watchdogProc = null;
    this.currentConfigPath = path.join(this.appPath, 'active-config.json');
  }

  startWatchdog() {
    this.stopWatchdog();
    if (process.platform !== 'win32') return;
    try {
      const parentPid = process.pid;
      const psCmd = `while (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 1500 }; reg add 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' /v ProxyEnable /t REG_DWORD /d 0 /f | Out-Null; Stop-Process -Name 'sing-box' -Force -ErrorAction SilentlyContinue; ipconfig /flushdns | Out-Null`;
      this.watchdogProc = spawn('powershell.exe', [
        '-NoProfile',
        '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass',
        '-Command', psCmd
      ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      if (this.watchdogProc && typeof this.watchdogProc.unref === 'function') {
        this.watchdogProc.unref();
      }
    } catch (e) {}
  }

  stopWatchdog() {
    if (this.watchdogProc) {
      try {
        this.watchdogProc.kill();
      } catch (e) {}
      this.watchdogProc = null;
    }
  }

  ensureBinaries() {
    const targetDir = path.join(this.appPath, 'bin');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetExe = path.join(targetDir, 'sing-box.exe');
    const targetDll = path.join(targetDir, 'wintun.dll');

    const exeSources = [
      path.join(process.resourcesPath || '', 'bin', 'sing-box.exe'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bin', 'sing-box.exe'),
      path.join(__dirname, 'bin', 'sing-box.exe'),
      path.join(process.cwd(), 'bin', 'sing-box.exe')
    ];

    const dllSources = [
      path.join(process.resourcesPath || '', 'bin', 'wintun.dll'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bin', 'wintun.dll'),
      path.join(__dirname, 'bin', 'wintun.dll'),
      path.join(process.cwd(), 'bin', 'wintun.dll')
    ];

    // Check if targetExe is valid (> 10MB)
    let hasExe = false;
    try {
      if (fs.existsSync(targetExe) && fs.statSync(targetExe).size > 10000000) {
        hasExe = true;
      }
    } catch (e) {}

    if (!hasExe) {
      for (const src of exeSources) {
        try {
          if (fs.existsSync(src)) {
            const buf = fs.readFileSync(src);
            if (buf && buf.length > 10000000) {
              fs.writeFileSync(targetExe, buf);
              hasExe = true;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // Check if targetDll is valid (> 100KB)
    let hasDll = false;
    try {
      if (fs.existsSync(targetDll) && fs.statSync(targetDll).size > 100000) {
        hasDll = true;
      }
    } catch (e) {}

    if (!hasDll) {
      for (const src of dllSources) {
        try {
          if (fs.existsSync(src)) {
            const buf = fs.readFileSync(src);
            if (buf && buf.length > 100000) {
              fs.writeFileSync(targetDll, buf);
              hasDll = true;
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (hasExe) {
      return targetExe;
    }

    // Secondary fallback outside asar
    for (const src of exeSources) {
      if (fs.existsSync(src) && !src.includes('.asar')) {
        return src;
      }
    }

    throw new Error('Бинарный файл sing-box.exe не найден!');
  }

  getBinaryPath() {
    return this.ensureBinaries();
  }

  prewarmBinaries() {
    setTimeout(() => {
      try {
        const binPath = this.ensureBinaries();
        const binDir = path.dirname(binPath);
        const child = spawn(binPath, ['version'], {
          cwd: binDir,
          windowsHide: true,
          stdio: 'ignore'
        });
        child.on('error', () => {});
      } catch (e) {}
    }, 150);
  }

  onLog(cb) {
    this.logCallbacks.push(cb);
  }

  onStatus(cb) {
    this.statusCallbacks.push(cb);
  }

  emitLog(message) {
    for (const cb of this.logCallbacks) {
      cb(message);
    }
  }

  emitStatus(status) {
    for (const cb of this.statusCallbacks) {
      cb({ state: status, startTime: this.startTime });
    }
  }

  onCrash(cb) {
    this.crashCallbacks.push(cb);
  }

  emitCrash(code) {
    for (const cb of this.crashCallbacks) {
      cb(code);
    }
  }

  async start(node, options = {}) {
    if (this.isRunning) {
      await this.stop();
    }

    this.activeNode = node;
    this.currentOptions = { ...(this.currentOptions || {}), ...options };
    this.activeTunMode = !!this.currentOptions.tunMode;
    this.currentPort = this.currentOptions.mixedPort || 20808;
    this._manualStop = false;

    const binaryPath = this.getBinaryPath();
    const config = generateSingBoxConfig(node.outbound, this.currentOptions);
    fs.writeFileSync(this.currentConfigPath, JSON.stringify(config, null, 2), 'utf-8');

    this.emitLog(`[HoneyBear] Запуск ядра для "${node.name}" (${this.activeTunMode ? 'TUN' : 'System Proxy'})...`);
    this.emitStatus('connecting');

    return new Promise((resolve, reject) => {
      let started = false;
      let fallbackTriggered = false;
      let pollInterval = null;
      let lastStderrLine = '';

      const clearPolling = () => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };

      const triggerTunFallback = async (reason) => {
        if (fallbackTriggered || started || !options.tunMode) return false;
        fallbackTriggered = true;
        clearPolling();
        this.emitLog(`[HoneyBear] ⚠ TUN-режим недоступен (${reason}). Авто-переключение на системный прокси...`);
        this._manualStop = true;
        if (this.process) {
          try { this.process.kill(); } catch (e) {}
          this.process = null;
        }
        this.isRunning = false;
        this.activeTunMode = false;
        try {
          await this.start(node, { ...options, tunMode: false });
          resolve(true);
        } catch (e) {
          reject(e);
        }
        return true;
      };

      const binDir = path.dirname(binaryPath);
      const env = {
        ...process.env,
        PATH: `${binDir};${process.env.PATH || ''}`,
        ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM: 'true',
        ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER: 'true',
        ENABLE_DEPRECATED_LEGACY_DOMAIN_STRATEGY_OPTIONS: 'true'
      };

      this.process = spawn(binaryPath, ['run', '-c', this.currentConfigPath], {
        cwd: binDir,
        windowsHide: true,
        env: env
      });

      const markStarted = () => {
        if (started || fallbackTriggered) return;
        started = true;
        clearPolling();
        this.isRunning = true;
        this.startTime = Date.now();
        this.startWatchdog();
        this.emitStatus('connected');
        resolve(true);
      };

      const onData = (data) => {
        const text = data.toString();
        this.emitLog(text);

        const trimmed = text.trim();
        if (trimmed) {
          const lines = trimmed.split(/\r?\n/);
          lastStderrLine = lines[lines.length - 1];
        }

        // Detect TUN permission / Wintun driver FATAL failure on any Windows locale (EN / RU)
        const isFatalLine = text.includes('FATAL') || text.includes('fatal');
        const isTunError =
          text.includes('configure tun interface') ||
          text.includes('initialize inbound/tun') ||
          text.includes('open tun') ||
          text.includes('Access is denied') ||
          text.includes('Отказано в доступе');

        if (options.tunMode && !started && isFatalLine && isTunError) {
          triggerTunFallback('драйвер адаптера или права администратора');
          return;
        }

        if (!started && (text.includes('sing-box started') || text.includes('inbound/mixed') || text.includes('inbound/tun'))) {
          markStarted();
        }
      };

      this.process.stdout.on('data', onData);
      this.process.stderr.on('data', onData);

      this.process.on('error', async (err) => {
        clearPolling();
        this.emitLog(`[Core Error] ${err.message}`);
        if (options.tunMode && !started) {
          const handled = await triggerTunFallback(err.message);
          if (handled) return;
        }
        this.isRunning = false;
        this.startTime = null;
        this.process = null;
        this.stopWatchdog();
        this.emitStatus('disconnected');
        if (!started && !fallbackTriggered) reject(err);
      });

      this.process.on('close', async (code) => {
        clearPolling();
        if (fallbackTriggered) return;

        this.emitLog(`[HoneyBear] sing-box остановлен (код ${code})`);

        // Universal fallback: if sing-box exited before starting while in TUN mode, always retry in System Proxy mode
        if (options.tunMode && !started && !this._manualStop) {
          const handled = await triggerTunFallback(`код выхода ${code}`);
          if (handled) return;
        }

        const wasCrash = !this._manualStop && this.isRunning;
        this.isRunning = false;
        this.startTime = null;
        this.process = null;
        this.stopWatchdog();
        this.emitStatus('disconnected');

        if (!started && !this._manualStop) {
          reject(new Error(`Ядро остановилось при запуске (код ${code})${lastStderrLine ? ': ' + lastStderrLine : ''}`));
          return;
        }

        if (wasCrash) {
          this.emitLog('[HoneyBear] ⚠ Ядро упало неожиданно!');
          this.emitCrash(code);
        }
      });

      // Continuous port polling up to 22 seconds (handles first-run Windows Defender / SmartScreen scan of 81MB sing-box.exe)
      const pollStartTime = Date.now();
      const maxWaitMs = 22000;
      let isProbing = false;

      pollInterval = setInterval(() => {
        if (started || fallbackTriggered || isProbing) return;
        if (!this.process || this.process.killed) {
          clearPolling();
          return;
        }

        const elapsed = Date.now() - pollStartTime;
        isProbing = true;

        this.probePort('127.0.0.1', this.currentPort, 600).then(async (probeRes) => {
          isProbing = false;
          if (started || fallbackTriggered) return;

          if (probeRes.success) {
            markStarted();
          } else if (elapsed >= maxWaitMs) {
            clearPolling();
            if (options.tunMode) {
              await triggerTunFallback('таймаут инициализации Wintun');
              return;
            }
            this.emitLog('[HoneyBear] ⚠ Таймаут запуска ядра (22 сек): порт не отвечает');
            if (this.process) {
              this._manualStop = true;
              try { this.process.kill(); } catch (e) {}
            }
            this.isRunning = false;
            this.startTime = null;
            this.stopWatchdog();
            this.emitStatus('disconnected');
            reject(new Error('Таймаут запуска sing-box (возможно, антивирус заблокировал sing-box.exe)'));
          }
        });
      }, 650);
    });
  }

  stopSync() {
    this._manualStop = true;
    this.stopWatchdog();
    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {}
      this.process = null;
    }
    try {
      const { execSync } = require('child_process');
      execSync('taskkill /F /IM sing-box.exe', { windowsHide: true, stdio: 'ignore', timeout: 1500 });
    } catch (e) {}
    this.isRunning = false;
    this.startTime = null;
  }

  async stop() {
    this.stopWatchdog();
    if (!this.process) {
      this.isRunning = false;
      this.startTime = null;
      this.emitStatus('disconnected');
      return;
    }

    this._manualStop = true;
    const wasTun = !!(this.currentOptions && this.currentOptions.tunMode);
    this.emitLog('[HoneyBear] Остановка ядра...');

    const proc = this.process;

    await new Promise((resolve) => {
      // Safety timeout: if process doesn't exit in 3s, force kill
      const safetyTimer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
        this.process = null;
        this.isRunning = false;
        this.startTime = null;
        this.emitStatus('disconnected');
        resolve();
      }, 3000);

      proc.once('close', () => {
        clearTimeout(safetyTimer);
        this.process = null;
        this.isRunning = false;
        this.startTime = null;
        this.emitStatus('disconnected');
        resolve();
      });

      try {
        proc.kill();
      } catch (e) {
        clearTimeout(safetyTimer);
        this.process = null;
        this.isRunning = false;
        this.startTime = null;
        this.emitStatus('disconnected');
        resolve();
      }
    });

    // After TUN mode: Windows takes a fraction of a second to release the adapter.
    if (wasTun) {
      await new Promise(r => setTimeout(r, 800));
    } else {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  async updateOptions(newOptions = {}) {
    if (this.currentOptions) {
      this.currentOptions = { ...this.currentOptions, ...newOptions };
    }
    if (this.isRunning && this.activeNode) {
      this.emitLog('[HoneyBear] Применение обновленной конфигурации на лету...');
      const prevStartTime = this.startTime;
      await this.start(this.activeNode, this.currentOptions);
      if (prevStartTime) this.startTime = prevStartTime;
    }
  }

  async updateRouting(routingSettings) {
    await this.updateOptions({ routing: routingSettings });
  }

  /**
   * Helper: Get primary physical IPv4 address to bypass virtual TUN adapter
   */
  getPhysicalIp() {
    try {
      const ifaces = os.networkInterfaces();
      for (const [name, addrs] of Object.entries(ifaces)) {
        const lower = name.toLowerCase();
        if (
          lower.includes('tun') ||
          lower.includes('sing') ||
          lower.includes('radmin') ||
          lower.includes('tap') ||
          lower.includes('loopback') ||
          lower.includes('pseudo') ||
          lower.includes('teredo')
        ) {
          continue;
        }
        for (const a of addrs) {
          if (a.family === 'IPv4' && !a.internal) {
            if (!a.address.startsWith('172.18.') && !a.address.startsWith('172.19.')) {
              return a.address;
            }
          }
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * Helper: Parse node endpoint host and port safely (supports IPv6, domain, and explicit port)
   */
  extractNodeHostAndPort(node) {
    if (!node) return { host: '', port: 443 };
    let host = node.outbound?.server;
    let port = node.outbound?.server_port;

    if (!host && node.server) {
      if (node.server.startsWith('[')) {
        const match = node.server.match(/^\[(.*?)\](?::(\d+))?$/);
        if (match) {
          host = match[1];
          port = match[2] ? parseInt(match[2], 10) : 443;
        }
      } else if (node.server.includes(':')) {
        const parts = node.server.split(':');
        host = parts[0];
        port = parseInt(parts[1], 10) || 443;
      } else {
        host = node.server;
        port = 443;
      }
    }
    return {
      host: (host || '').trim(),
      port: parseInt(port, 10) || 443
    };
  }

  /**
   * Smart Multi-strategy Ping (Happ-style)
   */
  async pingNode(node, options = {}) {
    const pingType = options.pingType || 'icmp';
    const testUrl = options.testUrl || 'http://cp.cloudflare.com/generate_204';

    // If viaProxy is requested:
    // Only the currently connected active node can be tested via proxy!
    // For all other nodes in the server list, measure direct real latency.
    if (pingType === 'viaProxy') {
      const isActiveNode = this.isRunning && this.activeNode && (this.activeNode.id === node.id);
      if (isActiveNode) {
        const proxyRes = await this.viaProxyPing(testUrl);
        if (proxyRes.success && proxyRes.latency > 5) return proxyRes;
      }
      return await this.icmpPing(node);
    }

    if (pingType === 'tcp') {
      const tcpRes = await this.tcpPing(node);
      if (tcpRes.success) return tcpRes;
      return await this.icmpPing(node);
    }

    // Default to ICMP ping (fastest, universally accurate across Hysteria2 UDP and TCP protocols)
    const icmpRes = await this.icmpPing(node);
    if (icmpRes.success) return icmpRes;
    return await this.tcpPing(node);
  }

  /**
   * Probe single TCP port with physical interface binding to bypass TUN
   */
  probePort(host, port, timeoutMs = 1500, physicalIp = null) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      const opts = { host, port };
      if (physicalIp) opts.localAddress = physicalIp;

      socket.connect(opts, () => {
        const latency = Date.now() - startTime;
        socket.destroy();
        resolve({ success: true, latency });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, latency: -1 });
      });

      socket.on('error', () => {
        socket.destroy();
        resolve({ success: false, latency: -1 });
      });
    });
  }

  /**
   * TCP Handshake Ping with smart port fallback for UDP/Hysteria nodes
   */
  async tcpPing(node) {
    const { host, port } = this.extractNodeHostAndPort(node);
    if (!host) return { success: false, latency: -1 };

    const physicalIp = this.getPhysicalIp();

    // 1. Probe the configured port directly via physical interface
    const res = await this.probePort(host, port, 1500, physicalIp);
    if (res.success) return res;

    // 2. Fallback to standard open web ports for Hysteria/UDP hosts
    const fallbackPorts = [443, 8443, 80, 8444, 2053].filter(p => p !== port);
    for (const fp of fallbackPorts) {
      const fRes = await this.probePort(host, fp, 1200, physicalIp);
      if (fRes.success) return fRes;
    }

    // 3. Fallback to ICMP ping via physical interface
    return await this.icmpPing(node);
  }

  /**
   * via Proxy HTTP GET Ping (Real round-trip web delay, not instant loopback CONNECT)
   */
  async viaProxyPing(targetUrl = 'http://cp.cloudflare.com/generate_204') {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const req = http.request({
        host: '127.0.0.1',
        port: this.currentPort,
        method: 'GET',
        path: targetUrl,
        headers: {
          'Host': 'cp.cloudflare.com',
          'User-Agent': 'HoneyBear/1.0',
          'Connection': 'close'
        },
        timeout: 3000
      }, (res) => {
        const latency = Date.now() - startTime;
        res.resume();
        resolve({ success: true, latency });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, latency: -1, error: 'Timeout' });
      });

      req.on('error', (err) => {
        resolve({ success: false, latency: -1, error: err.message });
      });

      req.end();
    });
  }

  /**
   * ICMP Ping with physical adapter binding (-S physicalIp) & multi-language parsing
   */
  async icmpPing(node) {
    const { host } = this.extractNodeHostAndPort(node);
    if (!host) return { success: false, latency: -1 };

    const physicalIp = this.getPhysicalIp();
    const sourceArg = physicalIp ? `-S ${physicalIp}` : '';

    return new Promise((resolve) => {
      exec(`ping -n 1 -w 1500 ${sourceArg} ${host}`, { windowsHide: true }, (err, stdout) => {
        if (!stdout) {
          return resolve({ success: false, latency: -1, error: 'Timeout' });
        }
        // 1. Match reply line with TTL (works in English, Russian CP866/CP1251, German, etc.)
        const ttlMatch = stdout.match(/[=<](\d+)[^=0-9]*TTL=/i);
        if (ttlMatch) {
          return resolve({ success: true, latency: parseInt(ttlMatch[1], 10) });
        }
        // 2. Match summary statistics (Average = X ms / Среднее = X мс)
        const avgMatch = stdout.match(/(?:Average|Среднее|Maximum|Minimum)\s*=\s*(\d+)/i);
        if (avgMatch) {
          return resolve({ success: true, latency: parseInt(avgMatch[1], 10) });
        }
        // 3. Fallback regex
        const timeMatch = stdout.match(/(?:time|время)[=<](\d+)/i);
        if (timeMatch) {
          return resolve({ success: true, latency: parseInt(timeMatch[1], 10) });
        }
        resolve({ success: false, latency: -1, error: 'Timeout' });
      });
    });
  }
}

module.exports = CoreManager;
