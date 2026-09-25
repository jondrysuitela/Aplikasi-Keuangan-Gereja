import { create } from 'zustand';
import type { User, UserAccount, KategoriPendapatan, KategoriBelanja, SubSeksi, Pemasukan, Pengeluaran, RealisasiAnggaran, KodeAnggaranItem, DoorscrieftRowInput, BatangTubuhDetailRow, BatangTubuhItem, BatangTubuhProgram, AuditLog } from '@/types';
import { generateId } from '@/lib/utils';

type OrganizationLevel = 'klasis' | 'jemaat';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function parseBudgetValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  // Dukung format angka Indonesia: "1.500.000" → 1500000, "1.000" → 1000
  const cleaned = value.replace(/\.(?=\d{3}(?:\.|$))/g, '').replace(/[^0-9.,-]/g, '');
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let normalized = cleaned;
  if (hasDot && hasComma) normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
  else if (hasComma && !hasDot) normalized = cleaned.replace(/,/g, '.');
  else if (hasDot && !hasComma && (cleaned.match(/\./g) || []).length > 1) normalized = cleaned.replace(/\./g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function coerceAmount(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return parseBudgetValue(value);
}

function normalizeRuntimeRole(role: unknown): User['role'] {
  if (role === 'admin' || role === 'bendahara' || role === 'guest') return role;
  return 'guest';
}

function normalizeUserAccount(account: unknown): UserAccount | null {
  if (typeof account !== 'object' || account === null) return null;
  const row = account as Partial<UserAccount> & { role?: unknown; createdAt?: unknown; updatedAt?: unknown };
  if (row.role !== 'admin' && row.role !== 'bendahara') return null;

  return {
    id: String(row.id || Date.now().toString(36)),
    username: String(row.username || ''),
    name: String(row.name || row.username || ''),
    role: row.role,
    passwordHash: String(row.passwordHash || ''),
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt ? new Date(String(row.createdAt)) : new Date(),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)) : undefined,
  };
}

function normalizeKodeSegment(value: unknown) {
  return String(value || '').trim();
}

function readKodeJenis(value: unknown): KodeAnggaranItem['jenisKode'] | undefined {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  if (['judul', 'induk', 'mother', 'parent', 'kelompok', 'header', 'struktur'].includes(text)) return 'judul';
  if (['isi', 'detail', 'anak', 'child', 'input', 'transaksi'].includes(text)) return 'isi';
  return undefined;
}

function readAktifInput(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return undefined;
  if (['ya', 'yes', 'y', 'true', '1', 'aktif', 'isi', 'input'].includes(text)) return true;
  if (['tidak', 'no', 'n', 'false', '0', 'nonaktif', 'judul', 'induk'].includes(text)) return false;
  return undefined;
}

function inferParentKode(kode: string, allCodes: Set<string>) {
  const parts = kode.split('.').filter(Boolean);
  for (let length = parts.length - 1; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join('.');
    if (allCodes.has(candidate)) return candidate;
  }
  return '';
}

function isValidRootBudgetCode(kode: string) {
  return kode === 'I' || kode === 'II' || kode.startsWith('I.') || kode.startsWith('II.');
}

function normalizeKodeAnggaranItems(items: KodeAnggaranItem[] = []) {
  const seen = new Set<string>();
  const base: KodeAnggaranItem[] = [];
  items.forEach((item) => {
    const kodeAnggaran = normalizeKodeSegment(item?.kodeAnggaran);
    const mataAnggaran = normalizeKodeSegment(item?.mataAnggaran);
    if (!kodeAnggaran || !mataAnggaran || seen.has(kodeAnggaran)) return;
    seen.add(kodeAnggaran);
    base.push({
      ...item,
      kodeAnggaran,
      mataAnggaran,
      jenisKode: readKodeJenis(item?.jenisKode),
      parentKode: normalizeKodeSegment(item?.parentKode),
      aktifInput: typeof item?.aktifInput === 'boolean' ? item.aktifInput : readAktifInput(item?.aktifInput),
    });
  });
  const allCodes = new Set(base.map((item) => item.kodeAnggaran));
  const parentCodes = new Set<string>();
  base.forEach((item) => {
    const parentKode = item.parentKode || inferParentKode(item.kodeAnggaran, allCodes);
    if (parentKode) parentCodes.add(parentKode);
  });
  return base.map((item) => {
    const parentKode = item.parentKode || inferParentKode(item.kodeAnggaran, allCodes) || undefined;
    const jenisKode = item.jenisKode || (parentCodes.has(item.kodeAnggaran) ? 'judul' : 'isi');
    const aktifInput = typeof item.aktifInput === 'boolean' ? item.aktifInput : jenisKode === 'isi';
    return { ...item, jenisKode, parentKode, aktifInput };
  });
}


interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  userAccounts: UserAccount[];
  setUserAccounts: (accounts: UserAccount[]) => void;
  
  // Kategori
  kategoriPendapatans: KategoriPendapatan[];
  kategoriBelanjas: KategoriBelanja[];
  addKategoriPendapatan: (kategori: Omit<KategoriPendapatan, 'id'>) => void;
  updateKategoriPendapatan: (id: string, kategori: Partial<KategoriPendapatan>) => void;
  deleteKategoriPendapatan: (id: string) => void;
  addKategoriBelanja: (kategori: Omit<KategoriBelanja, 'id'>) => void;
  updateKategoriBelanja: (id: string, kategori: Partial<KategoriBelanja>) => void;
  deleteKategoriBelanja: (id: string) => void;
  
  // Sub Seksi
  subSeksis: SubSeksi[];
  addSubSeksi: (subSeksi: Omit<SubSeksi, 'id'>) => void;
  setSubSeksis: (subSeksis: Array<Omit<SubSeksi, 'id'>>) => void;
  updateSubSeksi: (id: string, data: Partial<SubSeksi>) => void;
  deleteSubSeksi: (id: string) => void;
  
  // Transaksi

  pemasukans: Pemasukan[];
  pengeluarans: Pengeluaran[];
  addPemasukan: (pemasukan: Omit<Pemasukan, 'id' | 'createdAt'>) => void;
  updatePemasukan: (id: string, data: Partial<Pemasukan>) => void;
  deletePemasukan: (id: string) => void;
  addPengeluaran: (pengeluaran: Omit<Pengeluaran, 'id' | 'createdAt'>) => void;
  updatePengeluaran: (id: string, data: Partial<Pengeluaran>) => void;
  deletePengeluaran: (id: string) => void;
  
  // Realisasi
  realisasis: RealisasiAnggaran[];
  addRealisasi: (realisasi: Omit<RealisasiAnggaran, 'id' | 'createdAt'>) => void;
  updateRealisasi: (id: string, data: Partial<RealisasiAnggaran>) => void;
  
  // Tahun
  // Kode Anggaran master (DATA BASE2)
  kodeAnggarans: KodeAnggaranItem[];
  setKodeAnggarans: (items: KodeAnggaranItem[]) => void;
  addKodeAnggaran: (item: Omit<KodeAnggaranItem, never>) => void;
  updateKodeAnggaran: (kodeAnggaran: string, data: Partial<KodeAnggaranItem>) => void;
  deleteKodeAnggaran: (kodeAnggaran: string) => void;

  // Batang Tubuh (from BATANG TUBUH.xlsx)
  batangTubuhs: BatangTubuhItem[];
  setBatangTubuhs: (items: BatangTubuhItem[]) => void;
  batangTubuhAnggaranByYear: Record<string, Record<string, number>>;
  setBatangTubuhAnggaranByYear: (items: Record<string, Record<string, number>>) => void;
  setBatangTubuhAnggaranForYear: (tahun: number, kode: string, dianggarkan: number) => void;
  batangTubuhProgramByYear: Record<string, Record<string, BatangTubuhProgram[]>>;
  setBatangTubuhProgramByYear: (items: Record<string, Record<string, BatangTubuhProgram[]>>) => void;
  setBatangTubuhProgramsForKode: (tahun: number, kode: string, programs: BatangTubuhProgram[]) => void;
  resetAllDianggarkan: () => void;

  // Transaksi doorscrieft (DOORSCRIEFT2)
  doorscrieftTransaksis: DoorscrieftRowInput[];
  setDoorscrieftTransaksis: (transaksis: DoorscrieftRowInput[]) => void;
  addDoorscrieftTransaksi: (transaksi: Omit<DoorscrieftRowInput, 'id' | 'createdAt'>, options?: { insertBeforeId?: string }) => void;
  updateDoorscrieftTransaksi: (id: string, data: Partial<DoorscrieftRowInput>) => void;
  deleteDoorscrieftTransaksi: (id: string) => void;


  // Tahun
  tahunAktif: number;
  setTahunAktif: (tahun: number) => void;
  lockedYears: number[];
  lockYear: (tahun: number) => void;
  unlockYear: (tahun: number) => void;
  isYearLocked: (tahun: number) => boolean;

  // Bulan filter (untuk halaman bulanan)
  selectedBulan: number; // 1-12
  setSelectedBulan: (bulan: number) => void;

  // Church settings
  setupCompleted: boolean;
  setSetupCompleted: (completed: boolean) => void;
  organizationLevel: OrganizationLevel;
  setOrganizationLevel: (level: OrganizationLevel) => void;
  namaJemaat: string;
  setNamaJemaat: (nama: string) => void;
  kopGereja: string;
  setKopGereja: (nama: string) => void;
  kopKlas: string;
  setKopKlas: (nama: string) => void;
  penandatanganKiriJabatan: string;
  setPenandatanganKiriJabatan: (jabatan: string) => void;
  penandatanganKiriNama: string;
  setPenandatanganKiriNama: (nama: string) => void;
  penandatanganKananJabatan: string;
  setPenandatanganKananJabatan: (jabatan: string) => void;
  penandatanganKananNama: string;
  setPenandatanganKananNama: (nama: string) => void;
  appName: string;
  setAppName: (nama: string) => void;
  appSubtitle: string;
  setAppSubtitle: (nama: string) => void;
  loginBackgroundImage: string | null;
  setLoginBackgroundImage: (image: string | null) => void;
  resetLoginBackgroundImage: () => void;
  adminUsername: string;
  adminPassword: string;
  adminPasswordHash: string;
  adminRecoveryCodeHash: string;
  adminRecoveryCodeCreatedAt: Date | null;
  setAdminCredentials: (username: string, password: string) => void;
  setAdminCredentialsHash: (username: string, passwordHash: string) => void;
  setAdminRecoveryCodeHash: (recoveryCodeHash: string, createdAt?: Date) => void;
  guestLoginEnabled: boolean;
  setGuestLoginEnabled: (enabled: boolean) => void;

  // Professional metadata
  activeProjectPath: string | null;
  setActiveProjectPath: (path: string | null) => void;
  lastSavedAt: Date | null;
  setLastSavedAt: (date: Date | null) => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
  auditLogs: AuditLog[];
  addAuditLog: (action: string, entity: string, detail?: string, entityId?: string) => void;
  clearAuditLogs: () => void;

}

export const BASE_BATANG_TUBUH_BUDGET_YEAR = 2026;

export function applyBatangTubuhAnggaranForYear(
  items: BatangTubuhItem[],
  byYear: Record<string, Record<string, number>>,
  tahun: number,
  programByYear: Record<string, Record<string, BatangTubuhProgram[]>> = {},
) {
  const yearKey = String(tahun);
  const yearValues = byYear[yearKey] || {};
  const programValues = programByYear[yearKey] || {};

  const applyDetailRows = (rows: BatangTubuhDetailRow[] = []) => rows.map((dr) => {
    const programs = programValues[dr.kode] || [];
    const programTotal = programs.reduce(
      (programSum, program) => programSum + (program.rincian || []).reduce((sum, rincian) => sum + coerceAmount(rincian.jumlah), 0),
      0,
    );
    const hasProgramBudget = programs.some((program) => (program.rincian || []).length > 0);
    return {
      ...dr,
      dianggarkan: hasProgramBudget
        ? programTotal
        : Object.prototype.hasOwnProperty.call(yearValues, dr.kode)
          ? Number(yearValues[dr.kode] || 0)
          : 0,
    };
  });

  return items.map((bt) => ({
    ...bt,
    detailRows: applyDetailRows(bt.detailRows || []),
    batangTubuh: (bt.batangTubuh || []).map((child) => ({
      ...child,
      detailRows: applyDetailRows(child.detailRows || []),
    })),
  }));
}

function normalizeBatangTubuhPrograms(programs: BatangTubuhProgram[] = []) {
  return programs
    .map((program) => ({
      id: String(program.id || generateId()),
      namaProgram: String(program.namaProgram || '').trim(),
      rincian: (program.rincian || [])
        .map((rincian) => ({
          id: String(rincian.id || generateId()),
          keterangan: String(rincian.keterangan || '').trim(),
          jumlah: coerceAmount(rincian.jumlah),
        }))
        .filter((rincian) => rincian.keterangan || rincian.jumlah > 0),
    }))
    .filter((program) => program.namaProgram || program.rincian.length > 0)
    .map((program, index) => ({
      ...program,
      namaProgram: program.namaProgram || `Program ${index + 1}`,
    }));
}


