const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

app.disableHardwareAcceleration();

// --- Crash/Startup Logging ---
let LOG_FILE = '';
function initLog() {
  try {
    LOG_FILE = path.join(app.getPath('userData'), 'app-crash.log');
  } catch(e) {
    LOG_FILE = path.join(process.env.TEMP || process.env.TMP || '.', 'keuangan-gereja-crash.log');
  }
}
function writeLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { if (LOG_FILE) fs.appendFileSync(LOG_FILE, line); } catch(e) {}
  console.log(msg);
}

process.on('uncaughtException', (err) => {
  writeLog('UNCAUGHT EXCEPTION: ' + err.stack);
  dialog.showErrorBox('Fatal Error', 'Aplikasi mengalami error fatal:\n\n' + err.message + '\n\nDetail log: ' + LOG_FILE);
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  writeLog('UNHANDLED REJECTION: ' + (reason.stack || String(reason)));
});

initLog();
writeLog('App starting, Electron ' + process.versions.electron + ', Node ' + process.versions.node);

// Let Electron use default GPU settings
// Only disable hardware acceleration if specifically needed
// app.commandLine.appendSwitch('disable-gpu');
// app.commandLine.appendSwitch('disable-gpu-compositing');

let mainWindow;
let projectFilePath = null;

function createApplicationMenu() {
  const appVersion = app.getVersion();
  const appName = app.getName();

  const template = [
    // ── File ──
    {
      label: 'File',
      submenu: [
        {
          label: 'Project Baru',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:action', 'new-project');
          },
        },
        {
          label: 'Buka Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            console.log('[MENU] Buka Project clicked');
            if (mainWindow) mainWindow.webContents.send('menu:action', 'open-project');
          },
        },
        { type: 'separator' },
        {
          label: 'Simpan Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            console.log('[MENU] Simpan Project clicked');
            if (mainWindow) mainWindow.webContents.send('menu:action', 'save-project');
          },
        },
        {
          label: 'Simpan Sebagai...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            console.log('[MENU] Simpan Sebagai clicked');
            if (mainWindow) mainWindow.webContents.send('menu:action', 'save-project-as');
          },
        },
        { type: 'separator' },
        {
          label: 'Export Data Keuangan...',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:action', 'export-data');
          },
        },
        { type: 'separator' },
        {
          label: 'Cetak Laporan',
          accelerator: 'CmdOrCtrl+P',
          enabled: false,
        },
        { type: 'separator' },
        { role: 'quit', label: 'Keluar', accelerator: 'Alt+F4' },
      ],
    },
    // ── Edit ──
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Urungkan' },
        { role: 'redo', label: 'Ulangi' },
        { type: 'separator' },
        { role: 'cut', label: 'Potong' },
        { role: 'copy', label: 'Salin' },
        { role: 'paste', label: 'Tempel' },
        { role: 'pasteAndMatchStyle', label: 'Tempel Sesuai Gaya' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Pilih Semua' },
      ],
    },
    // ── View ──
    {
      label: 'Tampilan',
      submenu: [
        { type: 'separator' },
        { role: 'zoomIn', label: 'Perbesar', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut', label: 'Perkecil' },
        { role: 'resetZoom', label: 'Ukuran Normal' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Layar Penuh' },
        { type: 'separator' },
        {
          label: 'Muat Ulang Aplikasi',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.webContents.reload();
          },
        },
        {
          label: 'Reload Tanpa Cache',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
          },
        },
        { type: 'separator' },
        ...(isDev ? [
          {
            label: 'Buka Developer Tools',
            accelerator: 'F12',
            click: () => {
              if (mainWindow) mainWindow.webContents.openDevTools();
            },
          },
        ] : [
          {
            label: 'Developer Tools',
            enabled: false,
          },
        ]),
      ],
    },
    // ── Window (macOS only) ──
    ...(process.platform === 'darwin' ? [{
      label: 'Window',
      submenu: [
        { role: 'minimize', label: 'Minimalkan' },
        { role: 'close', label: 'Tutup' },
      ],
    }] : []),
    // ── Bantuan ──
    {
      label: 'Bantuan',
      submenu: [
        {
          label: 'Tentang Aplikasi',
          click: () => mainWindow.webContents.send('menu:action', 'about'),
        },
        { type: 'separator' },
        {
          label: `Versi ${appVersion}`,
          enabled: false,
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  writeLog('createWindow called, isDev=' + isDev);
  createApplicationMenu();
  const appRoot = path.join(__dirname, '..');
  const indexPath = isDev
    ? 'http://localhost:5173'
    : path.join(appRoot, 'frontend/dist/index.html');
  writeLog('Loading: ' + indexPath);

  const iconPath = path.join(appRoot, 'frontend', 'public', 'church-logo.ico');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  // Show window immediately (not waiting for ready-to-show) so user sees it
  mainWindow.show();

  // Log page load errors
  mainWindow.webContents.on('did-fail-load', (event, code, desc, url) => {
    writeLog('Page load failed: code=' + code + ' desc=' + desc + ' url=' + url);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    writeLog('Page finished loading');
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    writeLog('Renderer process gone: ' + JSON.stringify(details));
  });

  // Security: prevent external navigation
  mainWindow.webContents.on('will-navigate', (event) => {
    if (!isDev) event.preventDefault();
  });

  // Security: block external resources
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Security: Content Security Policy for production
  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; frame-src 'none'; object-src 'none';"
          ]
        }
      });
    });
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    if (!fs.existsSync(indexPath)) {
      writeLog('ERROR: index.html not found at ' + indexPath);
      dialog.showErrorBox('File Not Found', 'Application files are missing:\n\n' + indexPath);
      app.quit();
      return;
    }
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  writeLog('App ready');
  createWindow();
}).catch((err) => {
  writeLog('App failed to start: ' + err.stack);
  dialog.showErrorBox('Keuangan Gereja - Startup Error',
    'Aplikasi gagal memulai:\n\n' + err.message + '\n\nDetail log: ' + LOG_FILE);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- XLSX lazy load (only needed for exports, not startup) ---

let XLSX;
function loadXLSX() {
  if (!XLSX) {
    writeLog('Loading xlsx-js-style...');
    XLSX = require('xlsx-js-style');
    writeLog('xlsx-js-style loaded successfully');
  }
  return XLSX;
}

ipcMain.handle('app:getPath', () => {
  return app.getPath('userData');
});

ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

const bundledDataDir = app.isPackaged
  ? path.join(process.resourcesPath, '..', 'data')
  : path.join(__dirname, '..', 'data');
const dataDir = app.isPackaged
  ? path.join(app.getPath('userData'), 'data')
  : bundledDataDir;
const kodeAnggaranPath = path.join(dataDir, 'kode-anggaran.json');
const subSeksiPath = path.join(dataDir, 'batang-tubuh.json');
const batangTubuhPath = path.join(dataDir, 'batang-tubuh-flat.json');
const subSeksiDbPath = path.join(dataDir, 'sub-seksi-db.json');
const subSeksiDbFlatPath = path.join(dataDir, 'sub-seksi-db-flat.json');
const templateDataDir = app.isPackaged ? bundledDataDir : path.join(__dirname, '..', 'data');
const templateWorkbookPath = path.join(templateDataDir, 'APLIKASI KEUANGAN TAHUN 2025 FINAL.xlsx');
const mappingWorkbookPath = path.join(templateDataDir, 'MAPPING.xlsx');
const subSeksiExportDbPath = path.join(templateDataDir, 'sub-seksi-export-db.json');
const logoImagePath = app.isPackaged
  ? path.join(__dirname, '..', 'frontend', 'dist', 'church-logo-256.png')
  : path.join(__dirname, '..', 'frontend', 'public', 'church-logo-256.png');

function ensureWritableDataFiles() {
  if (!app.isPackaged) return;

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    for (const fileName of ['kode-anggaran.json', 'batang-tubuh.json', 'batang-tubuh-flat.json', 'sub-seksi-db.json', 'sub-seksi-db-flat.json']) {
      const targetPath = path.join(dataDir, fileName);
      const seedPath = path.join(bundledDataDir, fileName);
      if (!fs.existsSync(targetPath) && fs.existsSync(seedPath)) {
        fs.copyFileSync(seedPath, targetPath);
      }
    }
    writeLog('Data directory ready: ' + dataDir);
  } catch (e) {
    writeLog('Failed to prepare data directory: ' + e.stack);
  }
}

ensureWritableDataFiles();

function loadJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`loadJsonFile failed for ${filePath}:`, e);
    return [];
  }
}

function saveJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (e) {
    console.error(`saveJsonFile failed for ${filePath}:`, e);
    return { success: false };
  }
}

function ensureProjectExtension(filePath) {
  return path.extname(filePath).toLowerCase() === '.gpm' ? filePath : `${filePath}.gpm`;
}

function sanitizeBackupReason(reason) {
  return String(reason || 'backup')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'backup';
}

function createAutoBackupFile(data, reason) {
  const backupsDir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `auto-${timestamp}-${sanitizeBackupReason(reason)}.gpm`;
  const filePath = path.join(backupsDir, fileName);
  fs.writeFileSync(filePath, data, 'utf-8');
  writeLog('[BACKUP] auto backup created: ' + filePath);
  return filePath;
}

ipcMain.handle('backup:createAuto', async (_event, data, reason) => {
  try {
    if (!data || typeof data !== 'string') {
      return { success: false, error: 'Data backup kosong.' };
    }

    const filePath = createAutoBackupFile(data, reason);
    return { success: true, path: filePath };
  } catch (e) {
    writeLog('backup:createAuto failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('kodeAnggaran:load', async () => {
  return loadJsonFile(kodeAnggaranPath);
});

ipcMain.handle('kodeAnggaran:save', async (_event, items) => {
  return saveJsonFile(kodeAnggaranPath, items);
});

// --- Sub Seksi Database ---

ipcMain.handle('subSeksi:load', async () => {
  return loadJsonFile(subSeksiPath);
});

ipcMain.handle('subSeksi:save', async (_event, items) => {
  return saveJsonFile(subSeksiPath, items);
});

// --- Batang Tubuh Database ---

ipcMain.handle('batangTubuh:load', async () => {
  return loadJsonFile(batangTubuhPath);
});

ipcMain.handle('batangTubuh:save', async (_event, items) => {
  return saveJsonFile(batangTubuhPath, items);
});

// --- Sub Seksi Database (complete hierarchy from Excel SUB SEKSI sheets) ---

ipcMain.handle('subSeksiDb:load', async () => {
  return loadJsonFile(subSeksiDbPath);
});

ipcMain.handle('subSeksiDbFlat:load', async () => {
  return loadJsonFile(subSeksiDbFlatPath);
});

// --- Load Sub Seksi from JSON ---
ipcMain.handle('excel:loadSubSeksi', async () => {
  return loadJsonFile(subSeksiPath);
});

// --- Load Kode Anggaran from Excel DATA BASE2 ---
ipcMain.handle('excel:loadDataKodeAnggaran', async () => {
  try {
    loadXLSX();
    const filePath = templateWorkbookPath;
    if (!fs.existsSync(filePath)) return [];
    const workbook = XLSX.readFile(filePath);
    const dbSheet = workbook.Sheets['DATA BASE2'];
    if (!dbSheet) return [];
    const dbRows = XLSX.utils.sheet_to_json(dbSheet, { defval: '' });
    const out = [];
    for (const r of dbRows) {
      const kode = String(r['KODE ANGGARAN'] ?? '').trim();
      const nama = String(r['MATA ANGGARAN'] ?? '').trim();
      if (kode) out.push({ kodeAnggaran: kode, mataAnggaran: nama });
    }
    return out;
  } catch (e) {
    console.error('excel:loadDataKodeAnggaran failed:', e);
    return [];
  }
});

// --- Export Batang Tubuh to Excel ---
ipcMain.handle('batangTubuh:export', async (_event, config) => {
  try {
    const { BatangTubuhExportService } = require('./services/batang-tubuh-export');
    const exporter = new BatangTubuhExportService({
      templatePath: mappingWorkbookPath,
      logoPath: logoImagePath,
    });

    // Load hierarchical data
    const hierarchicalData = loadJsonFile(path.join(dataDir, 'batang-tubuh.json'));
    if (!Array.isArray(hierarchicalData) || hierarchicalData.length === 0) {
      return { success: false, error: 'Data batang tubuh tidak ditemukan' };
    }

    const buffer = await exporter.export(hierarchicalData, config);

    // Save dialog
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
      title: 'Export Batang Tubuh',
      defaultPath: `Batang_Tubuh_${config.tahun || new Date().getFullYear()}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error('batangTubuh:export error:', e);
    return { success: false, error: e.message };
  }
});

// --- Export Sub Seksi to Excel using the MAPPING.xlsx SUB SEKSI template ---
ipcMain.handle('subSeksi:exportExcel', async (_event, config = {}) => {
  try {
    const { SubSeksiExportService } = require('./services/sub-seksi-export');
    const tahun = Number(config.tahun) || new Date().getFullYear();
    const exporter = new SubSeksiExportService({
      templatePath: mappingWorkbookPath,
      databasePath: subSeksiExportDbPath,
    });
    const buffer = await exporter.export({
      ...config,
      tahun,
    });

    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || mainWindow, {
      title: 'Export Realisasi Sub Seksi',
      defaultPath: `Realisasi_Sub_Seksi_${tahun}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error('subSeksi:exportExcel failed:', e);
    return { success: false, error: e.message };
  }
});

// --- Export full workbook matching the reference Excel layout ---
ipcMain.handle('workbook:exportFull', async (_event, config = {}) => {
  try {
    const { FullWorkbookExportService } = require('./services/full-workbook-export');
    const exporter = new FullWorkbookExportService({
      templatePaths: [
        path.join(process.env.USERPROFILE || '', 'APLIKASI KEUANGAN TAHUN 2025 FINAL.xlsx'),
      ],
    });

    const payload = {
      ...config,
      kodeAnggarans: config.kodeAnggarans || loadJsonFile(kodeAnggaranPath).map((item) => ({
        kodeAnggaran: item.kodeAnggaran || item.kode,
        mataAnggaran: item.mataAnggaran || item.nama,
      })),
      subSeksis: config.subSeksis || loadJsonFile(subSeksiPath),
      batangTubuhs: config.batangTubuhs || loadJsonFile(subSeksiPath),
    };

    const buffer = await exporter.export(payload);
    const defaultName = `APLIKASI KEUANGAN ${String(config.namaJemaat || 'GEREJA').replace(/\s+/g, '_')}_${config.tahun || new Date().getFullYear()}.xlsx`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Data Keuangan ke Excel',
      defaultPath: defaultName,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });

    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error('workbook:exportFull failed:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('project:save', async (_event, data, defaultName, asNew) => {
  writeLog('[IPC] project:save called, asNew=' + !!asNew + ', path=' + (projectFilePath || ''));
  try {
    const filePath = (!asNew && projectFilePath) ? projectFilePath : null;
    if (filePath) {
      fs.writeFileSync(filePath, data, 'utf-8');
      writeLog('[IPC] project saved: ' + filePath);
      return { success: true, path: filePath };
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan Project',
      defaultPath: defaultName,
      filters: [{ name: 'Project Keuangan Gereja', extensions: ['gpm'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };
    projectFilePath = ensureProjectExtension(result.filePath);
    fs.writeFileSync(projectFilePath, data, 'utf-8');
    writeLog('[IPC] project saved: ' + projectFilePath);
    return { success: true, path: projectFilePath };
  } catch (e) {
    writeLog('project:save failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message };
  }
});

ipcMain.handle('project:open', async () => {
  console.log('[IPC] project:open called');
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Buka Project',
      properties: ['openFile'],
      filters: [{ name: 'Project Keuangan Gereja', extensions: ['gpm'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false };
    projectFilePath = result.filePaths[0];
    const data = fs.readFileSync(projectFilePath, 'utf-8');
    return { success: true, data, path: projectFilePath };
  } catch (e) {
    console.error('project:open failed:', e);
    return { success: false };
  }
});

ipcMain.handle('project:new', async () => {
  projectFilePath = null;
  writeLog('[IPC] project:new called, project path cleared');
  return { success: true };
});

// --- Export Doorscrieft to Excel (all lembar, separated per lembar with styling) ---
ipcMain.handle('excel:exportDoorscrieft', async (_event, data) => {
  try {
    const { DoorscrieftExportService } = require('./services/doorscrieft-export');
    const exporter = new DoorscrieftExportService({ templatePath: mappingWorkbookPath });
    const buffer = await exporter.export(data || {});
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Doorscrieft ke Excel',
      defaultPath: data?.fileName || `Doorscrieft_${new Date().toISOString().slice(0, 10)}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });
    if (saveResult.canceled || !saveResult.filePath) return { success: false, canceled: true };
    fs.writeFileSync(saveResult.filePath, buffer);
    return { success: true, path: saveResult.filePath };

    loadXLSX();
    const { lembars, monthName, fileName } = data;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Doorscrieft ke Excel',
      defaultPath: fileName || 'Doorscrieft.xlsx',
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };

    if (!lembars || lembars.length === 0) return { success: false, error: 'Tidak ada data untuk di-export' };

    const colHeader = monthName.toUpperCase();
    const wb = XLSX.utils.book_new();

    // Styles
    const borderThin = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    const headerFill = { patternType: 'solid', fgColor: { rgb: '1F3864' } };
    const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Calibri' };
    const headerStyle = { font: headerFont, fill: headerFill, alignment: { horizontal: 'center', vertical: 'center' }, border: borderThin };
    const dataCenterAlign = { horizontal: 'center', vertical: 'center' };
    const dataLeftAlign = { horizontal: 'left', vertical: 'center' };
    const numFmt = '#,##0';

    const lembarHeaderFill = { patternType: 'solid', fgColor: { rgb: 'D9E2F3' } };
    const lembarHeaderFont = { bold: true, color: { rgb: '1F3864' }, sz: 12, name: 'Calibri' };

    const summaryFontGreen = { bold: true, sz: 11, name: 'Calibri', color: { rgb: '007832' } };
    const summaryFontRed = { bold: true, sz: 11, name: 'Calibri', color: { rgb: 'C00000' } };
    const summaryFontPlain = { bold: true, sz: 11, name: 'Calibri' };
    const summaryBorderThin = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    // Build aoa: plain values
    const aoa = [];
    const merges = [];
    // Track info for formula/styling pass
    const lembarInfo = [];

    // Row 0: column headers
    aoa.push(['NO', colHeader, 'URAIAN', 'KODE ANGGARAN', 'PENERIMAAN', 'PENGELUARAN']);

    let rowCursor = 1;

    lembars.forEach((lb, li) => {
      const dateLabel = new Date(lb.dateKey).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

      const info = {
        lembarHeaderRow: rowCursor,
        dataRowStart: rowCursor + 1,
        dataRowCount: lb.rows.length,
      };

      // Lembar header row
      aoa.push([`LEMBAR ${li + 1} — ${dateLabel}`]);
      merges.push({ s: { r: rowCursor, c: 0 }, e: { r: rowCursor, c: 5 } });
      rowCursor++;

      // Data rows
      lb.rows.forEach((r) => {
        aoa.push([r.no, r.tanggal, r.uraian, r.kodeAnggaran, r.penerimaan || 0, r.pengeluaran || 0]);
        rowCursor++;
      });

      info.dataRowEnd = rowCursor;

      // Summary rows
      // colSpan A-D for label, colSpan E-F for SISA value (matching sidebar layout)
      aoa.push(['JUMLAH TANGGAL HARI INI', '', '', '', '', '']);
      merges.push({ s: { r: rowCursor, c: 0 }, e: { r: rowCursor, c: 3 } });
      info.harianRow = rowCursor;
      rowCursor++;

      aoa.push(['JUMLAH S/D TANGGAL', '', '', '', '', '']);
      merges.push({ s: { r: rowCursor, c: 0 }, e: { r: rowCursor, c: 3 } });
      info.sDRow = rowCursor;
      rowCursor++;

      aoa.push(['TOTAL', '', '', '', '', '']);
      merges.push({ s: { r: rowCursor, c: 0 }, e: { r: rowCursor, c: 3 } });
      info.totalRow = rowCursor;
      rowCursor++;

      // SISA row (last lembar only)
      if (li === lembars.length - 1) {
        aoa.push(['SISA', '', '', '', '', '']);
        merges.push({ s: { r: rowCursor, c: 0 }, e: { r: rowCursor, c: 3 } }); // label colSpan A-D
        merges.push({ s: { r: rowCursor, c: 4 }, e: { r: rowCursor, c: 5 } }); // value colSpan E-F
        info.sisaRow = rowCursor;
        rowCursor++;
      }

      // Spacer
      if (li < lembars.length - 1) {
        aoa.push(['', '', '', '', '', '']);
        rowCursor++;
      }

      lembarInfo.push(info);
    });

    // Create sheet
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Apply formulas and styles
    const firstDataRow = 1; // 0-indexed, Excel row 2 (after header row 0 + 1)

    // Style header row
    for (let c = 0; c < 6; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = headerStyle;
    }

    lembarInfo.forEach((info, li) => {
      const lb = lembars[li];
      const isLast = (li === lembars.length - 1);

      // Style lembar header
      for (let c = 0; c < 6; c++) {
        const ref = XLSX.utils.encode_cell({ r: info.lembarHeaderRow, c });
        if (!ws[ref]) ws[ref] = { v: '', t: 's' };
        ws[ref].s = {
          font: lembarHeaderFont,
          fill: lembarHeaderFill,
          alignment: { horizontal: 'left', vertical: 'center' },
          border: { top: { style: 'medium' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } },
        };
      }

      // Style data rows
      for (let dr = info.dataRowStart; dr <= info.dataRowEnd; dr++) {
        for (let c = 0; c < 6; c++) {
          const ref = XLSX.utils.encode_cell({ r: dr, c });
          if (!ws[ref]) continue;
          const isNum = (c === 4 || c === 5);
          ws[ref].s = {
            border: { left: { style: 'thin' }, right: { style: 'thin' }, top: {}, bottom: {} },
            alignment: isNum ? { horizontal: 'right', vertical: 'center' } : (c === 2 ? dataLeftAlign : dataCenterAlign),
            numFmt: isNum ? numFmt : undefined,
          };
        }
      }

      // JUMLAH HARI INI: formula SUM of this lembar's data rows
      const harianBrd = summaryBorderThin;
      const harianE = `E${info.harianRow + 1}`;
      const harianF = `F${info.harianRow + 1}`;
      ws[harianE] = {
        t: 'n', v: lb.harianP || 0,
        f: `SUM(E${info.dataRowStart + 1}:E${info.dataRowEnd + 1})`,
        s: { border: harianBrd, numFmt, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontGreen },
      };
      ws[harianF] = {
        t: 'n', v: lb.harianQ || 0,
        f: `SUM(F${info.dataRowStart + 1}:F${info.dataRowEnd + 1})`,
        s: { border: harianBrd, numFmt, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontRed },
      };
      ws[`A${info.harianRow + 1}`].s = { border: harianBrd, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontPlain };
      for (const c of ['B', 'C', 'D']) {
        const ref = `${c}${info.harianRow + 1}`;
        if (ws[ref]) ws[ref].s = { border: harianBrd };
      }

      // JUMLAH S/D TANGGAL: reference to previous lembar's TOTAL (NOT a SUM!)
      // For first lembar, reference E2 (row 1 in data — opening balance if any, or first data)
      // For subsequent lembars, reference E{previous total row}
      const sDBrd = summaryBorderThin;
      const sDE = `E${info.sDRow + 1}`;
      const sDF = `F${info.sDRow + 1}`;
      const prevLembar = lembarInfo[li - 1];
      if (prevLembar) {
        // Reference previous lembar's TOTAL cell
        ws[sDE] = { t: 'n', v: lb.sDP || 0, f: `E${prevLembar.totalRow + 1}`, s: { border: sDBrd, numFmt, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontGreen } };
        ws[sDF] = { t: 'n', v: lb.sDQ || 0, f: `F${prevLembar.totalRow + 1}`, s: { border: sDBrd, numFmt, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontRed } };
      } else {
        // First lembar: reference row 2 (opening balance row, or just E2/F2)
        ws[sDE] = { t: 'n', v: lb.sDP || 0, f: `E2`, s: { border: sDBrd, numFmt, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontGreen } };
        ws[sDF] = { t: 'n', v: lb.sDQ || 0, f: `F2`, s: { border: sDBrd, numFmt, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontRed } };
      }
      ws[`A${info.sDRow + 1}`].s = { border: sDBrd, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontPlain };
      for (const c of ['B', 'C', 'D']) {
        const ref = `${c}${info.sDRow + 1}`;
        if (ws[ref]) ws[ref].s = { border: sDBrd };
      }

      // TOTAL: JUMLAH S/D + JUMLAH HARI INI
      const totalBrd = isLast ? { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } } : summaryBorderThin;
      const totalE = `E${info.totalRow + 1}`;
      const totalF = `F${info.totalRow + 1}`;
      ws[totalE] = {
        t: 'n', v: lb.totalP || 0,
        f: `E${info.sDRow + 1}+E${info.harianRow + 1}`,
        s: { border: totalBrd, numFmt, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontGreen },
      };
      ws[totalF] = {
        t: 'n', v: lb.totalQ || 0,
        f: `F${info.sDRow + 1}+F${info.harianRow + 1}`,
        s: { border: totalBrd, numFmt, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontRed },
      };
      ws[`A${info.totalRow + 1}`].s = { border: totalBrd, alignment: { horizontal: 'right', vertical: 'center' }, font: summaryFontPlain };
      for (const c of ['B', 'C', 'D']) {
        const ref = `${c}${info.totalRow + 1}`;
        if (ws[ref]) ws[ref].s = { border: totalBrd };
      }

      // SISA row (last lembar)
      if (info.sisaRow !== undefined) {
        const sisaVal = lb.sisa || 0;
        const sisaColor = sisaVal >= 0 ? { rgb: '0000FF' } : { rgb: 'C00000' };
        const sisaFont = { bold: true, sz: 12, name: 'Calibri', color: sisaColor };
        const sisaBorder = { top: { style: 'medium' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
        const sisaRowExcel = info.sisaRow + 1;

        ws[`A${sisaRowExcel}`].s = { border: sisaBorder, alignment: { horizontal: 'right', vertical: 'center' }, font: { bold: true, sz: 12, name: 'Calibri' } };
        for (const c of ['B', 'C', 'D']) {
          const ref = `${c}${sisaRowExcel}`;
          if (ws[ref]) ws[ref].s = { border: sisaBorder };
        }
        ws[`E${sisaRowExcel}`] = {
          t: 'n', v: sisaVal,
          f: `E${info.totalRow + 1}-F${info.totalRow + 1}`,
          s: { border: sisaBorder, numFmt, alignment: { horizontal: 'right', vertical: 'center' }, font: sisaFont },
        };
        for (const c of ['F']) {
          const ref = `${c}${sisaRowExcel}`;
          if (ws[ref]) ws[ref].s = { border: sisaBorder };
        }
      }
    });

    // Column widths
    ws['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 60 },
      { wch: 20 },
      { wch: 22 },
      { wch: 22 },
    ];

    ws['!rows'] = [{ hpx: 25 }];
    ws['!merges'] = merges;

    XLSX.utils.book_append_sheet(wb, ws, 'DOORSCRIEFT2');
    XLSX.writeFile(wb, result.filePath);

    return { success: true, path: result.filePath };
  } catch (e) {
    console.error('excel:exportDoorscrieft failed:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('excel:importDoorscrieft', async (_event, options = {}) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Doorscrieft dari Excel',
      properties: ['openFile'],
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const { DoorscrieftImportService } = require('./services/doorscrieft-import');
    const importer = new DoorscrieftImportService();
    const data = await importer.import(result.filePaths[0], options);
    return { success: true, path: result.filePaths[0], ...data };
  } catch (e) {
    console.error('excel:importDoorscrieft failed:', e);
    return { success: false, error: e.message };
  }
});
