const { app, BrowserWindow } = require('electron');
console.log('[TEST] app:', typeof app);
console.log('[TEST] BrowserWindow:', typeof BrowserWindow);
if (!app || !BrowserWindow) { console.error('[TEST] FAIL'); process.exit(1); }
app.whenReady().then(() => {
  console.log('[TEST] READY');
  const win = new BrowserWindow({ width: 800, height: 600, show: false });
  win.loadURL('data:text/html,<h1>Test</h1>');
  setTimeout(() => { win.close(); app.quit(); }, 1000);
});
