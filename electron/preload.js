const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  readExcel: (filePath) => ipcRenderer.invoke("excel:read", filePath),
  saveFile: (data) => ipcRenderer.invoke("file:save", data),
  getAppPath: () => ipcRenderer.invoke("app:getPath"),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),
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
  // Kode Anggaran from Excel DATA BASE2
  loadDataKodeAnggaran: () => ipcRenderer.invoke('excel:loadDataKodeAnggaran'),
  // Kode Anggaran Database
  loadKodeAnggaran: () => ipcRenderer.invoke('kodeAnggaran:load'),
  saveKodeAnggaran: (items) => ipcRenderer.invoke('kodeAnggaran:save', items),
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
  exportFullWorkbook: (config) => ipcRenderer.invoke('workbook:exportFull', config),
  // Doorscrieft (still from Excel for now)
  loadDoorscrieft: () => ipcRenderer.invoke('excel:loadDoorscrieft'),
  exportDoorscrieftToExcel: (data) => ipcRenderer.invoke('excel:exportDoorscrieft', data),
  importDoorscrieftFromExcel: (options) => ipcRenderer.invoke('excel:importDoorscrieft', options),
  // Project
  saveProject: (data, defaultName, asNew) => ipcRenderer.invoke('project:save', data, defaultName, !!asNew),
  openProject: () => ipcRenderer.invoke('project:open'),
  newProject: () => ipcRenderer.invoke('project:new'),
  createAutoBackup: (data, reason) => ipcRenderer.invoke('backup:createAuto', data, reason),
});
