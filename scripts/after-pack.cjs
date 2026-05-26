const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);

  if (!fs.existsSync(exePath)) {
    throw new Error(`Packaged Electron executable not found: ${exePath}`);
  }

  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
  });

  console.log(`Disabled ELECTRON_RUN_AS_NODE support for ${exePath}`);
};
