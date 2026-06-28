import { useStore } from '@/stores';
import { getElectronAPI } from '@/lib/electron';
import type { ProjectBackupInfo } from '@/types/electron';

export type { ProjectBackupInfo };

export function buildProjectSnapshot() {
  const state = useStore.getState();

  return {
    user: state.user ?? null,
    userAccounts: state.userAccounts,
    kategoriPendapatans: state.kategoriPendapatans,
    kategoriBelanjas: state.kategoriBelanjas,
    subSeksis: state.subSeksis,
    pemasukans: state.pemasukans,
    pengeluarans: state.pengeluarans,
    realisasis: state.realisasis,
    kodeAnggarans: state.kodeAnggarans,
    batangTubuhs: state.batangTubuhs,
    batangTubuhAnggaranByYear: state.batangTubuhAnggaranByYear,
    batangTubuhProgramByYear: state.batangTubuhProgramByYear,
    doorscrieftTransaksis: state.doorscrieftTransaksis,
    tahunAktif: state.tahunAktif,
    lockedYears: state.lockedYears,
    selectedBulan: state.selectedBulan,
    setupCompleted: state.setupCompleted,
    organizationLevel: state.organizationLevel,
    namaJemaat: state.namaJemaat,
    kopGereja: state.kopGereja,
    kopKlas: state.kopKlas,
    penandatanganKiriJabatan: state.penandatanganKiriJabatan,
    penandatanganKiriNama: state.penandatanganKiriNama,
    penandatanganKananJabatan: state.penandatanganKananJabatan,
    penandatanganKananNama: state.penandatanganKananNama,
    appName: state.appName,
    appSubtitle: state.appSubtitle,
    loginBackgroundImage: state.loginBackgroundImage,
    adminUsername: state.adminUsername,
    adminPassword: state.adminPassword,
    adminPasswordHash: state.adminPasswordHash,
    adminRecoveryCodeHash: state.adminRecoveryCodeHash,
    adminRecoveryCodeCreatedAt: state.adminRecoveryCodeCreatedAt,
    guestLoginEnabled: state.guestLoginEnabled,
    auditLogs: state.auditLogs,
    activeProjectPath: state.activeProjectPath,
    lastSavedAt: state.lastSavedAt,
    hasUnsavedChanges: state.hasUnsavedChanges,
  };
}

export function stringifyProjectSnapshot() {
  return JSON.stringify(buildProjectSnapshot(), null, 2);
}

export async function createAutoBackup(reason: string) {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.createAutoBackup) return { success: false, skipped: true };
  return electronAPI.createAutoBackup(stringifyProjectSnapshot(), reason);
}

export async function saveProjectBackup(defaultName?: string) {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.saveProjectBackup) {
    return { success: false, skipped: true, canceled: false, path: undefined, error: 'Fitur hanya tersedia di mode Electron.' };
  }
  const state = useStore.getState();
  const fallbackName = `${state.namaJemaat.replace(/\s+/g, '_')}_${state.tahunAktif}_backup.gpm`;
  return electronAPI.saveProjectBackup(stringifyProjectSnapshot(), defaultName || fallbackName);
}

export async function listProjectBackups() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.listProjectBackups) return [];
  return electronAPI.listProjectBackups();
}

export async function readProjectBackup(path: string) {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.readProjectBackup) {
    return { success: false, error: 'Fitur hanya tersedia di mode Electron.' };
  }
  return electronAPI.readProjectBackup(path);
}

export async function showBackupInFolder(path?: string) {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.showBackupInFolder) {
    return { success: false, error: 'Fitur hanya tersedia di mode Electron.' };
  }
  return electronAPI.showBackupInFolder(path);
}

type SnapshotRecord = Record<string, unknown>;

