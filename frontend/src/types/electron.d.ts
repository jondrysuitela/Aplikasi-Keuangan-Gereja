import type { BatangTubuhItem, KodeAnggaranItem } from './index';

export type ElectronResult<T = unknown> = {
  success: boolean;
  canceled?: boolean;
  error?: string;
} & T;

export type AppInfo = {
  name?: string;
  version?: string;
  userDataPath?: string;
  projectFilePath?: string | null;
  isPackaged?: boolean;
  platform?: string;
  electronVersion?: string;
  nodeVersion?: string;
};

export type ProjectBackupInfo = {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  updatedAt: string;
};

export type BatangTubuhImportPreview = ElectronResult<{
  path?: string;
  rows?: Array<{ kode: string; nama: string; program?: string; keterangan?: string; jumlah?: number; dianggarkan: number; raw?: unknown }>;
  columns?: string[];
  detected?: { kode: string | null; nama: string | null; dianggarkan: string | null };
  total?: number;
}>;

export type ProjectOpenPayload = ElectronResult<{
  data?: string;
  path?: string;
}>;

export interface ElectronAPI {
  openFile: () => Promise<unknown>;
  readExcel: (filePath: string) => Promise<unknown>;
  saveFile: (data: unknown) => Promise<unknown>;
  getAppPath: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  getAppInfo: () => Promise<AppInfo>;
  getUpdateInfo: () => Promise<unknown>;
  openPrintPreviewWindow: (options: Record<string, unknown>) => Promise<ElectronResult>;
  forceClose: () => Promise<{ success: boolean }>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onMenuAction: (callback: (action: string) => void) => (() => void) | undefined;
  onProjectOpenedFromFile: (callback: (payload: ProjectOpenPayload) => void) => (() => void) | undefined;
  onCloseRequested: (callback: () => void) => (() => void) | undefined;

  loadDataKodeAnggaran: () => Promise<KodeAnggaranItem[]>;
  loadKodeAnggaran: () => Promise<KodeAnggaranItem[]>;
  saveKodeAnggaran: (items: KodeAnggaranItem[]) => Promise<ElectronResult>;
  downloadKodeAnggaranTemplate: (opts?: { format?: 'csv' | 'xlsx'; items?: KodeAnggaranItem[] }) => Promise<ElectronResult<{ path?: string }>>;
  importKodeAnggaranTemplate: () => Promise<ElectronResult<{ path?: string; rows?: KodeAnggaranItem[]; items?: KodeAnggaranItem[]; imported?: number; total?: number }>>;

  loadSubSeksi: () => Promise<unknown[]>;
  saveSubSeksi: (items: unknown[]) => Promise<ElectronResult>;
  loadSubSeksiDb: () => Promise<unknown[]>;
  loadSubSeksiDbFlat: () => Promise<unknown[]>;
  exportSubSeksiExcel: (config: Record<string, unknown>) => Promise<ElectronResult<{ path?: string }>>;

  loadBatangTubuh: () => Promise<BatangTubuhItem[]>;
  saveBatangTubuh: (items: BatangTubuhItem[]) => Promise<ElectronResult>;
  exportBatangTubuh: (config: Record<string, unknown>) => Promise<ElectronResult<{ path?: string }>>;
  exportDianggarkan: (config: Record<string, unknown>) => Promise<ElectronResult<{ path?: string }>>;
  importBatangTubuhPreview: (opts?: Record<string, unknown>) => Promise<BatangTubuhImportPreview>;
  importBatangTubuh: (opts?: Record<string, unknown>) => Promise<ElectronResult<{ path?: string; items?: Array<{ kode: string; nama: string; program?: string; keterangan?: string; jumlah?: number; dianggarkan: number }>; total?: number }>>;
  downloadBatangTubuhTemplate: (opts?: { format?: 'csv' | 'xlsx' | 'txt' | 'json'; tahun?: number; batangTubuhProgramByYear?: Record<string, unknown> }) => Promise<ElectronResult<{ path?: string }>>;
  exportFullWorkbook: (config: Record<string, unknown>) => Promise<ElectronResult<{ path?: string }>>;
  exportRealisasiPerbulan: (config: Record<string, unknown>) => Promise<ElectronResult<{ path?: string }>>;

  loadDoorscrieft: () => Promise<unknown[]>;
  exportDoorscrieftToExcel: (data: unknown) => Promise<ElectronResult<{ path?: string }>>;
  previewDoorscrieftImport: (options?: Record<string, unknown>) => Promise<ElectronResult<Record<string, unknown>>>;
  importDoorscrieftFromExcel: (options?: Record<string, unknown>) => Promise<ElectronResult<Record<string, unknown>>>;

  saveProject: (data: string, defaultName: string, asNew?: boolean) => Promise<ElectronResult<{ path?: string }>>;
  openProject: () => Promise<ProjectOpenPayload>;
  openRecentProject: (filePath: string) => Promise<ProjectOpenPayload>;
  newProject: () => Promise<ElectronResult>;
  createAutoBackup: (data: string, reason: string) => Promise<ElectronResult<{ path?: string }>>;
  saveProjectBackup: (data: string, defaultName: string) => Promise<ElectronResult<{ path?: string }>>;
  listProjectBackups: () => Promise<ProjectBackupInfo[]>;
  readProjectBackup: (filePath: string) => Promise<ElectronResult<{ data?: string; path?: string }>>;
  showBackupInFolder: (filePath?: string) => Promise<ElectronResult>;
  addTransactionAttachment: () => Promise<ElectronResult<{ attachment?: import('./index').TransactionAttachment }>>;
  openAttachment: (filePath: string) => Promise<ElectronResult>;
  showAttachmentInFolder: (filePath: string) => Promise<ElectronResult>;
  checkAttachmentExists: (filePath: string) => Promise<ElectronResult<{ exists: boolean }>>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