export const useStore = create<AppState>()(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
      userAccounts: [
        {
          id: 'admin',
          username: 'admin',
          name: 'Administrator',
          role: 'admin',
          passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
          mustChangePassword: true,
          createdAt: new Date(),
        },
        {
          id: 'bendahara',
          username: 'bendahara',
          name: 'Bendahara',
          role: 'bendahara',
          passwordHash: 'dff9cd137cab8b96431ccd81f8bb433fc71f0329eefb54bd4380b3fc3a9fc5d1',
          mustChangePassword: true,
          createdAt: new Date(),
        },
      ],
      setUserAccounts: (accounts) => set({ userAccounts: accounts }),
      
      kategoriPendapatans: [
        { id: '1', nama: 'Persembahan Minggu', kode: 'PP' },
        { id: '2', nama: 'Persembahan Khusus', kode: 'PK' },
        { id: '3', nama: 'Donasi', kode: 'DN' },
        { id: '4', nama: 'Dana Sosial', kode: 'DS' },
      ],
      addKategoriPendapatan: (kategori) =>
        set((state) => ({
          kategoriPendapatans: [...state.kategoriPendapatans, { ...kategori, id: generateId() }],
        })),
      updateKategoriPendapatan: (id, kategori) =>
        set((state) => ({
          kategoriPendapatans: state.kategoriPendapatans.map((k) =>
            k.id === id ? { ...k, ...kategori } : k
          ),
        })),
      deleteKategoriPendapatan: (id) =>
        set((state) => ({
          kategoriPendapatans: state.kategoriPendapatans.filter((k) => k.id !== id),
        })),
        
      kategoriBelanjas: [
        { id: '1', nama: 'Gaji & Honor', kode: 'GH' },
        { id: '2', nama: 'Operasional', kode: 'OP' },
        { id: '3', nama: 'Pemeliharaan', kode: 'PM' },
        { id: '4', nama: 'Diakonia', kode: 'DK' },
        { id: '5', nama: 'Komisi', kode: 'KM' },
      ],
      addKategoriBelanja: (kategori) =>
        set((state) => ({
          kategoriBelanjas: [...state.kategoriBelanjas, { ...kategori, id: generateId() }],
        })),
      updateKategoriBelanja: (id, kategori) =>
        set((state) => ({
          kategoriBelanjas: state.kategoriBelanjas.map((k) =>
            k.id === id ? { ...k, ...kategori } : k
          ),
        })),
      deleteKategoriBelanja: (id) =>
        set((state) => ({
          kategoriBelanjas: state.kategoriBelanjas.filter((k) => k.id !== id),
        })),
        
      subSeksis: [
        { id: '1', nama: 'Sekretariat', kode: 'SS' },
        { id: '2', nama: 'Kesenian', kode: 'KS' },
        { id: '3', nama: 'Persembahan', kode: 'PS' },
        { id: '4', nama: 'Penitipan Anak', kode: 'PA' },
        { id: '5', nama: 'Pemuda', kode: 'PM' },
        { id: '6', nama: 'Kaum Perempuan', kode: 'KP' },
      ],
      addSubSeksi: (subSeksi) =>
        set((state) => ({
          subSeksis: [...state.subSeksis, { ...subSeksi, id: generateId() }],
        })),

      setSubSeksis: (subSeksis) =>
        set(() => {
          const withIds = subSeksis.map((s) => ({
            ...s,
            id: (s as { id?: string; kode?: string }).id || (s as { id?: string; kode?: string }).kode || s.nama,
            anak: (s as { anak?: Array<{ id?: string; kode?: string; nama?: string }> }).anak
              ? (s as { anak?: Array<{ id?: string; kode?: string; nama?: string }> }).anak?.map((a) => ({
                  ...a,
                  id: a.id || a.kode || '',
                  kode: a.kode || '',
                  nama: a.nama || a.kode || '',
                }))
              : undefined,
            // Keep behavior, but ensure we don't break typing: if source shape
            // doesn't match BatangTubuh exactly, omit batangTubuh.
            batangTubuh: undefined,


          }));
          return { subSeksis: withIds };
        }),

      updateSubSeksi: (id, data) =>
        set((state) => ({
          subSeksis: state.subSeksis.map((s) =>
            s.id === id ? { ...s, ...data } : s
          ),
        })),
      deleteSubSeksi: (id) =>
        set((state) => ({
          subSeksis: state.subSeksis.filter((s) => s.id !== id),
        })),
        
      pemasukans: [],
      addPemasukan: (pemasukan) =>
        set((state) => {
          const year = new Date(pemasukan.tanggal).getFullYear();
          if (state.lockedYears.includes(year)) {
            throw new Error(`Tahun ${year} terkunci.`);
          }
          return {
            pemasukans: [...state.pemasukans, { ...pemasukan, id: generateId(), createdAt: new Date() }],
          };
        }),
      updatePemasukan: (id, data) =>
        set((state) => {
          const target = state.pemasukans.find((p) => p.id === id);
          if (target) {
            const targetYear = new Date(target.tanggal).getFullYear();
            const nextYear = new Date(data.tanggal ?? target.tanggal).getFullYear();
            if (state.lockedYears.includes(targetYear) || state.lockedYears.includes(nextYear)) {
              throw new Error(`Tahun ${state.lockedYears.includes(targetYear) ? targetYear : nextYear} terkunci.`);
            }
          }
          return {
            pemasukans: state.pemasukans.map((p) =>
              p.id === id ? { ...p, ...data, updatedAt: new Date() } : p
            ),
          };
        }),
      deletePemasukan: (id) =>
        set((state) => {
          const target = state.pemasukans.find((p) => p.id === id);
          if (target) {
            const year = new Date(target.tanggal).getFullYear();
            if (state.lockedYears.includes(year)) {
              throw new Error(`Tahun ${year} terkunci.`);
            }
          }
          return { pemasukans: state.pemasukans.filter((p) => p.id !== id) };
        }),
        
      pengeluarans: [],
      addPengeluaran: (pengeluaran) =>
        set((state) => {
          const year = new Date(pengeluaran.tanggal).getFullYear();
          if (state.lockedYears.includes(year)) {
            throw new Error(`Tahun ${year} terkunci.`);
          }
          return {
            pengeluarans: [...state.pengeluarans, { ...pengeluaran, id: generateId(), createdAt: new Date() }],
          };
        }),
      updatePengeluaran: (id, data) =>
        set((state) => {
          const target = state.pengeluarans.find((p) => p.id === id);
          if (target) {
            const targetYear = new Date(target.tanggal).getFullYear();
            const nextYear = new Date(data.tanggal ?? target.tanggal).getFullYear();
            if (state.lockedYears.includes(targetYear) || state.lockedYears.includes(nextYear)) {
              throw new Error(`Tahun ${state.lockedYears.includes(targetYear) ? targetYear : nextYear} terkunci.`);
            }
          }
          return {
            pengeluarans: state.pengeluarans.map((p) =>
              p.id === id ? { ...p, ...data, updatedAt: new Date() } : p
            ),
          };
        }),
      deletePengeluaran: (id) =>
        set((state) => {
          const target = state.pengeluarans.find((p) => p.id === id);
          if (target) {
            const year = new Date(target.tanggal).getFullYear();
            if (state.lockedYears.includes(year)) {
              throw new Error(`Tahun ${year} terkunci.`);
            }
          }
          return { pengeluarans: state.pengeluarans.filter((p) => p.id !== id) };
        }),
        
      realisasis: [],
      addRealisasi: (realisasi) =>
        set((state) => {
          if (state.lockedYears.includes(Number(realisasi.tahun))) {
            throw new Error(`Tahun ${realisasi.tahun} terkunci.`);
          }
          return {
            realisasis: [...state.realisasis, { ...realisasi, id: generateId(), createdAt: new Date() }],
          };
        }),
      updateRealisasi: (id, data) =>
        set((state) => {
          const target = state.realisasis.find((r) => r.id === id);
          if (target) {
            const targetYear = Number(target.tahun);
            const nextYear = Number(data.tahun ?? target.tahun);
            if (state.lockedYears.includes(targetYear) || state.lockedYears.includes(nextYear)) {
              throw new Error(`Tahun ${state.lockedYears.includes(targetYear) ? targetYear : nextYear} terkunci.`);
            }
          }
          return {
            realisasis: state.realisasis.map((r) =>
              r.id === id ? { ...r, ...data } : r
            ),
          };
        }),
        
      // Master kode anggaran (DATA BASE2)
      kodeAnggarans: [],
      setKodeAnggarans: (items) => set({ kodeAnggarans: normalizeKodeAnggaranItems(items) }),

      addKodeAnggaran: (item) =>
        set((state) => {
          const kodeAnggaran = String(item.kodeAnggaran ?? '').trim();
          const mataAnggaran = String(item.mataAnggaran ?? '').trim();
          if (!kodeAnggaran || !mataAnggaran) {
            throw new Error('Kode Anggaran dan Mata Anggaran wajib diisi');
          }
          if (!isValidRootBudgetCode(kodeAnggaran)) {
            throw new Error('Kode anggaran harus diawali I atau II.');
          }
          const exists = state.kodeAnggarans.some((k) => k.kodeAnggaran === kodeAnggaran);
          if (exists) {
            throw new Error(`Kode anggaran sudah ada: ${kodeAnggaran}`);
          }
          return {
            kodeAnggarans: normalizeKodeAnggaranItems([...state.kodeAnggarans, { ...item, kodeAnggaran, mataAnggaran }]),
          };
        }),

      updateKodeAnggaran: (kodeAnggaran, data) =>
        set((state) => {
          const currentKode = String(kodeAnggaran ?? '').trim();
          const nextKode = String(data.kodeAnggaran ?? currentKode).trim();
          const nextMataAnggaran = String(data.mataAnggaran ?? '').trim();
          if (!currentKode || !nextKode) throw new Error('Kode anggaran wajib diisi');
          if (!isValidRootBudgetCode(nextKode)) {
            throw new Error('Kode anggaran harus diawali I atau II.');
          }
          if (!nextMataAnggaran) {
            throw new Error('Mata Anggaran wajib diisi.');
          }
          const duplicate = state.kodeAnggarans.some((k) => k.kodeAnggaran === nextKode && k.kodeAnggaran !== currentKode);
          if (duplicate) {
            throw new Error(`Kode anggaran sudah ada: ${nextKode}`);
          }

          const updated = normalizeKodeAnggaranItems(state.kodeAnggarans.map((k) =>
            k.kodeAnggaran === currentKode
              ? { ...k, ...data, kodeAnggaran: nextKode, mataAnggaran: nextMataAnggaran }
              : k
          ));

          // Update semua transaksi lama yang memakai kode anggaran ini
          const doorscrieftTransaksis = state.doorscrieftTransaksis.map((t) =>
            t.kodeAnggaran === currentKode
              ? {
                  ...t,
                  kodeAnggaran: nextKode,
                  mataAnggaran: nextMataAnggaran,
                  updatedAt: new Date(),
                }
              : t
          );

          const updateDetailRows = (rows: BatangTubuhDetailRow[] = []) => rows.map((row) =>
            row.kode === currentKode
              ? { ...row, kode: nextKode, nama: nextMataAnggaran, MataAnggaran: nextMataAnggaran }
              : row
          );
          const batangTubuhs = state.batangTubuhs.map((group) => ({
            ...group,
            detailRows: updateDetailRows(group.detailRows || []),
            batangTubuh: (group.batangTubuh || []).map((bt) => ({
              ...bt,
              detailRows: updateDetailRows(bt.detailRows || []),
            })),
          }));

          const batangTubuhAnggaranByYear = Object.fromEntries(
            Object.entries(state.batangTubuhAnggaranByYear).map(([year, values]) => {
              if (!Object.prototype.hasOwnProperty.call(values, currentKode)) return [year, values];
              const nextValues = { ...values, [nextKode]: values[currentKode] };
              delete nextValues[currentKode];
              return [year, nextValues];
            }),
          );
          const batangTubuhProgramByYear = Object.fromEntries(
            Object.entries(state.batangTubuhProgramByYear).map(([year, values]) => {
              if (!Object.prototype.hasOwnProperty.call(values, currentKode)) return [year, values];
              const nextValues = { ...values, [nextKode]: values[currentKode] };
              delete nextValues[currentKode];
              return [year, nextValues];
            }),
          );

          return {
            kodeAnggarans: updated,
            doorscrieftTransaksis,
            batangTubuhs,
            batangTubuhAnggaranByYear,
            batangTubuhProgramByYear,
          };
        }),

      deleteKodeAnggaran: (kodeAnggaran) =>
        set((state) => {
          const nextKode = String(kodeAnggaran ?? '').trim();
          const usedInDoorscrieft = state.doorscrieftTransaksis.some((t) => t.kodeAnggaran === nextKode);
          const usedInBatangTubuh = state.batangTubuhs.some((group) =>
            (group.detailRows || []).some((row) => row.kode === nextKode) ||
            (group.batangTubuh || []).some((bt) => (bt.detailRows || []).some((row) => row.kode === nextKode))
          );
          if (usedInDoorscrieft || usedInBatangTubuh) {
            throw new Error(`Kode ${nextKode} masih dipakai di ${usedInDoorscrieft ? 'Doorscrieft' : 'Batang Tubuh'}.`);
          }

          return {
            kodeAnggarans: state.kodeAnggarans.filter((k) => k.kodeAnggaran !== nextKode),
          };
        }),


      // Batang Tubuh
      batangTubuhs: [],
      setBatangTubuhs: (items) => {
        const normalize = (rawItems: unknown[]): BatangTubuhItem[] => {
          const report: { total: number; fixed: number; errors: Array<{ group: number; batangTubuh: number; row: number; reason: string; raw: unknown }> } = {
            total: rawItems.length || 0,
            fixed: 0,
            errors: [],
          };
          const out: BatangTubuhItem[] = rawItems.filter(isRecord).map((g, gi) => {
            const groupBase = g as Partial<BatangTubuhItem>;
            const batangTubuh = Array.isArray(g.batangTubuh) ? g.batangTubuh : [];
            const normalizedGroup: BatangTubuhItem = {
              ...groupBase,
              kode: String(groupBase.kode || ''),
              nama: String(groupBase.nama || ''),
              batangTubuh: [],
            };
            normalizedGroup.batangTubuh = batangTubuh.filter(isRecord).map((bt, bi) => {
              const batangTubuhBase = bt as Partial<NonNullable<BatangTubuhItem['batangTubuh']>[number]>;
              const detailRows = Array.isArray(bt.detailRows) ? bt.detailRows : [];
              const normBt: NonNullable<BatangTubuhItem['batangTubuh']>[number] = {
                ...batangTubuhBase,
                kode: String(batangTubuhBase.kode || ''),
                nama: String(batangTubuhBase.nama || ''),
                detailRows: [],
              };
              normBt.detailRows = detailRows.filter(isRecord).map((dr, dri) => {
                const detailBase = dr as Partial<BatangTubuhDetailRow>;
                const kode = readStringField(dr, ['kode', 'Kode', 'kode_anggaran']);
                const nama = readStringField(dr, ['nama', 'MataAnggaran', 'mata_anggaran', 'description']);
                const dianggarkan = parseBudgetValue(dr.dianggarkan ?? dr.Dianggarkan ?? dr.amount ?? dr.nilai);
                if (!kode) report.errors.push({ group: gi, batangTubuh: bi, row: dri, reason: 'missing kode', raw: dr });
                return { ...detailBase, kode, nama, dianggarkan, realisasi: Number(detailBase.realisasi || 0) };
              });
              return normBt;
            });
            return normalizedGroup;
          });
          try {
            if (report.errors.length > 0) {
              const key = `bt_validation_${Date.now()}`;
              try {
                window.localStorage.setItem(key, JSON.stringify(report));
              } catch (error) {
                console.warn('[BatangTubuh] Failed to persist validation report:', error);
              }
              console.warn('[BatangTubuh] Validation issues found, saved report to localStorage key=', key, report.errors.slice(0,5));
            }
          } catch (error) {
            console.warn('[BatangTubuh] Validation report failed:', error);
          }
          return out;
        };
        try {
          const normalized = normalize(items);
          set({ batangTubuhs: normalized });
        } catch (e) {
          console.error('[setBatangTubuhs] failed to normalize data:', e);
          set({ batangTubuhs: items });
        }
      },
      batangTubuhAnggaranByYear: {},
      setBatangTubuhAnggaranByYear: (items) => set((state) => {
        for (const year of state.lockedYears) {
          const key = String(year);
          const current = JSON.stringify(state.batangTubuhAnggaranByYear[key] || {});
          const next = JSON.stringify(items[key] || {});
          if (current !== next) {
            throw new Error(`Tahun ${year} terkunci.`);
          }
        }
        return { batangTubuhAnggaranByYear: items };
      }),
      setBatangTubuhAnggaranForYear: (tahun, kode, dianggarkan) =>
        set((state) => {
          if (state.lockedYears.includes(Number(tahun))) {
            throw new Error(`Tahun ${tahun} terkunci.`);
          }
          return {
            batangTubuhAnggaranByYear: {
              ...state.batangTubuhAnggaranByYear,
              [String(tahun)]: {
                ...(state.batangTubuhAnggaranByYear[String(tahun)] || {}),
                [kode]: Number(dianggarkan || 0),
              },
            },
          };
        }),
      batangTubuhProgramByYear: {},
      setBatangTubuhProgramByYear: (items) => set((state) => {
        for (const year of state.lockedYears) {
          const key = String(year);
          const current = JSON.stringify(state.batangTubuhProgramByYear[key] || {});
          const next = JSON.stringify(items[key] || {});
          if (current !== next) {
            throw new Error(`Tahun ${year} terkunci.`);
          }
        }
        return { batangTubuhProgramByYear: items, hasUnsavedChanges: true };
      }),
      setBatangTubuhProgramsForKode: (tahun, kode, programs) =>
        set((state) => {
          if (state.lockedYears.includes(Number(tahun))) {
            throw new Error(`Tahun ${tahun} terkunci.`);
          }
          const cleanKode = String(kode || '').trim();
          const normalizedPrograms = normalizeBatangTubuhPrograms(programs);
          const total = normalizedPrograms.reduce(
(programSum, program) => programSum + (program.rincian || []).reduce((sum, rincian) => sum + coerceAmount(rincian.jumlah), 0),
            0,
          );
          return {
            batangTubuhProgramByYear: {
              ...state.batangTubuhProgramByYear,
              [String(tahun)]: {
                ...(state.batangTubuhProgramByYear[String(tahun)] || {}),
                [cleanKode]: normalizedPrograms,
              },
            },
            batangTubuhAnggaranByYear: {
              ...state.batangTubuhAnggaranByYear,
              [String(tahun)]: {
                ...(state.batangTubuhAnggaranByYear[String(tahun)] || {}),
                [cleanKode]: total,
              },
            },
            hasUnsavedChanges: true,
          };
        }),
      resetAllDianggarkan: () => set((state) => {
        if (state.lockedYears.length > 0) {
          throw new Error(`Tidak bisa reset anggaran karena ada tahun terkunci: ${state.lockedYears.join(', ')}.`);
        }
        const cleared = (state.batangTubuhs || []).map((g) => ({
          ...g,
          batangTubuh: (g.batangTubuh || []).map((bt) => ({
            ...bt,
            detailRows: (bt.detailRows || []).map((dr) => ({ ...dr, dianggarkan: 0 })),
          })),
        }));
        return { batangTubuhs: cleared, batangTubuhAnggaranByYear: {}, batangTubuhProgramByYear: {}, hasUnsavedChanges: true };
      }),


      // Transaksi doorscrieft
      doorscrieftTransaksis: [],
      setDoorscrieftTransaksis: (transaksis) => set((state) => {
        const lockedRows = (rows: DoorscrieftRowInput[]) => rows
          .filter((row) => state.lockedYears.includes(new Date(row.tanggal).getFullYear()))
          .map((row) => ({ ...row, tanggal: new Date(row.tanggal).toISOString() }))
          .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        if (state.lockedYears.length > 0 && JSON.stringify(lockedRows(state.doorscrieftTransaksis)) !== JSON.stringify(lockedRows(transaksis))) {
          throw new Error(`Tahun terkunci tidak bisa diubah: ${state.lockedYears.join(', ')}.`);
        }
        return { doorscrieftTransaksis: transaksis };
      }),

      addDoorscrieftTransaksi: (transaksi, options) =>
        set((state) => {
          const year = new Date(transaksi.tanggal).getFullYear();
          if (state.lockedYears.includes(year)) {
            throw new Error(`Tahun ${year} terkunci.`);
          }
          const hit = state.kodeAnggarans.find((k) => k.kodeAnggaran === transaksi.kodeAnggaran);
          if (!hit) {
            throw new Error(`Kode anggaran tidak valid: ${transaksi.kodeAnggaran}`);
          }
          // Use provided lembarId, or assign to the most recent one
          const lembarId = (transaksi as { lembarId?: string | null }).lembarId || (() => {
            const existingLembarIds = [...new Set(state.doorscrieftTransaksis.map((t) => t.lembarId).filter(Boolean))];
            return existingLembarIds.length > 0 ? existingLembarIds[existingLembarIds.length - 1] : generateId();
          })();

          const nextId = (transaksi as { id?: string }).id || generateId();

          return {
            doorscrieftTransaksis: (() => {
              const newItem = {
                ...transaksi,
                id: nextId,
                createdAt: new Date(),
                lembarId,
                // mataAnggaran dipaksa mengikuti master
                mataAnggaran: hit.mataAnggaran,
              };
              const insertBeforeId = options?.insertBeforeId;
              if (insertBeforeId) {
                const idx = state.doorscrieftTransaksis.findIndex((t) => t.id === insertBeforeId);
                if (idx >= 0) {
                  const copy = [...state.doorscrieftTransaksis];
                  copy.splice(idx, 0, newItem);
                  return copy;
                }
              }
              return [...state.doorscrieftTransaksis, newItem];
            })(),
          };
        }),


      updateDoorscrieftTransaksi: (id, data) =>
        set((state) => {
          const target = state.doorscrieftTransaksis.find((t) => t.id === id);
          if (!target) return state;
          const targetYear = new Date(target.tanggal).getFullYear();
          const nextYear = new Date(data.tanggal || target.tanggal).getFullYear();
          if (state.lockedYears.includes(targetYear) || state.lockedYears.includes(nextYear)) {
            throw new Error(`Tahun ${state.lockedYears.includes(targetYear) ? targetYear : nextYear} terkunci.`);
          }

          const nextKode = data.kodeAnggaran ?? target.kodeAnggaran;
          const hit = state.kodeAnggarans.find((k) => k.kodeAnggaran === nextKode);
          if (!hit) {
            throw new Error(`Kode anggaran tidak valid: ${nextKode}`);
          }

          return {
            doorscrieftTransaksis: state.doorscrieftTransaksis.map((t) =>
              t.id === id
                ? {
                    ...t,
                    ...data,
                    kodeAnggaran: nextKode,
                    mataAnggaran: hit.mataAnggaran,
                    updatedAt: new Date(),
                  }
                : t
            ),

          };
        }),


      deleteDoorscrieftTransaksi: (id) =>
        set((state) => {
          const target = state.doorscrieftTransaksis.find((t) => t.id === id);
          if (target) {
            const year = new Date(target.tanggal).getFullYear();
            if (state.lockedYears.includes(year)) {
              throw new Error(`Tahun ${year} terkunci.`);
            }
          }
          return {
            doorscrieftTransaksis: state.doorscrieftTransaksis.filter((t) => t.id !== id),
          };
        }),



      tahunAktif: new Date().getFullYear(),
      setTahunAktif: (tahun) => set({ tahunAktif: tahun }),
      lockedYears: [],
      lockYear: (tahun) =>
        set((state) => ({
          lockedYears: Array.from(new Set([...state.lockedYears, Number(tahun)])).sort((a, b) => a - b),
        })),
      unlockYear: (tahun) =>
        set((state) => ({
          lockedYears: state.lockedYears.filter((year) => year !== Number(tahun)),
        })),
      isYearLocked: (tahun) => get().lockedYears.includes(Number(tahun)),

      selectedBulan: new Date().getMonth() + 1,
      setSelectedBulan: (bulan) => set({ selectedBulan: bulan }),

      setupCompleted: false,
      setSetupCompleted: (completed) => set({ setupCompleted: completed }),
      organizationLevel: 'jemaat',
      setOrganizationLevel: (level) => set({ organizationLevel: level }),
      namaJemaat: '',
      setNamaJemaat: (nama) => set({ namaJemaat: nama }),
      kopGereja: 'Gereja Protestan Maluku',
      setKopGereja: (nama) => set({ kopGereja: nama }),
      kopKlas: '',
      setKopKlas: (nama) => set({ kopKlas: nama }),
      penandatanganKiriJabatan: 'Ketua Majelis Jemaat',
      setPenandatanganKiriJabatan: (jabatan) => set({ penandatanganKiriJabatan: jabatan }),
      penandatanganKiriNama: '',
      setPenandatanganKiriNama: (nama) => set({ penandatanganKiriNama: nama }),
      penandatanganKananJabatan: 'Bendahara Jemaat',
      setPenandatanganKananJabatan: (jabatan) => set({ penandatanganKananJabatan: jabatan }),
      penandatanganKananNama: '',
      setPenandatanganKananNama: (nama) => set({ penandatanganKananNama: nama }),
      appName: 'Aplikasi Keuangan',
      setAppName: (nama) => set({ appName: nama }),
      appSubtitle: '',
      setAppSubtitle: (nama) => set({ appSubtitle: nama }),
      loginBackgroundImage: null,
      setLoginBackgroundImage: (image) => set({ loginBackgroundImage: image }),
      resetLoginBackgroundImage: () => set({ loginBackgroundImage: null }),
      adminUsername: 'admin',
      adminPassword: 'admin123',
      adminPasswordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
      adminRecoveryCodeHash: '',
      adminRecoveryCodeCreatedAt: null,
      setAdminCredentials: (username, password) => set({ adminUsername: username, adminPassword: password }),
      setAdminCredentialsHash: (username, passwordHash) =>
        set((state) => ({
          adminUsername: username,
          adminPassword: '',
          adminPasswordHash: passwordHash,
          userAccounts: state.userAccounts.map((account) =>
            account.role === 'admin'
              ? { ...account, username, passwordHash, mustChangePassword: false, updatedAt: new Date() }
              : account
          ),
        })),
      setAdminRecoveryCodeHash: (recoveryCodeHash, createdAt = new Date()) => set({ adminRecoveryCodeHash: recoveryCodeHash, adminRecoveryCodeCreatedAt: createdAt }),
      guestLoginEnabled: false,
      setGuestLoginEnabled: (enabled) => set({ guestLoginEnabled: enabled }),
      activeProjectPath: null,
      setActiveProjectPath: (path) => set({ activeProjectPath: path }),
      lastSavedAt: null,
      setLastSavedAt: (date) => set({ lastSavedAt: date }),
      hasUnsavedChanges: false,
      setHasUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),
      auditLogs: [],
      addAuditLog: (action, entity, detail = '', entityId = '') =>
        set((state) => ({
          auditLogs: [
            {
              id: generateId(),
              userId: state.user?.id || state.adminUsername || 'system',
              action,
              entity,
              entityId,
              newValue: detail,
              createdAt: new Date(),
            },
            ...state.auditLogs,
          ].slice(0, 300),
        })),
      clearAuditLogs: () => set({ auditLogs: [] }),
    }),
);