function isSnapshotRecord(value: unknown): value is SnapshotRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function restoreSnapshotData(rawData: string) {
  const parsed = JSON.parse(rawData) as SnapshotRecord;

  const restoreDates = (obj: SnapshotRecord, fields: string[]) => {
    fields.forEach((field) => {
      if (obj[field] && typeof obj[field] === 'string') obj[field] = new Date(obj[field]);
    });
    return obj;
  };

  if (Array.isArray(parsed.pemasukans)) {
    parsed.pemasukans = parsed.pemasukans.filter(isSnapshotRecord).map((item) => restoreDates(item, ['tanggal', 'createdAt', 'updatedAt']));
  }
  if (Array.isArray(parsed.pengeluarans)) {
    parsed.pengeluarans = parsed.pengeluarans.filter(isSnapshotRecord).map((item) => restoreDates(item, ['tanggal', 'createdAt', 'updatedAt']));
  }
  if (Array.isArray(parsed.doorscrieftTransaksis)) {
    parsed.doorscrieftTransaksis = parsed.doorscrieftTransaksis.filter(isSnapshotRecord).map((item) => {
      const restored = restoreDates(item, ['tanggal', 'createdAt', 'updatedAt']);
      if (Array.isArray(restored.attachments)) {
        restored.attachments = restored.attachments.filter(isSnapshotRecord).map((attachment) => restoreDates(attachment, ['createdAt']));
      }
      return restored;
    });
  }
  if (Array.isArray(parsed.auditLogs)) {
    parsed.auditLogs = parsed.auditLogs.filter(isSnapshotRecord).map((item) => restoreDates(item, ['createdAt']));
  }
  const user = isSnapshotRecord(parsed.user) ? parsed.user : null;
  if (user?.createdAt && typeof user.createdAt === 'string') {
    user.createdAt = new Date(user.createdAt);
  }
  if (user?.role && !['admin', 'bendahara', 'guest'].includes(String(user.role))) {
    user.role = 'guest';
  }
  if (Array.isArray(parsed.userAccounts)) {
    parsed.userAccounts = parsed.userAccounts
      .filter(isSnapshotRecord)
      .filter((item) => item.role === 'admin' || item.role === 'bendahara')
      .map((item) => restoreDates(item, ['createdAt', 'updatedAt']));
  }
  if (parsed.lastSavedAt && typeof parsed.lastSavedAt === 'string') {
    parsed.lastSavedAt = new Date(parsed.lastSavedAt);
  }

  const nextState: Record<string, unknown> = { hasUnsavedChanges: false };
  const copyIfTruthy = (key: string) => {
    if (parsed[key]) nextState[key] = parsed[key];
  };

  [
    'pemasukans',
    'pengeluarans',
    'doorscrieftTransaksis',
    'kodeAnggarans',
    'subSeksis',
    'batangTubuhs',
    'batangTubuhAnggaranByYear',
    'batangTubuhProgramByYear',
    'setupCompleted',
    'organizationLevel',
    'namaJemaat',
    'tahunAktif',
    'user',
    'userAccounts',
    'kopGereja',
    'kopKlas',
    'penandatanganKiriJabatan',
    'penandatanganKananJabatan',
    'appName',
    'appSubtitle',
    'adminUsername',
    'adminPassword',
    'adminPasswordHash',
    'adminRecoveryCodeHash',
    'kategoriPendapatans',
    'kategoriBelanjas',
    'realisasis',
    'selectedBulan',
  ].forEach(copyIfTruthy);

  if (Array.isArray(parsed.lockedYears)) nextState.lockedYears = parsed.lockedYears;
  if (parsed.penandatanganKiriNama !== undefined) nextState.penandatanganKiriNama = parsed.penandatanganKiriNama ?? '';
  if (parsed.penandatanganKananNama !== undefined) nextState.penandatanganKananNama = parsed.penandatanganKananNama ?? '';
  if (Object.prototype.hasOwnProperty.call(parsed, 'loginBackgroundImage')) nextState.loginBackgroundImage = parsed.loginBackgroundImage ?? null;
  if (parsed.guestLoginEnabled !== undefined) nextState.guestLoginEnabled = !!parsed.guestLoginEnabled;
  if (parsed.adminRecoveryCodeCreatedAt !== undefined) nextState.adminRecoveryCodeCreatedAt = parsed.adminRecoveryCodeCreatedAt ? new Date(String(parsed.adminRecoveryCodeCreatedAt)) : null;
  if (Array.isArray(parsed.auditLogs)) nextState.auditLogs = parsed.auditLogs;
  if (parsed.activeProjectPath !== undefined) nextState.activeProjectPath = parsed.activeProjectPath ?? null;
  if (parsed.lastSavedAt !== undefined) nextState.lastSavedAt = parsed.lastSavedAt ?? null;

  useStore.setState(nextState as Partial<ReturnType<typeof useStore.getState>>);

  return parsed;
}
