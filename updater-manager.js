// updater-manager.js - Lightweight, resilient GitHub Auto-Updater for HoneyBear VPN
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

class UpdaterManager {
  constructor(options = {}) {
    this.appVersion = options.currentVersion || app.getVersion() || '1.1.0';
    this.repo = options.repo || 'zlykavoron86-png/honeybearvpn';
    this.checkOnStartup = options.checkOnStartup !== false;
    this.status = 'idle'; // 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error'
    this.updateInfo = null;
    this.lastChecked = null;
    this.listeners = [];
  }

  onEvent(cb) {
    if (typeof cb === 'function') {
      this.listeners.push(cb);
    }
  }

  emit(type, payload = {}) {
    this.listeners.forEach((cb) => {
      try {
        cb({ type, status: this.status, ...payload });
      } catch (e) {}
    });
  }

  setRepo(repo) {
    if (repo && typeof repo === 'string' && repo.includes('/')) {
      this.repo = repo.trim();
    }
  }

  /**
   * SemVer comparator: returns > 0 if v1 > v2, < 0 if v1 < v2, 0 if equal
   */
  compareVersions(v1, v2) {
    const clean1 = (v1 || '').replace(/^[vV]/, '').trim();
    const clean2 = (v2 || '').replace(/^[vV]/, '').trim();
    const p1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
    const p2 = clean2.split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  /**
   * HTTPS GET with automatic redirect following
   */
  fetchJson(url) {
    return new Promise((resolve, reject) => {
      const headers = {
        'User-Agent': 'HoneyBearVPN-Updater/1.2',
        Accept: 'application/vnd.github.v3+json, application/json'
      };

      const makeRequest = (currentUrl, redirectsLeft = 5) => {
        if (redirectsLeft <= 0) {
          return reject(new Error('Too many redirects'));
        }

        const req = https.get(currentUrl, { headers, timeout: 8000 }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return makeRequest(res.headers.location, redirectsLeft - 1);
          }

          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(err);
            }
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error('Connection timed out'));
        });
        req.on('error', reject);
      };

