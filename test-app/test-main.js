const { app, BrowserWindow } = require('electron');
const path = require('path');

console.log('[TEST] app:', typeof app);
console.log('[TEST] BrowserWindow:', typeof BrowserWindow);

if (!app || !BrowserWindow) {
  console.error('[TEST] FAIL: electron module not loaded correctly');
  process.exit(1);
}

app.whenReady().then(() => {
  console.log('[TEST] App ready, creating window');
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadURL('data:text/html,<h1>Test - Electron is working!</h1>');
});
