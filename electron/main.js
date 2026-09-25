const { app, BrowserWindow, ipcMain, dialog, Menu, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

const appRoot = path.join(__dirname, '..');
const APP_NAME = 'Keuangan Gereja';
const APP_USER_MODEL_ID = 'com.gereja.keuangan';

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

if (isDev) {
  try {
    // Use a unique dev userData folder per run to avoid locked/cache permission issues
    const devUserData = path.join(appRoot, `.electron-user-data-dev-${Date.now()}`);
    app.setPath('userData', devUserData);
    console.log('Using dev userData path: ' + devUserData);
  } catch (err) {
    console.log('Unable to override app userData path: ' + err.message);
  }
}
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
const userDataPath = app.getPath('userData');
const diskCacheDir = path.join(userDataPath, 'Cache');
const mediaCacheDir = path.join(userDataPath, 'MediaCache');
app.commandLine.appendSwitch('disk-cache-dir', diskCacheDir);
app.commandLine.appendSwitch('media-cache-dir', mediaCacheDir);
console.log('Electron cache paths:');
console.log('  userData   = ' + userDataPath);
console.log('  diskCache  = ' + diskCacheDir);
console.log('  mediaCache = ' + mediaCacheDir);

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
let splashWindow;
let projectFilePath = null;
let allowWindowClose = false;
let pendingProjectToOpen = null;
let splashStartedAt = 0;
const SPLASH_MIN_MS = 5000;

function resolveAppIconPath(extension = 'ico') {
  const iconCandidates = [
    path.join(appRoot, 'dist', '.icon-ico', `icon.${extension}`),
    path.join(app.getAppPath(), 'dist', '.icon-ico', `icon.${extension}`),
    app.isPackaged ? path.join(process.resourcesPath, '..', 'dist', '.icon-ico', `icon.${extension}`) : '',
    path.join(appRoot, 'frontend', 'public', `app-icon.${extension}`),
  ].filter(Boolean);

  return iconCandidates.find((candidate) => fs.existsSync(candidate));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildPrintPreviewHtml(options = {}) {
  const title = String(options.title || 'Preview Cetak');
  const reportHtml = String(options.html || '<p>Preview cetak belum tersedia.</p>');
  const appStyles = String(options.styles || '').replace(/<\/style/gi, '<\\/style');
  const initial = {
    title,
    paper: options.paper || 'F4',
    orientation: options.orientation || 'landscape',
    marginMm: Number(options.marginMm) || 10,
    customWidthMm: Number(options.customWidthMm) || 210,
    customHeightMm: Number(options.customHeightMm) || 330,
  };
  const initialJson = JSON.stringify(initial).replace(/</g, '\\u003c');
  const baseHref = isDev
    ? 'http://localhost:5173/'
    : pathToFileURL(path.join(app.getAppPath(), 'frontend', 'dist') + path.sep).href;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${baseHref}">
  <title>${escapeHtml(title)}</title>
  <style>
    ${appStyles}
    :root { color-scheme: light; font-family: Inter, system-ui, Segoe UI, Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #0f172a; color: #0f172a; overflow: hidden; }
    button, select, input { font: inherit; }
    .toolbar { height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: #fff; border-bottom: 1px solid #cbd5e1; }
    .title { min-width: 240px; }
    .title h1 { margin: 0; font-size: 17px; line-height: 1.2; }
    .title p { margin: 3px 0 0; font-size: 12px; color: #64748b; }
    .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .field { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #475569; }
    .field input, .field select { height: 34px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 8px; background: #fff; min-width: 82px; }
    .field input[type="number"] { width: 82px; }
    .button { height: 34px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 12px; background: #fff; color: #0f172a; cursor: pointer; }
    .button.primary { border-color: #2563eb; background: #2563eb; color: #fff; }
    .button:hover { filter: brightness(0.97); }
    .shell { height: calc(100vh - 64px); display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 0; }
    .side { overflow: auto; background: #f8fafc; border-right: 1px solid #cbd5e1; padding: 14px; }
    .side h2 { margin: 0 0 12px; font-size: 13px; color: #334155; text-transform: uppercase; letter-spacing: .04em; }
    .side .stack { display: grid; gap: 12px; }
    .side label { display: grid; gap: 5px; font-size: 12px; color: #475569; }
    .side select, .side input { width: 100%; height: 36px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 8px; background: #fff; }
    .checkrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: #334155; }
    .checkrow input { width: 16px; height: 16px; }
    .preview { overflow: auto; padding: 18px; background: #cbd5e1; }
    .source { position: fixed; left: -10000px; top: 0; visibility: hidden; pointer-events: none; background: #fff; color: #0f172a; }
    .page-list { display: grid; justify-content: center; gap: 22px; }
    .page-shell { margin: 0 auto; }
    .page-label { margin: 0 0 6px; color: #334155; font-size: 12px; font-weight: 700; text-align: center; }
    .page { background: #fff; box-shadow: 0 18px 45px rgba(15, 23, 42, .35); transform-origin: top left; color: #0f172a; overflow: hidden; }
    .page-viewport { overflow: hidden; width: 100%; }
    .page-content { width: 100%; }
    .print-only { display: block !important; }
    .print-target { width: 100% !important; max-width: 100% !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: #fff !important; color: #0f172a !important; overflow: visible !important; }
    .print-hidden { display: none !important; }
    .print-report-content { width: 100%; overflow: visible; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 6px; vertical-align: top; line-height: 1.25; }
    th { background: #f1f5f9; font-weight: 700; text-align: left; }
    header { border-bottom: 2px solid #0f172a; }
    img { max-width: 100%; }
    .compact table { font-size: 9.5px; }
    .compact th, .compact td { padding: 3px 4px; line-height: 1.15; }
    .hide-signatures .print-signature { display: none !important; }
    .overflow-x-auto, .overflow-auto { overflow: visible !important; }
    @media print {
      body { background: #fff; overflow: visible; }
      .toolbar, .side { display: none !important; }
      .shell { display: block; height: auto; }
      .preview { overflow: visible; padding: 0; background: #fff; }
      .source, .page-label { display: none !important; }
      .page-list { display: block; }
      .page-shell { width: auto !important; min-height: auto !important; margin: 0 !important; page-break-after: always; break-after: page; }
      .page { transform: none !important; box-shadow: none; width: var(--page-width) !important; height: var(--page-height) !important; min-height: var(--page-height) !important; padding: var(--page-padding) !important; }
      .page-viewport { height: var(--printable-height) !important; overflow: hidden !important; }
      @page { size: var(--page-size); margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="title">
      <h1>Preview Cetak</h1>
      <p id="summary">Menyiapkan preview...</p>
    </div>
    <div class="controls">
      <button class="button" id="fitPage">Fit Halaman</button>
      <button class="button" id="fitWidth">Fit Lebar</button>
      <button class="button" id="zoomOut">-</button>
      <span id="zoomText" style="font-size:12px;color:#475569;width:44px;text-align:center;">100%</span>
      <button class="button" id="zoomIn">+</button>
      <button class="button primary" id="print">Cetak</button>
      <button class="button" id="close">Tutup</button>
    </div>
  </div>
  <div class="shell">
    <aside class="side">
      <h2>Pengaturan Preview</h2>
      <div class="stack">
        <label>Ukuran Kertas
          <select id="paper">
            <option value="F4">F4 210 x 330 mm</option>
            <option value="A4">A4 210 x 297 mm</option>
            <option value="Legal">Legal 216 x 356 mm</option>
            <option value="Letter">Letter 216 x 279 mm</option>
            <option value="custom">Custom - ditentukan pengguna</option>
          </select>
        </label>
        <div id="customFields" style="display:none;grid-template-columns:1fr 1fr;gap:8px;">
          <label>Lebar<input id="customWidth" type="number" min="50" max="500"></label>
          <label>Tinggi<input id="customHeight" type="number" min="50" max="600"></label>
        </div>
        <label>Orientasi
          <select id="orientation">
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label>Margin
          <input id="margin" type="range" min="5" max="25">
          <span id="marginText">10mm</span>
        </label>
        <div class="checkrow"><span>Tabel padat</span><input id="compact" type="checkbox"></div>
        <div class="checkrow"><span>Tanda tangan</span><input id="signatures" type="checkbox" checked></div>
      </div>
    </aside>
    <main class="preview" id="preview">
      <div class="source" id="source">${reportHtml}</div>
      <div class="page-list" id="pageList"></div>
    </main>
  </div>
  <script>
    const init = ${initialJson};
    const MM_TO_PX = 96 / 25.4;
    const sizes = {
      F4: { width: 210, height: 330 },
      A4: { width: 210, height: 297 },
      Legal: { width: 216, height: 356 },
      Letter: { width: 216, height: 279 },
    };
    let mode = 'page';
    let zoom = 1;
    const el = (id) => document.getElementById(id);
    const source = el('source');
    const pageList = el('pageList');
    const preview = el('preview');
    const paper = el('paper');
    const orientation = el('orientation');
    const margin = el('margin');
    const customFields = el('customFields');
    const customWidth = el('customWidth');
    const customHeight = el('customHeight');

    function paperMm() {
      const base = paper.value === 'custom'
        ? { width: Math.max(50, Number(customWidth.value) || 210), height: Math.max(50, Number(customHeight.value) || 330) }
        : sizes[paper.value] || sizes.F4;
      return orientation.value === 'landscape'
        ? { width: base.height, height: base.width }
        : base;
    }

    function measurePage() {
      const mm = paperMm();
      return {
        width: Math.round(mm.width * MM_TO_PX),
        height: Math.round(mm.height * MM_TO_PX),
        widthMm: mm.width,
        heightMm: mm.height,
      };
    }

    function fitScale() {
      const p = measurePage();
      const marginPx = Number(margin.value) * MM_TO_PX;
      const printableWidth = Math.max(80, p.width - marginPx * 2);
      const printableHeight = Math.max(80, p.height - marginPx * 2);
      source.style.width = printableWidth + 'px';
      source.classList.toggle('compact', el('compact').checked);
      source.classList.toggle('hide-signatures', !el('signatures').checked);
      const contentWidth = p.width;
      const contentHeight = p.height;
      const availableWidth = Math.max(280, preview.clientWidth - 36);
      const availableHeight = Math.max(260, preview.clientHeight - 36);
      if (mode === 'width') return Math.min(1.4, Math.max(0.08, availableWidth / contentWidth));
      if (mode === 'page') return Math.min(1.4, Math.max(0.08, Math.min(availableWidth / contentWidth, availableHeight / contentHeight)));
      return zoom;
    }

    function render() {
      const p = measurePage();
      const marginPx = Number(margin.value) * MM_TO_PX;
      const printableWidth = Math.max(80, p.width - marginPx * 2);
      const printableHeight = Math.max(80, p.height - marginPx * 2);
      const scale = fitScale();
      source.style.width = printableWidth + 'px';
      source.classList.toggle('compact', el('compact').checked);
      source.classList.toggle('hide-signatures', !el('signatures').checked);
      const pageCount = Math.max(1, Math.ceil(Math.max(source.scrollHeight, 1) / printableHeight));
      pageList.innerHTML = '';
      for (let index = 0; index < pageCount; index += 1) {
        const shell = document.createElement('section');
        shell.className = 'page-shell';
        shell.style.width = (p.width * scale) + 'px';
        shell.style.minHeight = (p.height * scale + 26) + 'px';

        const label = document.createElement('p');
        label.className = 'page-label';
        label.textContent = 'Halaman ' + (index + 1) + ' dari ' + pageCount;

        const page = document.createElement('div');
        page.className = 'page' + (el('compact').checked ? ' compact' : '') + (!el('signatures').checked ? ' hide-signatures' : '');
        page.style.width = p.width + 'px';
        page.style.height = p.height + 'px';
        page.style.minHeight = p.height + 'px';
        page.style.padding = Math.round(marginPx) + 'px';
        page.style.transform = 'scale(' + scale + ')';

        const viewport = document.createElement('div');
        viewport.className = 'page-viewport';
        viewport.style.height = printableHeight + 'px';
        viewport.style.width = printableWidth + 'px';

        const content = document.createElement('div');
        content.className = 'page-content';
        content.style.width = printableWidth + 'px';
        content.style.transform = 'translateY(-' + Math.round(index * printableHeight) + 'px)';
        content.innerHTML = source.innerHTML;

        viewport.appendChild(content);
        page.appendChild(viewport);
        shell.appendChild(label);
        shell.appendChild(page);
        pageList.appendChild(shell);
      }
      customFields.style.display = paper.value === 'custom' ? 'grid' : 'none';
      el('zoomText').textContent = Math.round(scale * 100) + '%';
      el('marginText').textContent = margin.value + 'mm';
      el('summary').textContent = (paper.value === 'custom' ? 'Custom' : paper.value) + ' ' + orientation.value + ' - ' + p.widthMm + ' x ' + p.heightMm + ' mm - ' + pageCount + ' halaman';
      document.documentElement.style.setProperty('--page-size', p.widthMm + 'mm ' + p.heightMm + 'mm');
      document.documentElement.style.setProperty('--page-width', p.width + 'px');
      document.documentElement.style.setProperty('--page-height', p.height + 'px');
      document.documentElement.style.setProperty('--page-padding', Math.round(marginPx) + 'px');
      document.documentElement.style.setProperty('--printable-height', printableHeight + 'px');
    }

    paper.value = init.paper || 'F4';
    orientation.value = init.orientation || 'landscape';
    margin.value = init.marginMm || 10;
    customWidth.value = init.customWidthMm || 210;
    customHeight.value = init.customHeightMm || 330;
    ['change', 'input'].forEach((eventName) => {
      [paper, orientation, margin, customWidth, customHeight, el('compact'), el('signatures')].forEach((node) => node.addEventListener(eventName, render));
    });
    [customWidth, customHeight].forEach((node) => {
      node.addEventListener('blur', () => {
        if (!node.value) node.value = node === customWidth ? 210 : 330;
        render();
      });
    });
    el('fitPage').onclick = () => { mode = 'page'; render(); };
    el('fitWidth').onclick = () => { mode = 'width'; render(); };
    el('zoomOut').onclick = () => { mode = 'custom'; zoom = Math.max(0.25, fitScale() - 0.1); render(); };
    el('zoomIn').onclick = () => { mode = 'custom'; zoom = Math.min(1.6, fitScale() + 0.1); render(); };
    el('close').onclick = () => window.close();
    el('print').onclick = () => { render(); window.print(); };
    window.addEventListener('resize', render);
    requestAnimationFrame(render);
    setTimeout(render, 120);
  </script>
</body>
</html>`;
}

function findProjectArg(argv) {
  return (argv || []).find((arg) => typeof arg === 'string' && path.extname(arg).toLowerCase() === '.gpm');
}

function readProjectFile(filePath) {
  if (!filePath || path.extname(filePath).toLowerCase() !== '.gpm') {
    return { success: false, error: 'File project tidak valid.' };
  }
  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File project tidak ditemukan.' };
  }
  projectFilePath = filePath;
  return { success: true, data: fs.readFileSync(filePath, 'utf-8'), path: filePath };
}

function sendProjectToRenderer(filePath) {
  const result = readProjectFile(filePath);
  if (!result.success) {
    writeLog('[PROJECT] failed to open external project: ' + result.error);
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('project:openedFromFile', result);
  } else {
    pendingProjectToOpen = result;
  }
}

const initialProjectArg = findProjectArg(process.argv);
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const projectArg = findProjectArg(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (projectArg) sendProjectToRenderer(projectArg);
  });
}

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
        {
          label: 'Backup Project...',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:action', 'backup-project');
          },
        },
        { type: 'separator' },
        {
          label: 'Cetak Laporan',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('menu:action', 'print-report');
          },
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
        ...(isDev ? [
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
        ] : []),
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
        {
          label: 'Cek Informasi Versi',
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

function createSplashWindow() {
  splashStartedAt = Date.now();
  const splashWindowIconPath = resolveAppIconPath('ico');
  const distSplashLogoCandidates = [
    path.join(appRoot, 'dist', '.icon-ico', 'icon.png'),
    path.join(app.getAppPath(), 'dist', '.icon-ico', 'icon.png'),
    app.isPackaged ? path.join(process.resourcesPath, '..', 'dist', '.icon-ico', 'icon.png') : '',
  ].filter(Boolean);
  const distSplashLogoPath = distSplashLogoCandidates.find((p) => fs.existsSync(p));
  const preferredSplashLogoPath = distSplashLogoPath
    ? distSplashLogoPath
    : app.isPackaged
      ? path.join(__dirname, '..', 'frontend', 'dist', 'app-icon.png')
      : path.join(appRoot, 'frontend', 'public', 'app-icon.png');
  const fallbackSplashLogoPath = path.join(appRoot, 'frontend', 'public', 'church-logo-256.png');
  const splashLogoPath = fs.existsSync(preferredSplashLogoPath) ? preferredSplashLogoPath : fallbackSplashLogoPath;
  writeLog('Splash logo candidates: ' + distSplashLogoCandidates.join(' | '));
  writeLog('Splash selected path: ' + splashLogoPath);
  const logoUrl = fs.existsSync(splashLogoPath)
    ? `data:image/png;base64,${fs.readFileSync(splashLogoPath).toString('base64')}`
    : '';

  splashWindow = new BrowserWindow({
    width: 560,
    height: 460,
    frame: false,
    transparent: false,
    backgroundColor: '#eef2ff',
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    show: false,
    center: true,
    icon: splashWindowIconPath,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  splashWindow.setMenuBarVisibility(false);

  const showSplash = () => {
    if (splashWindow && !splashWindow.isDestroyed() && !splashWindow.isVisible()) {
      writeLog('Showing splash window');
      splashWindow.show();
      splashWindow.focus();
    }
  };

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; style-src 'unsafe-inline';" />
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }

    * { box-sizing: border-box; }

    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
    }

    body {
      display: grid;
      place-items: center;
    }

    .shell {
      position: relative;
      width: 452px;
      min-height: 348px;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.26);
      border-radius: 18px;
      background:
        linear-gradient(135deg, rgba(255,255,255,0.94), rgba(248,250,252,0.90)),
        radial-gradient(circle at 50% 0%, rgba(37,99,235,0.20), transparent 44%);
      box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
      animation: shellIn 620ms cubic-bezier(.2,.8,.2,1) both;
    }

    .shell::before {
      content: "";
      position: absolute;
      inset: -40%;
      background: conic-gradient(from 180deg, transparent 0deg, rgba(37,99,235,0.18) 55deg, transparent 125deg, rgba(14,165,233,0.12) 220deg, transparent 300deg);
      animation: aura 3600ms linear infinite;
      opacity: .9;
    }

    .content {
      position: relative;
      z-index: 1;
      display: flex;
      min-height: 348px;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 38px 34px 30px;
      text-align: center;
    }

    .logoWrap {
      position: relative;
      display: grid;
      width: 150px;
      height: 150px;
      place-items: center;
      border-radius: 42px;
      background: linear-gradient(135deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.96));
      border: 1px solid rgba(148, 163, 184, 0.18);
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.16);
      animation: logoFloat 2400ms ease-in-out infinite;
    }

    .logoWrap::before {
      content: "";
      position: absolute;
      inset: -10px;
      border-radius: 42px;
      border: 2px solid rgba(37, 99, 235, .26);
      animation: pulseRing 1800ms ease-out infinite;
    }

    .logo {
      width: 118px;
      height: 118px;
      object-fit: contain;
      border-radius: 28px;
      background: rgba(255, 255, 255, 0.98);
      border: 1px solid rgba(148, 163, 184, 0.24);
      filter: drop-shadow(0 12px 18px rgba(15, 23, 42, .18));
      animation: logoIn 860ms cubic-bezier(.2,.8,.2,1) both;
    }

    .title {
      margin: 24px 0 0;
      color: #0f172a;
      font-size: 24px;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: 0;
    }

    .subtitle {
      margin: 8px 0 0;
      color: #475569;
      font-size: 13px;
      font-weight: 500;
    }

    .progress {
      position: relative;
      width: 190px;
      height: 4px;
      margin-top: 28px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(148, 163, 184, .28);
    }

    .progress::after {
      content: "";
      position: absolute;
      inset: 0;
      width: 48%;
      border-radius: inherit;
      background: linear-gradient(90deg, #2563eb, #0ea5e9);
      animation: progress 1800ms cubic-bezier(.45,0,.2,1) infinite;
    }

    .status {
      margin-top: 14px;
      color: #64748b;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    @keyframes shellIn {
      from { opacity: 0; transform: translateY(12px) scale(.975); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes aura {
      to { transform: rotate(360deg); }
    }

    @keyframes logoIn {
      from { opacity: 0; transform: scale(.82) rotate(-4deg); }
      to { opacity: 1; transform: scale(1) rotate(0deg); }
    }

    @keyframes logoFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }

    @keyframes pulseRing {
      0% { opacity: .8; transform: scale(.94); }
      100% { opacity: 0; transform: scale(1.14); }
    }

    @keyframes progress {
      0% { transform: translateX(-120%); }
      55% { transform: translateX(90%); }
      100% { transform: translateX(220%); }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="content">
      <div class="logoWrap">
        ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="Logo" />` : '<div class="logo"></div>'}
      </div>
      <h1 class="title">Keuangan Gereja</h1>
      <p class="subtitle">Menyiapkan ruang kerja keuangan</p>
      <div class="progress" aria-hidden="true"></div>
      <p class="status">Memuat aplikasi</p>
    </section>
  </main>
</body>
</html>`;

  splashWindow.once('ready-to-show', () => {
    showSplash();
  });
  splashWindow.webContents.once('did-finish-load', () => {
    showSplash();
  });
  splashWindow.once('ready-to-show', () => {
    writeLog('Splash ready-to-show');
    showSplash();
  });
  splashWindow.on('show', () => writeLog('Splash shown'));
  splashWindow.on('hide', () => writeLog('Splash hidden'));
  splashWindow.webContents.on('did-finish-load', () => {
    writeLog('Splash did-finish-load');
    showSplash();
  });
  splashWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    writeLog('Splash failed load: ' + errorCode + ' ' + errorDescription + ' ' + validatedURL);
  });
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  writeLog('Splash loadURL requested');
  setTimeout(() => {
    writeLog('Splash timeout show');
    showSplash();
  }, 600);
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function revealMainWindowAfterSplash() {
  const elapsed = Date.now() - splashStartedAt;
  const delay = Math.max(0, SPLASH_MIN_MS - elapsed);

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }

    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  }, delay);
}

function createWindow() {
  writeLog('createWindow called, isDev=' + isDev);
  createApplicationMenu();
  const appRoot = path.join(__dirname, '..');
  const indexPath = isDev
    ? 'http://localhost:5173'
    : path.join(appRoot, 'frontend/dist/index.html');
  writeLog('Loading: ' + indexPath);

  const iconPath = resolveAppIconPath('ico');
  createSplashWindow();
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: iconPath,
    show: false,
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

  // Disable refresh shortcuts di aplikasi build
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
      event.preventDefault();
    }
    if (input.key === 'F5') {
      event.preventDefault();
    }
  });

  // Log page load errors
  mainWindow.webContents.on('did-fail-load', (event, code, desc, url) => {
    writeLog('Page load failed: code=' + code + ' desc=' + desc + ' url=' + url);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    writeLog('Page finished loading');
    revealMainWindowAfterSplash();
    if (pendingProjectToOpen) {
      mainWindow.webContents.send('project:openedFromFile', pendingProjectToOpen);
      pendingProjectToOpen = null;
    }
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

  mainWindow.on('close', (event) => {
    if (allowWindowClose) return;
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:closeRequested');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  writeLog('App ready');
  createWindow();
  if (initialProjectArg) {
    pendingProjectToOpen = readProjectFile(initialProjectArg);
  }
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

ipcMain.handle('app:getInfo', () => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    appPath: app.getAppPath(),
    userDataPath: app.getPath('userData'),
    projectFilePath,
    isPackaged: app.isPackaged,
    platform: process.platform,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
  };
});

ipcMain.handle('app:getUpdateInfo', () => {
  try {
    const candidateDirs = [
      path.join(__dirname, '..', 'dist'),
      path.join(app.getAppPath(), 'dist'),
      app.isPackaged ? path.join(process.resourcesPath, '..', 'dist') : '',
    ].filter(Boolean);

    const latestPath = candidateDirs
      .map((dir) => path.join(dir, 'latest.yml'))
      .find((filePath) => fs.existsSync(filePath));

    if (!latestPath) {
      return { success: true, currentVersion: app.getVersion(), latestVersion: null, status: 'not-found' };
    }

    const raw = fs.readFileSync(latestPath, 'utf-8');
    const latestVersion = (raw.match(/^version:\s*(.+)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
    const installerPathName = (raw.match(/^path:\s*(.+)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
    const releaseDate = (raw.match(/^releaseDate:\s*(.+)$/m)?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
    const installerPath = installerPathName ? path.join(path.dirname(latestPath), installerPathName) : null;
    const installerExists = !!(installerPath && fs.existsSync(installerPath));

    return {
      success: true,
      currentVersion: app.getVersion(),
      latestVersion: latestVersion || null,
      releaseDate: releaseDate || null,
      latestFile: latestPath,
      installerPath,
      installerExists,
      status: latestVersion && latestVersion !== app.getVersion() ? 'update-available' : 'current',
    };
  } catch (e) {
    writeLog('app:getUpdateInfo failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message || String(e), currentVersion: app.getVersion() };
  }
});

ipcMain.handle('print:openPreviewWindow', async (_event, options = {}) => {
  try {
    const previewWindow = new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 980,
      minHeight: 680,
      title: options.title || 'Preview Cetak',
      icon: resolveAppIconPath('ico'),
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    previewWindow.once('ready-to-show', () => {
      previewWindow.show();
      previewWindow.focus();
    });

    const html = buildPrintPreviewHtml(options);
    await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return { success: true };
  } catch (e) {
    writeLog('print:openPreviewWindow failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('app:forceClose', () => {
  allowWindowClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  else app.quit();
  return { success: true };
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
// Salinan workbook yang writable di userData — dipakai untuk sinkronisasi
// Master Kode Anggaran agar tidak menulis ke folder instalasi (Program Files).
const writableTemplateWorkbookPath = path.join(dataDir, 'APLIKASI KEUANGAN TAHUN 2025 FINAL.xlsx');
const mappingWorkbookPath = path.join(templateDataDir, 'MAPPING.xlsx');
const subSeksiExportDbPath = path.join(templateDataDir, 'sub-seksi-export-db.json');
const logoImagePath = app.isPackaged
  ? path.join(__dirname, '..', 'frontend', 'dist', 'church-logo-256.png')
  : path.join(__dirname, '..', 'frontend', 'public', 'church-logo-256.png');

function ensureWritableDataFiles() {
  if (!app.isPackaged) return;

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    for (const fileName of ['batang-tubuh.json', 'batang-tubuh-flat.json', 'sub-seksi-db.json', 'sub-seksi-db-flat.json', 'kode-anggaran.json']) {
      const targetPath = path.join(dataDir, fileName);
      const seedPath = path.join(bundledDataDir, fileName);
      if (!fs.existsSync(targetPath) && fs.existsSync(seedPath)) {
        fs.copyFileSync(seedPath, targetPath);
      }
    }
    // Salin workbook template ke userData agar sinkronisasi kode anggaran bisa menulis.
    if (!fs.existsSync(writableTemplateWorkbookPath) && fs.existsSync(templateWorkbookPath)) {
      fs.copyFileSync(templateWorkbookPath, writableTemplateWorkbookPath);
      writeLog('Template workbook copied to userData: ' + writableTemplateWorkbookPath);
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
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (e) {
    console.error(`saveJsonFile failed for ${filePath}:`, e);
    return { success: false, error: e.message };
  }
}

function readKodeAnggaranKind(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return '';
  if (['judul', 'induk', 'mother', 'parent', 'kelompok', 'header', 'struktur'].includes(text)) return 'judul';
  if (['isi', 'detail', 'anak', 'child', 'input', 'transaksi'].includes(text)) return 'isi';
  return '';
}

function readKodeAnggaranActive(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return undefined;
  if (['ya', 'yes', 'y', 'true', '1', 'aktif', 'isi', 'input'].includes(text)) return true;
  if (['tidak', 'no', 'n', 'false', '0', 'nonaktif', 'judul', 'induk'].includes(text)) return false;
  return undefined;
}

function inferKodeAnggaranParent(kode, allCodes) {
  const parts = String(kode || '').split('.').filter(Boolean);
  for (let length = parts.length - 1; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join('.');
    if (allCodes.has(candidate)) return candidate;
  }
  return '';
}

function normalizeKodeAnggaranItems(items = []) {
  const seen = new Set();
  const base = (Array.isArray(items) ? items : [])
    .map((item) => {
      const kodeAnggaran = String(item?.kodeAnggaran ?? item?.kode ?? item?.Kode ?? item?.KODE ?? item?.['KODE ANGGARAN'] ?? item?.['Kode Anggaran'] ?? '').trim();
      const mataAnggaran = String(item?.mataAnggaran ?? item?.nama ?? item?.Nama ?? item?.NAMA ?? item?.['MATA ANGGARAN'] ?? item?.['Mata Anggaran'] ?? '').trim();
      const jenisKode = readKodeAnggaranKind(item?.jenisKode ?? item?.jenis ?? item?.Jenis ?? item?.JENIS ?? item?.['JENIS'] ?? item?.['Jenis'] ?? item?.['TIPE KODE'] ?? item?.['Tipe Kode']);
      const parentKode = String(item?.parentKode ?? item?.parent ?? item?.Parent ?? item?.PARENT ?? item?.['PARENT KODE'] ?? item?.['Parent Kode'] ?? '').trim();
      const aktifInput = typeof item?.aktifInput === 'boolean'
        ? item.aktifInput
        : readKodeAnggaranActive(item?.aktifInput ?? item?.['AKTIF INPUT'] ?? item?.['Aktif Input'] ?? item?.input ?? item?.Input);
      return { kodeAnggaran, mataAnggaran, jenisKode, parentKode, aktifInput };
    })
    .filter((item) => {
      if (!item.kodeAnggaran || seen.has(item.kodeAnggaran)) return false;
      seen.add(item.kodeAnggaran);
      return true;
    });
  const allCodes = new Set(base.map((item) => item.kodeAnggaran));
  const parentCodes = new Set();
  base.forEach((item) => {
    const parentKode = item.parentKode || inferKodeAnggaranParent(item.kodeAnggaran, allCodes);
    if (parentKode) parentCodes.add(parentKode);
  });
  return base.map((item) => {
    const parentKode = item.parentKode || inferKodeAnggaranParent(item.kodeAnggaran, allCodes) || undefined;
    const jenisKode = item.jenisKode || (parentCodes.has(item.kodeAnggaran) ? 'judul' : 'isi');
    const aktifInput = typeof item.aktifInput === 'boolean' ? item.aktifInput : jenisKode === 'isi';
    return { ...item, jenisKode, parentKode, aktifInput };
  });
}

function loadKodeAnggaranFromWorkbook() {
  try {
    loadXLSX();
    const workbookPath = fs.existsSync(writableTemplateWorkbookPath) ? writableTemplateWorkbookPath : templateWorkbookPath;
    if (!fs.existsSync(workbookPath)) return [];
    const workbook = XLSX.readFile(workbookPath);
    const dbSheet = workbook.Sheets['DATA BASE2'];
    if (!dbSheet) return [];
    const dbRows = XLSX.utils.sheet_to_json(dbSheet, { defval: '' });
    return normalizeKodeAnggaranItems(dbRows);
  } catch (e) {
    console.error('loadKodeAnggaranFromWorkbook failed:', e);
    return [];
  }
}

function loadKodeAnggaranMaster() {
  const dbItems = normalizeKodeAnggaranItems(loadJsonFile(kodeAnggaranPath));
  return dbItems;
}

function syncKodeAnggaranWorkbook(items = []) {
  try {
    loadXLSX();
    // Sinkronisasi menulis ke salinan writable di userData (kalau ada), bukan
    // ke folder instalasi yang read-only saat aplikasi terpasang.
    const workbookPath = fs.existsSync(writableTemplateWorkbookPath) ? writableTemplateWorkbookPath : templateWorkbookPath;
    if (!fs.existsSync(workbookPath)) return { success: true, skipped: true };
    const workbook = XLSX.readFile(workbookPath, { cellStyles: true });
    const rows = [['KODE ANGGARAN', 'MATA ANGGARAN', 'JENIS', 'PARENT KODE', 'AKTIF INPUT']];
    normalizeKodeAnggaranItems(items).forEach((item) => {
      rows.push([item.kodeAnggaran, item.mataAnggaran, item.jenisKode === 'judul' ? 'Judul' : 'Isi', item.parentKode || '', item.aktifInput ? 'Ya' : 'Tidak']);
    });

    const nextSheet = XLSX.utils.aoa_to_sheet(rows);
    const existingSheet = workbook.Sheets['DATA BASE2'];
    if (existingSheet) {
      nextSheet['!cols'] = existingSheet['!cols'] && existingSheet['!cols'].length >= 5
        ? existingSheet['!cols']
        : [{ wch: 24 }, { wch: 72 }, { wch: 14 }, { wch: 24 }, { wch: 14 }];
      nextSheet['!merges'] = existingSheet['!merges'];
    } else {
      nextSheet['!cols'] = [{ wch: 24 }, { wch: 72 }, { wch: 14 }, { wch: 24 }, { wch: 14 }];
      workbook.SheetNames.push('DATA BASE2');
    }
    workbook.Sheets['DATA BASE2'] = nextSheet;
    XLSX.writeFile(workbook, workbookPath);
    return { success: true };
  } catch (e) {
    console.error('syncKodeAnggaranWorkbook failed:', e);
    return { success: false, error: e.message };
  }
}

function readKodeAnggaranImportFile(filePath) {
  loadXLSX();
  const ext = path.extname(filePath).toLowerCase();
  let workbook;
  if (ext === '.csv' || ext === '.txt') {
    const raw = fs.readFileSync(filePath, 'utf8');
    workbook = XLSX.read(raw, { type: 'string' });
  } else {
    workbook = XLSX.readFile(filePath);
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  return normalizeKodeAnggaranItems(rows);
}

function loadBatangTubuhData() {
  const flatItems = loadJsonFile(batangTubuhPath);
  if (Array.isArray(flatItems) && flatItems.length > 0) return flatItems;
  return loadJsonFile(subSeksiPath);
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

function getBackupsDir() {
  return path.join(app.getPath('userData'), 'backups');
}

function getAttachmentsDir() {
  const dir = path.join(app.getPath('userData'), 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeAttachmentName(name) {
  const ext = path.extname(String(name || 'bukti'));
  const base = path.basename(String(name || 'bukti'), ext)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'bukti';
  return `${base}${ext || ''}`;
}

function isInsideDir(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function toBackupInfo(filePath) {
  const stat = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    size: stat.size,
    createdAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
  };
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

ipcMain.handle('backup:list', async () => {
  try {
    const backupsDir = getBackupsDir();
    if (!fs.existsSync(backupsDir)) return [];

    return fs.readdirSync(backupsDir)
      .filter((name) => name.toLowerCase().endsWith('.gpm'))
      .map((name) => toBackupInfo(path.join(backupsDir, name)))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch (e) {
    writeLog('backup:list failed: ' + (e.stack || e.message || String(e)));
    return [];
  }
});

ipcMain.handle('backup:read', async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Path backup tidak valid.' };
    }

    const resolvedBackupsDir = path.resolve(getBackupsDir());
    const resolvedFilePath = path.resolve(filePath);
    if (!isInsideDir(resolvedBackupsDir, resolvedFilePath) || path.extname(resolvedFilePath).toLowerCase() !== '.gpm') {
      return { success: false, error: 'File backup berada di luar folder backup aplikasi.' };
    }

    const data = fs.readFileSync(resolvedFilePath, 'utf-8');
    return { success: true, data, path: resolvedFilePath };
  } catch (e) {
    writeLog('backup:read failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('backup:showInFolder', async (_event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }
    const backupsDir = getBackupsDir();
    fs.mkdirSync(backupsDir, { recursive: true });
    await shell.openPath(backupsDir);
    return { success: true };
  } catch (e) {
    writeLog('backup:showInFolder failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('attachment:addTransaction', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Bukti Transaksi',
      properties: ['openFile'],
      filters: [
        { name: 'Bukti Transaksi', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'] },
        { name: 'Semua File', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };

    const sourcePath = result.filePaths[0];
    if (!fs.existsSync(sourcePath)) return { success: false, error: 'File bukti tidak ditemukan.' };

    const stats = fs.statSync(sourcePath);
    if (!stats.isFile()) return { success: false, error: 'Bukti harus berupa file.' };
    const maxSize = 25 * 1024 * 1024;
    if (stats.size > maxSize) return { success: false, error: 'Ukuran bukti maksimal 25 MB.' };

    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const fileName = sanitizeAttachmentName(path.basename(sourcePath));
    const storedName = `${id}-${fileName}`;
    const storedPath = path.join(getAttachmentsDir(), storedName);
    fs.copyFileSync(sourcePath, storedPath);

    return {
      success: true,
      attachment: {
        id,
        fileName,
        storedPath,
        size: stats.size,
        mimeType: '',
        createdAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    writeLog('attachment:addTransaction failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('attachment:open', async (_event, filePath) => {
  try {
    const attachmentsDir = getAttachmentsDir();
    const targetPath = path.resolve(String(filePath || ''));
    if (!targetPath || !isInsideDir(attachmentsDir, targetPath)) return { success: false, error: 'Path lampiran tidak valid.' };
    if (!fs.existsSync(targetPath)) return { success: false, error: 'File lampiran tidak ditemukan.' };
    const error = await shell.openPath(targetPath);
    return error ? { success: false, error } : { success: true };
  } catch (e) {
    writeLog('attachment:open failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('attachment:showInFolder', async (_event, filePath) => {
  try {
    const attachmentsDir = getAttachmentsDir();
    const targetPath = path.resolve(String(filePath || ''));
    if (!targetPath || !isInsideDir(attachmentsDir, targetPath)) return { success: false, error: 'Path lampiran tidak valid.' };
    if (!fs.existsSync(targetPath)) return { success: false, error: 'File lampiran tidak ditemukan.' };
    shell.showItemInFolder(targetPath);
    return { success: true };
  } catch (e) {
    writeLog('attachment:showInFolder failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('attachment:checkExists', async (_event, filePath) => {
  try {
    const attachmentsDir = getAttachmentsDir();
    const targetPath = path.resolve(String(filePath || ''));
    if (!targetPath || !isInsideDir(attachmentsDir, targetPath)) return { success: false, exists: false, error: 'Path lampiran tidak valid.' };
    return { success: true, exists: fs.existsSync(targetPath) };
  } catch (e) {
    writeLog('attachment:checkExists failed: ' + (e.stack || e.message || String(e)));
    return { success: false, exists: false, error: e.message || String(e) };
  }
});

ipcMain.handle('backup:saveProject', async (_event, data, defaultName) => {
  try {
    if (!data || typeof data !== 'string') {
      return { success: false, error: 'Data backup kosong.' };
    }

    const safeName = String(defaultName || `Backup_Keuangan_Gereja_${new Date().toISOString().slice(0, 10)}.gpm`)
      .replace(/[<>:"/\\|?*]+/g, '-');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Backup Project',
      defaultPath: safeName.endsWith('.gpm') ? safeName : `${safeName}.gpm`,
      filters: [{ name: 'Project Keuangan Gereja', extensions: ['gpm'] }],
    });

    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    const filePath = ensureProjectExtension(result.filePath);
    fs.writeFileSync(filePath, data, 'utf-8');
    writeLog('[BACKUP] manual backup created: ' + filePath);
    return { success: true, path: filePath };
  } catch (e) {
    writeLog('backup:saveProject failed: ' + (e.stack || e.message || String(e)));
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('kodeAnggaran:load', async () => {
  return loadKodeAnggaranMaster();
});

ipcMain.handle('kodeAnggaran:save', async (_event, items) => {
  const normalized = normalizeKodeAnggaranItems(items);
  const jsonResult = saveJsonFile(kodeAnggaranPath, normalized);
  if (!jsonResult.success) return jsonResult;

  const workbookResult = syncKodeAnggaranWorkbook(normalized);
  if (!workbookResult.success) {
    writeLog('[KodeAnggaran] JSON saved, workbook sync skipped/failed: ' + (workbookResult.error || 'unknown error'));
  }
  return { success: true, workbookSynced: workbookResult.success && !workbookResult.skipped };
});

ipcMain.handle('kodeAnggaran:downloadTemplate', async (_event, opts = {}) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Download Template Master Kode Anggaran',
      defaultPath: 'template_master_kode_anggaran.xlsx',
      filters: [
        { name: 'Excel Workbook', extensions: ['xlsx'] },
        { name: 'CSV (Comma separated)', extensions: ['csv'] },
      ],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };

    const chosen = (opts && opts.format) || path.extname(result.filePath).replace('.', '').toLowerCase() || 'xlsx';
    const sourceItems = Array.isArray(opts.items) ? opts.items : loadKodeAnggaranMaster();
    const rows = [['KODE ANGGARAN', 'MATA ANGGARAN', 'JENIS', 'PARENT KODE', 'AKTIF INPUT']];
    const normalized = normalizeKodeAnggaranItems(sourceItems);
    if (normalized.length > 0) {
      normalized.forEach((item) => rows.push([
        item.kodeAnggaran,
        item.mataAnggaran,
        item.jenisKode === 'judul' ? 'Judul' : 'Isi',
        item.parentKode || '',
        item.aktifInput ? 'Ya' : 'Tidak',
      ]));
    } else {
      rows.push(['I', 'Pendapatan', 'Judul', '', 'Tidak']);
      rows.push(['I.1', 'Contoh Kelompok Pendapatan', 'Judul', 'I', 'Tidak']);
      rows.push(['I.1.1.01', 'Contoh Mata Anggaran Pendapatan', 'Isi', 'I.1', 'Ya']);
      rows.push(['II', 'Pengeluaran', 'Judul', '', 'Tidak']);
      rows.push(['II.1', 'Contoh Kelompok Pengeluaran', 'Judul', 'II', 'Tidak']);
      rows.push(['II.1.1.01', 'Contoh Mata Anggaran Pengeluaran', 'Isi', 'II.1', 'Ya']);
    }

    if (chosen === 'csv') {
      const lines = rows.map((row) => row.map((cell) => {
        const text = String(cell ?? '');
        return text.includes(',') || text.includes('"') || text.includes('\n') ? `"${text.replace(/"/g, '""')}"` : text;
      }).join(',')).join('\n');
      fs.writeFileSync(result.filePath, `\uFEFF${lines}`, 'utf8');
    } else {
      const xlsx = require('xlsx-js-style');
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 24 }, { wch: 72 }, { wch: 14 }, { wch: 24 }, { wch: 14 }];
      ws['!autofilter'] = { ref: xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: 4 } }) };
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      for (let col = 0; col < rows[0].length; col += 1) {
        const ref = xlsx.utils.encode_cell({ r: 0, c: col });
        ws[ref].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: '1F4E79' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
      xlsx.utils.book_append_sheet(wb, ws, 'Master Kode Anggaran');
      xlsx.writeFile(wb, result.filePath);
    }
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error('kodeAnggaran:downloadTemplate failed:', e);
    return { success: false, error: e.message || String(e) };
  }
});

ipcMain.handle('kodeAnggaran:importTemplate', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Master Kode Anggaran',
      properties: ['openFile'],
      filters: [{ name: 'Spreadsheet', extensions: ['xlsx', 'xls', 'csv', 'txt'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
    const filePath = result.filePaths[0];
    const imported = readKodeAnggaranImportFile(filePath);
    if (imported.length === 0) {
      return { success: false, error: 'Tidak ada kode anggaran valid pada file import.' };
    }
    const replacement = normalizeKodeAnggaranItems(imported)
      .sort((a, b) => a.kodeAnggaran.localeCompare(b.kodeAnggaran, 'id', { numeric: true }));
    const saveResult = saveJsonFile(kodeAnggaranPath, replacement);
    if (!saveResult.success) return saveResult;
    const workbookResult = syncKodeAnggaranWorkbook(replacement);
    if (!workbookResult.success) {
      writeLog('[KodeAnggaran] Import saved to JSON, workbook sync skipped/failed: ' + (workbookResult.error || 'unknown error'));
    }
    return {
      success: true,
      path: filePath,
      rows: imported,
      items: replacement,
      imported: replacement.length,
      total: replacement.length,
      mode: 'replace',
      workbookSynced: workbookResult.success && !workbookResult.skipped,
    };
  } catch (e) {
    console.error('kodeAnggaran:importTemplate failed:', e);
    return { success: false, error: e.message || String(e) };
  }
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
  return loadBatangTubuhData();
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

// --- Legacy kode anggaran loader: keep returning the centralized master ---
ipcMain.handle('excel:loadDataKodeAnggaran', async () => {
  return loadKodeAnggaranMaster();
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
    const hierarchicalData = loadBatangTubuhData();
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

// --- Export Dianggarkan / RAPB to Excel ---
ipcMain.handle('dianggarkan:export', async (_event, config) => {
  try {
    const { DianggarkanExportService } = require('./services/dianggarkan-export');
    const exporter = new DianggarkanExportService({
      templatePath: mappingWorkbookPath,
      logoPath: logoImagePath,
    });

    const hierarchicalData = loadBatangTubuhData();
    if (!Array.isArray(hierarchicalData) || hierarchicalData.length === 0) {
      return { success: false, error: 'Data batang tubuh tidak ditemukan' };
    }

    const buffer = await exporter.export(hierarchicalData, config);

    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
      title: 'Export Rancangan Anggaran',
      defaultPath: `Rancangan_Anggaran_${config.tahun || new Date().getFullYear()}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error('dianggarkan:export error:', e);
    return { success: false, error: e.message };
  }
});

// --- Import Batang Tubuh (CSV / XLSX) ---
ipcMain.handle('batangTubuh:importPreview', async () => {
  try {
    writeLog('[IPC] batangTubuh:importPreview called');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Preview Import Batang Tubuh (CSV / Excel)',
      properties: ['openFile'],
      filters: [
        { name: 'Spreadsheet', extensions: ['xlsx', 'xls', 'csv', 'txt'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      writeLog('[IPC] batangTubuh:importPreview canceled');
      return { success: false, canceled: true };
    }
    const { preview } = require('./services/batang-tubuh-import');
    const pv = await preview(result.filePaths[0], 20);
    writeLog(`[IPC] batangTubuh:importPreview path=${result.filePaths[0]} rows=${Array.isArray(pv.rows) ? pv.rows.length : 0} error=${pv.error || ''}`);
    return { success: true, path: result.filePaths[0], ...pv };
  } catch (e) {
    console.error('batangTubuh:importPreview failed:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('batangTubuh:import', async (_event, opts = {}) => {
  try {
    let filePath = opts && opts.path;
    if (!filePath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Batang Tubuh (CSV / Excel)',
        properties: ['openFile'],
        filters: [
          { name: 'Spreadsheet', extensions: ['xlsx', 'xls', 'csv', 'txt'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
      filePath = result.filePaths[0];
    }
    const importer = require('./services/batang-tubuh-import');
    const data = await importer.import(filePath);
    return { success: true, path: filePath, ...data };
  } catch (e) {
    console.error('batangTubuh:import failed:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('batangTubuh:downloadTemplate', async (_event, opts = {}) => {
  try {
    const defaultName = `batang_tubuh_template`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Download Template Batang Tubuh',
      defaultPath: defaultName,
      filters: [
        { name: 'Excel Workbook', extensions: ['xlsx'] },
        { name: 'CSV (Comma separated)', extensions: ['csv'] },
        { name: 'Text (Tab separated)', extensions: ['txt'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    const chosen = (opts && opts.format) || path.extname(result.filePath).replace('.', '').toLowerCase() || 'csv';
    const flattenBatangTubuhRows = (items = [], programByYear = {}, tahun = new Date().getFullYear()) => {
      const rows = [[
        'KODE ANGGARAN',
        'MATA ANGGARAN',
        'PROGRAM',
        'KETERANGAN',
        'JUMLAH',
      ]];
      const programMap = (programByYear && programByYear[String(tahun)]) || {};

      const pushDetailRows = (details = [], meta = {}) => {
        details.forEach((row) => {
          const kode = String(row?.kode || row?.kodeAnggaran || '').trim();
          if (!kode) return;
          const nama = String(row?.nama || row?.MataAnggaran || row?.mataAnggaran || '');
          const programs = Array.isArray(programMap[kode]) ? programMap[kode] : [];
          if (programs.length > 0) {
            programs.forEach((program) => {
              const rincian = Array.isArray(program?.rincian) ? program.rincian : [];
              if (rincian.length === 0) {
                rows.push([kode, nama, String(program?.namaProgram || 'Program Umum'), '', 0]);
                return;
              }
              rincian.forEach((detail) => {
                rows.push([
                  kode,
                  nama,
                  String(program?.namaProgram || 'Program Umum'),
                  String(detail?.keterangan || ''),
                  Number(detail?.jumlah || 0),
                ]);
              });
            });
            return;
          }
          rows.push([
            kode,
            nama,
            Number(row?.dianggarkan || 0) > 0 ? 'Program Umum' : '',
            Number(row?.dianggarkan || 0) > 0 ? 'Anggaran awal' : '',
            Number(row?.dianggarkan || 0),
          ]);
        });
      };

      (Array.isArray(items) ? items : []).forEach((item) => {
        pushDetailRows(item?.detailRows || [], {
          kelompok: item?.subSeksiNama || item?.subSeksiKode || '',
          pos: item?.nama || '',
        });
        (item?.batangTubuh || []).forEach((bt) => {
          pushDetailRows(bt?.detailRows || [], {
            kelompok: item?.nama || item?.subSeksiNama || item?.kode || '',
            pos: bt?.nama || bt?.kode || '',
          });
        });
      });

      if (rows.length === 1) {
        rows.push(['I.2.2.01.001', 'Kolekta Kebaktian Minggu', 'Program Umum', 'Anggaran awal', 0]);
        rows.push(['I.2.2.01.002', 'Kolekta Kebaktian Minggu Perjamuan Kudus', 'Program Umum', 'Anggaran awal', 0]);
      }

      return rows;
    };

    const batangTubuhData = loadBatangTubuhData();
    const rows = flattenBatangTubuhRows(batangTubuhData, opts?.batangTubuhProgramByYear || {}, opts?.tahun);

    if (chosen === 'json') {
      const [headers, ...body] = rows;
      const jsonRows = body.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
      fs.writeFileSync(result.filePath, JSON.stringify(jsonRows, null, 2), 'utf8');
    } else if (chosen === 'xlsx') {
      const xlsx = require('xlsx-js-style');
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 20 },
        { wch: 58 },
        { wch: 34 },
        { wch: 46 },
        { wch: 18 },
      ];
      ws['!autofilter'] = { ref: xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: 4 } }) };
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };

      for (let col = 0; col < rows[0].length; col += 1) {
        const ref = xlsx.utils.encode_cell({ r: 0, c: col });
        ws[ref].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: '1F4E79' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
      for (let row = 1; row < rows.length; row += 1) {
        const amountRef = xlsx.utils.encode_cell({ r: row, c: 4 });
        if (ws[amountRef]) {
          ws[amountRef].z = '#,##0';
          ws[amountRef].s = { alignment: { horizontal: 'right' } };
        }
      }

      xlsx.utils.book_append_sheet(wb, ws, 'Import Batang Tubuh');
      xlsx.writeFile(wb, result.filePath);
    } else if (chosen === 'txt') {
      // tab separated with BOM
      const sep = '\t';
      const lines = rows.map((r) => r.join(sep)).join('\n');
      const withBom = '\uFEFF' + lines;
      fs.writeFileSync(result.filePath, withBom, 'utf8');
    } else {
      // default CSV, with BOM and comma separator
      const sep = ',';
      const lines = rows.map((r) => r.map((c) => {
        if (typeof c === 'string' && (c.includes(',') || c.includes('"') || c.includes('\n'))) {
          return '"' + c.replace(/"/g, '""') + '"';
        }
        return String(c);
      }).join(sep)).join('\n');
      const withBom = '\uFEFF' + lines + '\n';
      fs.writeFileSync(result.filePath, withBom, 'utf8');
    }
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error('batangTubuh:downloadTemplate failed:', e);
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
        templateWorkbookPath,
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

// --- Export Realisasi Perbulan as a dedicated report workbook ---
ipcMain.handle('excel:exportRealisasiPerbulan', async (_event, config = {}) => {
  try {
    const { RealisasiPerbulanExportService } = require('./services/realisasi-perbulan-export');
    const tahun = Number(config.tahun) || new Date().getFullYear();
    const exporter = new RealisasiPerbulanExportService();
    const buffer = await exporter.export({ ...config, tahun });
    const safeJemaat = String(config.namaJemaat || 'Jemaat').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || mainWindow, {
      title: 'Export Realisasi Perbulan',
      defaultPath: `Realisasi_Perbulan_${safeJemaat}_${tahun}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error('excel:exportRealisasiPerbulan failed:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle("excel:exportRekonKlasis", async (_event, config = {}) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export Rekon Klasis",
      defaultPath: path.join(app.getPath("documents"), `Rekon_Klasis_${config.tahun || ""}.xlsx`),
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    const { RekonKlasisExportService } = require("./services/rekon-klasis-export");
    const exporter = new RekonKlasisExportService();
    const wb = await exporter.export(config);
    await wb.xlsx.writeFile(result.filePath);
    return { success: true, path: result.filePath };
  } catch (error) {
    writeLog("[Export RekonKlasis] " + (error instanceof Error ? error.message : String(error)));
    return { success: false, error: error instanceof Error ? error.message : String(error) };
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
    return readProjectFile(result.filePaths[0]);
  } catch (e) {
    console.error('project:open failed:', e);
    return { success: false };
  }
});

ipcMain.handle('project:openPath', async (_event, filePath) => {
  console.log('[IPC] project:openPath called');
  try {
    return readProjectFile(filePath);
  } catch (e) {
    console.error('project:openPath failed:', e);
    return { success: false, error: e.message };
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
  } catch (e) {
    console.error('excel:exportDoorscrieft failed:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('excel:previewDoorscrieftImport', async (_event, options = {}) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Preview Import Doorscrieft dari Excel',
      properties: ['openFile'],
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const { DoorscrieftImportService } = require('./services/doorscrieft-import');
    const importer = new DoorscrieftImportService();
    const preview = await importer.preview(result.filePaths[0], options);
    return { success: true, path: result.filePaths[0], ...preview };
  } catch (e) {
    console.error('excel:previewDoorscrieftImport failed:', e);
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