      makeRequest(url);
    });
  }

  /**
   * Check for updates via GitHub Releases API with fallback to raw version.json
   */
  async checkForUpdates() {
    this.status = 'checking';
    this.emit('checking');

    try {
      let releaseData = null;
      let rawFallback = false;

      // 1. Primary: GitHub Releases API
      try {
        const apiUrl = `https://api.github.com/repos/${this.repo}/releases/latest`;
        releaseData = await this.fetchJson(apiUrl);
      } catch (apiErr) {
        // 2. Fallback: raw version.json on main branch
        try {
          const rawUrl = `https://raw.githubusercontent.com/${this.repo}/main/version.json`;
          releaseData = await this.fetchJson(rawUrl);
          rawFallback = true;
        } catch (rawErr) {
          throw new Error(apiErr.message || rawErr.message);
        }
      }

      this.lastChecked = Date.now();

      let remoteVersion = '';
      let changelog = '';
      let releaseName = '';
      let publishedAt = '';
      let asarAsset = null;
      let fullAsset = null;
      let expectedSha256 = null;

      if (!rawFallback && releaseData) {
        remoteVersion = (releaseData.tag_name || releaseData.name || '').replace(/^[vV]/, '');
        releaseName = releaseData.name || `Версия ${remoteVersion}`;
        changelog = releaseData.body || 'Регулярные улучшения стабильности и обхода блокировок.';
        publishedAt = releaseData.published_at || new Date().toISOString();

        if (Array.isArray(releaseData.assets)) {
          asarAsset = releaseData.assets.find(a => a.name === 'app.asar');
          fullAsset = releaseData.assets.find(a => a.name.endsWith('.exe') || a.name.endsWith('.zip'));
        }

        // Extract SHA-256 integrity hash from release body if present
        const match = (changelog || '').match(/sha256[:\s=]+([a-fA-F0-9]{64})/i);
        if (match) {
          expectedSha256 = match[1].toLowerCase();
        } else {
          try {
            const vData = await this.fetchJson(`https://raw.githubusercontent.com/${this.repo}/main/version.json`);
            if (vData && vData.sha256) expectedSha256 = vData.sha256.trim().toLowerCase();
          } catch (e) {}
        }
      } else if (rawFallback && releaseData) {
        remoteVersion = (releaseData.version || '').replace(/^[vV]/, '');
        releaseName = releaseData.name || `Версия ${remoteVersion}`;
        changelog = releaseData.changelog || releaseData.notes || 'Обновление компонентов HoneyBear VPN.';
        publishedAt = releaseData.date || new Date().toISOString();
        if (releaseData.downloadUrl) {
          asarAsset = { browser_download_url: releaseData.downloadUrl, size: releaseData.size || 0 };
        }
        if (releaseData.sha256) {
          expectedSha256 = releaseData.sha256.trim().toLowerCase();
        }
      }

      const hasUpdate = this.compareVersions(remoteVersion, this.appVersion) > 0;

      if (hasUpdate) {
        this.status = 'available';
        this.updateInfo = {
          currentVersion: this.appVersion,
          version: remoteVersion,
          name: releaseName,
          changelog: changelog,
          publishedAt: publishedAt,
          downloadUrl: asarAsset ? asarAsset.browser_download_url : (fullAsset ? fullAsset.browser_download_url : null),
          assetType: asarAsset ? 'asar' : (fullAsset ? 'installer' : 'unknown'),
          size: asarAsset ? asarAsset.size : (fullAsset ? fullAsset.size : 0),
          sha256: expectedSha256
        };
        this.emit('available', { updateInfo: this.updateInfo });
        return { hasUpdate: true, updateInfo: this.updateInfo };
      } else {
        this.status = 'up-to-date';
        this.updateInfo = null;
        this.emit('up-to-date', { currentVersion: this.appVersion });
        return { hasUpdate: false, currentVersion: this.appVersion };
      }
    } catch (err) {
      this.status = 'error';
      this.emit('error', { error: err.message, currentVersion: this.appVersion });
      return { hasUpdate: false, error: err.message };
    }
  }

  /**
   * Download and apply in-place app.asar update, then relaunch
   */
  async downloadAndInstall(downloadUrl) {
    const url = downloadUrl || (this.updateInfo && this.updateInfo.downloadUrl);
    if (!url) {
      throw new Error('Ссылка на обновление отсутствует');
    }

    this.status = 'downloading';
    this.emit('downloading', { percent: 0 });

    const isPackaged = app.isPackaged;
    const resourcesPath = isPackaged
      ? process.resourcesPath
      : path.join(__dirname, 'dist', 'win-unpacked', 'resources');

    const targetAsar = path.join(resourcesPath, 'app.asar');
    const tempAsar = path.join(resourcesPath, 'app.asar.update');

    // Download to tempAsar
    await new Promise((resolve, reject) => {
      const headers = { 'User-Agent': 'HoneyBearVPN-Updater/1.2' };
      const downloadFile = (currentUrl, redirectsLeft = 5) => {
        if (redirectsLeft <= 0) return reject(new Error('Слишком много перенаправлений'));

        const req = https.get(currentUrl, { headers, timeout: 20000 }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return downloadFile(res.headers.location, redirectsLeft - 1);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Ошибка скачивания: HTTP ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let downloaded = 0;
          const fileStream = fs.createWriteStream(tempAsar);

          res.on('data', (chunk) => {
            downloaded += chunk.length;
            if (totalBytes > 0) {
              const percent = Math.min(100, Math.round((downloaded / totalBytes) * 100));
              this.emit('downloading', { percent, downloaded, totalBytes });
            }
          });

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });

          fileStream.on('error', (err) => {
            try { fs.unlinkSync(tempAsar); } catch (e) {}
            reject(err);
          });

          res.pipe(fileStream);
        });

        req.on('error', (err) => {
          try { fs.unlinkSync(tempAsar); } catch (e) {}
          reject(err);
        });
      };

      downloadFile(url);
    });

    // Verify SHA-256 integrity checksum if provided
    if (this.updateInfo && this.updateInfo.sha256) {
      const expected = this.updateInfo.sha256.trim().toLowerCase();
      try {
        const fileBuffer = fs.readFileSync(tempAsar);
        const actual = crypto.createHash('sha256').update(fileBuffer).digest('hex').toLowerCase();
        if (actual !== expected) {
          try { fs.unlinkSync(tempAsar); } catch (e) {}
          this.status = 'error';
          const err = new Error(`Ошибка целостности обновления: хеш SHA-256 не совпадает! Ожидалось: ${expected}, получено: ${actual}`);
          this.emit('error', { error: err.message });
          throw err;
        }
      } catch (err) {
        try { fs.unlinkSync(tempAsar); } catch (e) {}
        this.status = 'error';
        this.emit('error', { error: err.message });
        throw err;
      }
    }

    this.status = 'ready';
    this.emit('ready', { version: this.updateInfo ? this.updateInfo.version : '' });

    // Prepare helper script for restart
    this.restartAndApply(targetAsar, tempAsar);
  }

  restartAndApply(targetAsar, tempAsar) {
    const exePath = process.execPath;
    const batPath = path.join(path.dirname(tempAsar), 'apply_update.cmd');

    const batContent = `@echo off
timeout /t 1 /nobreak > NUL
:retry
move /y "${tempAsar}" "${targetAsar}" > NUL 2>&1
if exist "${tempAsar}" (
    timeout /t 1 /nobreak > NUL
    goto retry
)
start "" "${exePath}" --updated
del "%~f0"
exit
`;

    fs.writeFileSync(batPath, batContent, 'utf8');

    // Spawn detached updater batch script
    spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();

    // Gracefully exit Electron app so file lock is released
    app.exit(0);
  }
}

module.exports = UpdaterManager;
