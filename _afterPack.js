const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

exports.default = async function (context) {
  const appOutDir = context.appOutDir;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(appOutDir, exeName);
  const rceditPath = path.join(__dirname, 'tools', 'rcedit.exe');
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');

  if (fs.existsSync(exePath) && fs.existsSync(rceditPath)) {
    console.log(`[afterPack] Patching Windows PE resources for ${exePath}...`);
    try {
      execFileSync(rceditPath, [
        exePath,
        '--set-version-string', 'FileDescription', 'HoneyBearVPN',
        '--set-version-string', 'ProductName', 'HoneyBearVPN',
        '--set-version-string', 'CompanyName', 'HoneyBearVPN Team',
        '--set-version-string', 'LegalCopyright', 'Copyright (C) 2026 HoneyBearVPN',
        '--set-version-string', 'OriginalFilename', exeName,
        '--set-version-string', 'InternalName', 'HoneyBearVPN',
        '--set-file-version', '1.2.0',
        '--set-product-version', '1.2.0',
        '--set-icon', iconPath
      ]);
      console.log(`[afterPack] PE resources patched successfully: FileDescription = HoneyBearVPN`);
    } catch (err) {
      console.error(`[afterPack] Failed to patch PE resources:`, err.message);
    }
  }
};