// --- Auto-save: persist relevant state to localStorage on every change ---
const STORAGE_KEY = 'keuangan-gereja-autosave';

// Rehidrasi tanggal dari snapshot/localStorage; nilai kosong/rusak tidak boleh
// menjadi Invalid Date yang memicu "Tanggal tidak valid" di seluruh aplikasi.
function safeRestoredDate(value: unknown) {
  if (!value || value === '') return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Restore from localStorage on module load
const loadFromStorage = (): Partial<AppState> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Re-hydrate Date fields
    const parsedAny = parsed as unknown as Record<string, unknown>;

    if (Array.isArray(parsedAny.doorscrieftTransaksis)) {
      (parsedAny as Record<string, unknown>).doorscrieftTransaksis = (parsedAny.doorscrieftTransaksis as unknown[]).map((t: unknown) => {

        if (typeof t !== 'object' || t === null) return t;
        const r = t as { tanggal?: unknown; createdAt?: unknown; updatedAt?: unknown } & Record<string, unknown>;
        return {
...r,
          tanggal: safeRestoredDate(r.tanggal),
          createdAt: safeRestoredDate(r.createdAt),
          updatedAt: r.updatedAt ? new Date(String(r.updatedAt)) : undefined,
          attachments: Array.isArray(r.attachments)
            ? r.attachments.map((attachment: Record<string, unknown>) => ({
                ...attachment,
                createdAt: attachment.createdAt ? new Date(String(attachment.createdAt)) : new Date(),
              }))
            : undefined,
        };
      });
    }

    if (Array.isArray(parsed.kodeAnggarans)) {
      // no Date fields, keep as-is
    }
    if (Array.isArray((parsedAny as Record<string, unknown>).subSeksis)) {
      (parsedAny as Record<string, unknown>).subSeksis = ((parsedAny as Record<string, unknown>).subSeksis as unknown[]).map((s: unknown) => {

        if (typeof s !== 'object' || s === null) return s;
        const r = s as { createdAt?: unknown; updatedAt?: unknown } & Record<string, unknown>;
        return {
          ...r,
          createdAt: r.createdAt ? new Date(String(r.createdAt)) : undefined,
          updatedAt: r.updatedAt ? new Date(String(r.updatedAt)) : undefined,
        };
      });
    }
    if (Array.isArray(parsedAny.batangTubuhs)) {
      parsedAny.batangTubuhs = (parsedAny.batangTubuhs as unknown[]).map((b: unknown) => {
        if (typeof b !== 'object' || b === null) return b;
        const r = b as { createdAt?: unknown } & Record<string, unknown>;
        return {
          ...r,
          createdAt: r.createdAt ? new Date(String(r.createdAt)) : undefined,
        };
      });
    }
    if (Array.isArray(parsedAny.auditLogs)) {
      parsedAny.auditLogs = (parsedAny.auditLogs as unknown[]).map((item: unknown) => {
        if (typeof item !== 'object' || item === null) return item;
        const r = item as { createdAt?: unknown } & Record<string, unknown>;
        return {
          ...r,
          createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date(),
        };
      });
    }
    if (Array.isArray(parsedAny.userAccounts)) {
      parsedAny.userAccounts = (parsedAny.userAccounts as unknown[])
        .map(normalizeUserAccount)
        .filter(Boolean);
    }
    if (typeof parsedAny.user === 'object' && parsedAny.user !== null) {
      const savedUser = parsedAny.user as User;
      parsedAny.user = {
        ...savedUser,
        role: normalizeRuntimeRole(savedUser.role),
        createdAt: savedUser.createdAt ? new Date(String(savedUser.createdAt)) : new Date(),
      };
    }
    if (parsedAny.lastSavedAt) {
      parsedAny.lastSavedAt = new Date(String(parsedAny.lastSavedAt));
    }

    return parsed;

  } catch {
    return {};
  }
};

