const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  readExcel: (filePath) => ipcRenderer.invoke("excel:read", filePath),
  saveFile: (data) => ipcRenderer.invoke("file:save", data),
  getAppPath: () => ipcRenderer.invoke("app:getPath"),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  getUpdateInfo: () => ipcRenderer.invoke("app:getUpdateInfo"),
  openPrintPreviewWindow: (options) => ipcRenderer.invoke("print:openPreviewWindow", options),
  forceClose: () => ipcRenderer.invoke("app:forceClose"),
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("menu:action", handler);
    return () => {
      ipcRenderer.removeListener("menu:action", handler);
    };
  },
  onProjectOpenedFromFile: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("project:openedFromFile", handler);
    return () => {
      ipcRenderer.removeListener("project:openedFromFile", handler);
    };
  },
  onCloseRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("app:closeRequested", handler);
    return () => {
      ipcRenderer.removeListener("app:closeRequested", handler);
    };
  },
  // Legacy alias. Data tetap berasal dari Master Kode Anggaran pusat.
  loadDataKodeAnggaran: () => ipcRenderer.invoke('excel:loadDataKodeAnggaran'),
  // Master Kode Anggaran pusat
  loadKodeAnggaran: () => ipcRenderer.invoke('kodeAnggaran:load'),
  saveKodeAnggaran: (items) => ipcRenderer.invoke('kodeAnggaran:save', items),
  downloadKodeAnggaranTemplate: (opts) => ipcRenderer.invoke('kodeAnggaran:downloadTemplate', opts),
  importKodeAnggaranTemplate: () => ipcRenderer.invoke('kodeAnggaran:importTemplate'),
  // Sub Seksi (legacy - from batang-tubuh.json)
  loadSubSeksi: () => ipcRenderer.invoke('subSeksi:load'),
  saveSubSeksi: (items) => ipcRenderer.invoke('subSeksi:save', items),
  // Sub Seksi Database (complete hierarchy from Excel SUB SEKSI sheets)
  loadSubSeksiDb: () => ipcRenderer.invoke('subSeksiDb:load'),
  loadSubSeksiDbFlat: () => ipcRenderer.invoke('subSeksiDbFlat:load'),
  exportSubSeksiExcel: (config) => ipcRenderer.invoke('subSeksi:exportExcel', config),
  // Batang Tubuh Database
  loadBatangTubuh: () => ipcRenderer.invoke('batangTubuh:load'),
  saveBatangTubuh: (items) => ipcRenderer.invoke('batangTubuh:save', items),
  exportBatangTubuh: (config) => ipcRenderer.invoke('batangTubuh:export', config),
  exportDianggarkan: (config) => ipcRenderer.invoke('dianggarkan:export', config),
  importBatangTubuhPreview: (opts) => ipcRenderer.invoke('batangTubuh:importPreview', opts),
  importBatangTubuh: (opts) => ipcRenderer.invoke('batangTubuh:import', opts),
  // opts = { format: 'csv' | 'xlsx' }
  downloadBatangTubuhTemplate: (opts) => ipcRenderer.invoke('batangTubuh:downloadTemplate', opts),
  exportFullWorkbook: (config) => ipcRenderer.invoke('workbook:exportFull', config),
  exportRealisasiPerbulan: (config) => ipcRenderer.invoke('excel:exportRealisasiPerbulan', config),
  // Doorscrieft (still from Excel for now)
  loadDoorscrieft: () => ipcRenderer.invoke('excel:loadDoorscrieft'),
  exportDoorscrieftToExcel: (data) => ipcRenderer.invoke('excel:exportDoorscrieft', data),
  previewDoorscrieftImport: (options) => ipcRenderer.invoke('excel:previewDoorscrieftImport', options),
  importDoorscrieftFromExcel: (options) => ipcRenderer.invoke('excel:importDoorscrieft', options),
  // Rekon Klasis
  exportRekonKlasis: (config) => ipcRenderer.invoke("excel:exportRekonKlasis", config),
  // Project
  saveProject: (data, defaultName, asNew) => ipcRenderer.invoke('project:save', data, defaultName, !!asNew),
  openProject: () => ipcRenderer.invoke('project:open'),
  openRecentProject: (filePath) => ipcRenderer.invoke('project:openPath', filePath),
  newProject: () => ipcRenderer.invoke('project:new'),
  createAutoBackup: (data, reason) => ipcRenderer.invoke('backup:createAuto', data, reason),
  saveProjectBackup: (data, defaultName) => ipcRenderer.invoke('backup:saveProject', data, defaultName),
  listProjectBackups: () => ipcRenderer.invoke('backup:list'),
  readProjectBackup: (filePath) => ipcRenderer.invoke('backup:read', filePath),
  showBackupInFolder: (filePath) => ipcRenderer.invoke('backup:showInFolder', filePath),
  addTransactionAttachment: () => ipcRenderer.invoke('attachment:addTransaction'),
  openAttachment: (filePath) => ipcRenderer.invoke('attachment:open', filePath),
  showAttachmentInFolder: (filePath) => ipcRenderer.invoke('attachment:showInFolder', filePath),
  checkAttachmentExists: (filePath) => ipcRenderer.invoke('attachment:checkExists', filePath),
});
