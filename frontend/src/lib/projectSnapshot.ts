import { useStore } from '@/stores';

export function buildProjectSnapshot() {
  const state = useStore.getState();

  return {
    user: state.user ?? null,
    kategoriPendapatans: state.kategoriPendapatans,
    kategoriBelanjas: state.kategoriBelanjas,
    subSeksis: state.subSeksis,
    pemasukans: state.pemasukans,
    pengeluarans: state.pengeluarans,
    realisasis: state.realisasis,
    kodeAnggarans: state.kodeAnggarans,
    batangTubuhs: state.batangTubuhs,
    batangTubuhAnggaranByYear: state.batangTubuhAnggaranByYear,
    doorscrieftTransaksis: state.doorscrieftTransaksis,
    tahunAktif: state.tahunAktif,
    lockedYears: state.lockedYears,
    selectedBulan: state.selectedBulan,
    namaJemaat: state.namaJemaat,
    kopGereja: state.kopGereja,
    kopKlas: state.kopKlas,
    appName: state.appName,
    appSubtitle: state.appSubtitle,
    loginBackgroundImage: state.loginBackgroundImage,
    adminUsername: state.adminUsername,
    adminPassword: state.adminPassword,
  };
}

export function stringifyProjectSnapshot() {
  return JSON.stringify(buildProjectSnapshot(), null, 2);
}

export async function createAutoBackup(reason: string) {
  const anyWin = window as unknown as {
    electronAPI?: {
      createAutoBackup?: (data: string, reason: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    };
  };

  if (!anyWin?.electronAPI?.createAutoBackup) return { success: false, skipped: true };
  return anyWin.electronAPI.createAutoBackup(stringifyProjectSnapshot(), reason);
}