const saved = loadFromStorage();
if (saved.doorscrieftTransaksis) {
  useStore.setState({ doorscrieftTransaksis: saved.doorscrieftTransaksis });
}
if (saved.kodeAnggarans) {
  useStore.setState({ kodeAnggarans: saved.kodeAnggarans });
}
if (saved.subSeksis) {
  useStore.setState({ subSeksis: saved.subSeksis });
}
if (saved.batangTubuhs) {
  useStore.setState({ batangTubuhs: saved.batangTubuhs });
}
if (saved.batangTubuhAnggaranByYear) {
  useStore.setState({ batangTubuhAnggaranByYear: saved.batangTubuhAnggaranByYear });
}
if ((saved as Partial<AppState>).batangTubuhProgramByYear) {
  useStore.setState({ batangTubuhProgramByYear: (saved as Partial<AppState>).batangTubuhProgramByYear });
}
if (saved.namaJemaat) {
  useStore.setState({ namaJemaat: saved.namaJemaat });
}
if (saved.tahunAktif) {
  useStore.setState({ tahunAktif: saved.tahunAktif });
}
if (Array.isArray((saved as Partial<AppState>).lockedYears)) {
  useStore.setState({ lockedYears: (saved as Partial<AppState>).lockedYears });
}
if ((saved as Partial<AppState>).setupCompleted !== undefined) {
  useStore.setState({ setupCompleted: !!(saved as Partial<AppState>).setupCompleted });
}
if ((saved as Partial<AppState>).organizationLevel === 'klasis' || (saved as Partial<AppState>).organizationLevel === 'jemaat') {
  useStore.setState({ organizationLevel: (saved as Partial<AppState>).organizationLevel });
}
if (saved.kopGereja) {
  useStore.setState({ kopGereja: saved.kopGereja });
}
if (saved.kopKlas) {
  useStore.setState({ kopKlas: saved.kopKlas });
}
if ((saved as Partial<AppState>).penandatanganKiriJabatan) {
  useStore.setState({ penandatanganKiriJabatan: (saved as Partial<AppState>).penandatanganKiriJabatan });
}
if ((saved as Partial<AppState>).penandatanganKiriNama !== undefined) {
  useStore.setState({ penandatanganKiriNama: (saved as Partial<AppState>).penandatanganKiriNama || '' });
}
if ((saved as Partial<AppState>).penandatanganKananJabatan) {
  useStore.setState({ penandatanganKananJabatan: (saved as Partial<AppState>).penandatanganKananJabatan });
}
if ((saved as Partial<AppState>).penandatanganKananNama !== undefined) {
  useStore.setState({ penandatanganKananNama: (saved as Partial<AppState>).penandatanganKananNama || '' });
}
if (saved.appName) {
  useStore.setState({ appName: saved.appName });
}
if (saved.appSubtitle) {
  useStore.setState({ appSubtitle: saved.appSubtitle });
}
if (Object.prototype.hasOwnProperty.call(saved, 'loginBackgroundImage')) {
  useStore.setState({ loginBackgroundImage: saved.loginBackgroundImage ?? null });
}
if (saved.adminUsername && saved.adminPassword !== undefined) {
  useStore.setState({ adminUsername: saved.adminUsername, adminPassword: saved.adminPassword });
}
if ((saved as Partial<AppState>).adminPasswordHash) {
  useStore.setState({ adminPasswordHash: (saved as Partial<AppState>).adminPasswordHash });
}
if ((saved as Partial<AppState>).adminRecoveryCodeHash) {
  useStore.setState({ adminRecoveryCodeHash: (saved as Partial<AppState>).adminRecoveryCodeHash || '' });
}
if ((saved as Partial<AppState>).adminRecoveryCodeCreatedAt) {
  useStore.setState({ adminRecoveryCodeCreatedAt: new Date(String((saved as Partial<AppState>).adminRecoveryCodeCreatedAt)) });
}
if (Array.isArray((saved as Partial<AppState>).userAccounts)) {
  useStore.setState({ userAccounts: (saved as Partial<AppState>).userAccounts });
}
if ((saved as Partial<AppState>).guestLoginEnabled !== undefined) {
  useStore.setState({ guestLoginEnabled: !!(saved as Partial<AppState>).guestLoginEnabled });
}
if ((saved as Partial<AppState>).activeProjectPath !== undefined) {
  useStore.setState({ activeProjectPath: (saved as Partial<AppState>).activeProjectPath ?? null });
}
if ((saved as Partial<AppState>).lastSavedAt !== undefined) {
  useStore.setState({ lastSavedAt: (saved as Partial<AppState>).lastSavedAt ?? null });
}
if (Array.isArray((saved as Partial<AppState>).auditLogs)) {
  useStore.setState({ auditLogs: (saved as Partial<AppState>).auditLogs });
}

