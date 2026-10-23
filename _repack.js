const asar = require('@electron/asar');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const srcDir = __dirname;
const stagingDir = path.join(srcDir, 'dist', '_staging_app');

// Clean staging directory
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

// Strictly production files only (version.json is external manifest)
const files = [
  'package.json',
  'main.js',
  'preload.js',
  'core-manager.js',
  'config-parser.js',
  'proxy-controller.js',
  'updater-manager.js',
  'assets/bear.jpg',
  'assets/icon.ico',
  'bin/sing-box.exe',
  'bin/wintun.dll',
  'ui/app.js',
  'ui/index.html',
  'ui/style.css'
];

files.forEach((f) => {
  const src = path.join(srcDir, f);
  const dest = path.join(stagingDir, f);
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('Included: ' + f);
  } else {
    console.warn('MISSING: ' + src);
  }
});

console.log('Packaging app.asar...');
const targetDirs = [
  path.join(srcDir, 'release', 'win-unpacked'),
  path.join(srcDir, 'dist', 'win-unpacked')
];

(async () => {
  for (const tDir of targetDirs) {
    if (!fs.existsSync(tDir)) continue;
    const resDir = path.join(tDir, 'resources');
    const asarFile = path.join(resDir, 'app.asar');
    const looseAppDir = path.join(resDir, 'app');

    try {
      await asar.createPackage(stagingDir, asarFile);
      console.log(`Created asar at: ${asarFile}`);
      if (fs.existsSync(looseAppDir)) {
        fs.rmSync(looseAppDir, { recursive: true, force: true });
        console.log(`Cleaned loose app in ${resDir}`);
      }
      const resBin = path.join(resDir, 'bin');
      if (!fs.existsSync(resBin)) fs.mkdirSync(resBin, { recursive: true });
      ['sing-box.exe', 'wintun.dll'].forEach((binFile) => {
        try {
          const bSrc = path.join(srcDir, 'bin', binFile);
          const bDest = path.join(resBin, binFile);
          if (fs.existsSync(bSrc) && !fs.existsSync(bDest)) fs.copyFileSync(bSrc, bDest);
        } catch (e) {}
      });
    } catch (err) {
      console.error(`Error packing to ${tDir}:`, err.message);
    }
  }

  // Also copy to update/app.asar for GitHub auto-updater distribution
  try {
    const updateDir = path.join(srcDir, 'update');
    if (!fs.existsSync(updateDir)) fs.mkdirSync(updateDir, { recursive: true });
    const updateAsar = path.join(updateDir, 'app.asar');
    await asar.createPackage(stagingDir, updateAsar);
    console.log(`Created auto-updater package at: ${updateAsar}`);

    // Compute SHA-256 integrity hash & size
    const updateAsarBuf = fs.readFileSync(updateAsar);
    const sha256 = crypto.createHash('sha256').update(updateAsarBuf).digest('hex');
    const size = updateAsarBuf.length;
    console.log(`Computed SHA-256 for update/app.asar: ${sha256}`);
    console.log(`Size: ${size} bytes`);

    // Update version.json on disk
    const versionJsonPath = path.join(srcDir, 'version.json');
    let versionData = {
      name: "HoneyBear VPN",
      version: "1.2.0",
      date: new Date().toISOString().split('T')[0],
      changelog: "### 🐻 HoneyBear VPN v1.2.0\n\n- Удобный и простой VPN клиент.\n- Главная фишка — умное раздельное туннелирование: пускайте через VPN только нужные приложения и сайты.\n- Отборная Hysteria (Hysteria 2) для максимальной скорости и стабильного соединения.\n- Безопасное автообновление с проверкой целостности SHA-256.",
      downloadUrl: "https://raw.githubusercontent.com/zlykavoron86-png/honeybearvpn/main/update/app.asar",
      size: size,
      sha256: sha256
    };
    if (fs.existsSync(versionJsonPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
        versionData = { ...existing, size, sha256 };
        versionData.changelog = "### 🐻 HoneyBear VPN v1.2.0\n\n- Удобный и простой VPN клиент.\n- Главная фишка — умное раздельное туннелирование: пускайте через VPN только нужные приложения и сайты.\n- Отборная Hysteria (Hysteria 2) для максимальной скорости и стабильного соединения.\n- Безопасное автообновление с проверкой целостности SHA-256.";
      } catch (e) {}
    }
    fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2), 'utf8');
    console.log('Updated version.json with computed SHA-256 and size.');
  } catch (e) {
    console.error('Error creating update/app.asar:', e.message);
  }

  // Clean up staging folder
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  console.log('REPACK SUCCESSFUL: app.asar is clean, minimal, and secure!');
})();