// Subscribe to store changes and persist to localStorage
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((state) => {
  const data = {
    doorscrieftTransaksis: state.doorscrieftTransaksis,
    kodeAnggarans: state.kodeAnggarans,
    subSeksis: state.subSeksis,
    batangTubuhs: state.batangTubuhs,
    batangTubuhAnggaranByYear: state.batangTubuhAnggaranByYear,
    batangTubuhProgramByYear: state.batangTubuhProgramByYear,
    setupCompleted: state.setupCompleted,
    organizationLevel: state.organizationLevel,
    namaJemaat: state.namaJemaat,
    tahunAktif: state.tahunAktif,
    lockedYears: state.lockedYears,
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
    userAccounts: state.userAccounts,
    guestLoginEnabled: state.guestLoginEnabled,
    activeProjectPath: state.activeProjectPath,
    lastSavedAt: state.lastSavedAt,
    auditLogs: state.auditLogs,
  };
  // Debounce saves to avoid excessive writes
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable — silently skip
    }
  }, 300);
});

function buildDirtySignature(state: AppState) {
  return JSON.stringify({
    kategoriPendapatans: state.kategoriPendapatans,
    kategoriBelanjas: state.kategoriBelanjas,
    pemasukans: state.pemasukans,
    pengeluarans: state.pengeluarans,
    realisasis: state.realisasis,
    batangTubuhAnggaranByYear: state.batangTubuhAnggaranByYear,
    batangTubuhProgramByYear: state.batangTubuhProgramByYear,
    doorscrieftTransaksis: state.doorscrieftTransaksis,
  });
}

let dirtySignature = buildDirtySignature(useStore.getState());
useStore.subscribe((state) => {
  const nextSignature = buildDirtySignature(state);
  if (nextSignature === dirtySignature) return;
  dirtySignature = nextSignature;
  if (!state.hasUnsavedChanges) {
    useStore.setState({ hasUnsavedChanges: true });
  }
});


