import { create } from 'zustand';
import type { User, KategoriPendapatan, KategoriBelanja, SubSeksi, Pemasukan, Pengeluaran, RealisasiAnggaran, KodeAnggaranItem, DoorscrieftRowInput, BatangTubuhItem } from '@/types';
import { generateId } from '@/lib/utils';
import { ensureTxId } from '@/lib/uuid';
import { addPendingUuid, removePendingUuid as removePendingUuidFromOutbox } from '@/lib/syncOutbox';




interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  
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

  // Transaksi doorscrieft (DOORSCRIEFT2)
  doorscrieftTransaksis: DoorscrieftRowInput[];
  setDoorscrieftTransaksis: (transaksis: DoorscrieftRowInput[]) => void;
  addDoorscrieftTransaksi: (transaksi: Omit<DoorscrieftRowInput, 'id' | 'createdAt' | 'created_at' | 'updated_at'>) => void;
  updateDoorscrieftTransaksi: (id: string, data: Partial<DoorscrieftRowInput>) => void;
  deleteDoorscrieftTransaksi: (id: string) => void;


  // Tahun
  tahunAktif: number;
  setTahunAktif: (tahun: number) => void;

  // Bulan filter (untuk halaman bulanan)
  selectedBulan: number; // 1-12
  setSelectedBulan: (bulan: number) => void;

  // Church settings
  namaJemaat: string;
  setNamaJemaat: (nama: string) => void;
  kopGereja: string;
  setKopGereja: (nama: string) => void;
  kopKlas: string;
  setKopKlas: (nama: string) => void;
  appName: string;
  setAppName: (nama: string) => void;
  appSubtitle: string;
  setAppSubtitle: (nama: string) => void;
  loginBackgroundImage: string | null;
  setLoginBackgroundImage: (image: string | null) => void;
  resetLoginBackgroundImage: () => void;
  adminUsername: string;
  adminPassword: string;
  setAdminCredentials: (username: string, password: string) => void;

  // Clear synced Excel data (keeps default sample data)
  clearSyncedData: () => void;

  // --- Sync Online (Supabase) ---
  markTransactionsSynced: (ids: string[]) => void;
  markTransactionsFailed: (ids: string[]) => void;
  removePendingUuid: (uuid: string) => void;
}


export const useStore = create<AppState>()(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
      
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
        
      pemasukans: [

        {
          id: '1',
          tanggal: new Date('2025-01-05'),
          kategoriId: '1',
          subKategoriId: '1',
          keterangan: 'Persembahan Minggu pertama Januari',
          jumlah: 15000000,
          sumberDana: 'Kas Gereja',
          createdBy: 'admin',
          createdAt: new Date('2025-01-05'),
        },
        {
          id: '2',
          tanggal: new Date('2025-01-12'),
          kategoriId: '1',
          subKategoriId: '1',
          keterangan: 'Persembahan Minggu kedua Januari',
          jumlah: 12500000,
          sumberDana: 'Kas Gereja',
          createdBy: 'admin',
          createdAt: new Date('2025-01-12'),
        },
        {
          id: '3',
          tanggal: new Date('2025-01-19'),
          kategoriId: '1',
          subKategoriId: '1',
          keterangan: 'Persembahan Minggu ketiga Januari',
          jumlah: 18000000,
          sumberDana: 'Kas Gereja',
          createdBy: 'admin',
          createdAt: new Date('2025-01-19'),
        },
      ],
      addPemasukan: (pemasukan) =>
        set((state) => ({
          pemasukans: [...state.pemasukans, { ...pemasukan, id: generateId(), createdAt: new Date() }],
        })),
      updatePemasukan: (id, data) =>
        set((state) => ({
          pemasukans: state.pemasukans.map((p) =>
            p.id === id ? { ...p, ...data, updatedAt: new Date() } : p
          ),
        })),
      deletePemasukan: (id) =>
        set((state) => ({
          pemasukans: state.pemasukans.filter((p) => p.id !== id),
        })),
        
      pengeluarans: [
        {
          id: '1',
          tanggal: new Date('2025-01-08'),
          kategoriId: '1',
          subKategoriId: '1',
          keterangan: 'Honorarium Pendeta Januari',
          jumlah: 8000000,
          penanggungJawab: 'Pdt. John Doe',
          createdBy: 'admin',
          createdAt: new Date('2025-01-08'),
        },
        {
          id: '2',
          tanggal: new Date('2025-01-15'),
          kategoriId: '2',
          subKategoriId: '1',
          keterangan: 'Listrik dan Air Januari',
          jumlah: 2500000,
          penanggungJawab: 'Bendahara',
          createdBy: 'admin',
          createdAt: new Date('2025-01-15'),
        },
      ],
      addPengeluaran: (pengeluaran) =>
        set((state) => ({
          pengeluarans: [...state.pengeluarans, { ...pengeluaran, id: generateId(), createdAt: new Date() }],
        })),
      updatePengeluaran: (id, data) =>
        set((state) => ({
          pengeluarans: state.pengeluarans.map((p) =>
            p.id === id ? { ...p, ...data, updatedAt: new Date() } : p
          ),
        })),
      deletePengeluaran: (id) =>
        set((state) => ({
          pengeluarans: state.pengeluarans.filter((p) => p.id !== id),
        })),
        
      realisasis: [],
      addRealisasi: (realisasi) =>
        set((state) => ({
          realisasis: [...state.realisasis, { ...realisasi, id: generateId(), createdAt: new Date() }],
        })),
      updateRealisasi: (id, data) =>
        set((state) => ({
          realisasis: state.realisasis.map((r) =>
            r.id === id ? { ...r, ...data } : r
          ),
        })),
        
      // Master kode anggaran (DATA BASE2)
      kodeAnggarans: [],
      setKodeAnggarans: (items) => set({ kodeAnggarans: items }),

      addKodeAnggaran: (item) =>
        set((state) => {
          const kodeAnggaran = String(item.kodeAnggaran ?? '').trim();
          const mataAnggaran = String(item.mataAnggaran ?? '').trim();
          if (!kodeAnggaran || !mataAnggaran) {
            throw new Error('Kode Anggaran dan Mata Anggaran wajib diisi');
          }
          const exists = state.kodeAnggarans.some((k) => k.kodeAnggaran === kodeAnggaran);
          if (exists) {
            throw new Error(`Kode anggaran sudah ada: ${kodeAnggaran}`);
          }
          return {
            kodeAnggarans: [...state.kodeAnggarans, { kodeAnggaran, mataAnggaran }],
          };
        }),

      updateKodeAnggaran: (kodeAnggaran, data) =>
        set((state) => {
          const nextKode = String(kodeAnggaran ?? '').trim();
          if (!nextKode) throw new Error('Kode anggaran wajib diisi');

          const updated = state.kodeAnggarans.map((k) =>
            k.kodeAnggaran === nextKode
              ? { ...k, ...data, kodeAnggaran: nextKode }
              : k
          );

          // Mata anggaran baru (hasil dari update)
          const hit = updated.find((k) => k.kodeAnggaran === nextKode);
          const mataAnggaranBaru = hit?.mataAnggaran ?? '';

          // Update semua transaksi lama yang memakai kode anggaran ini
          const doorscrieftTransaksis = state.doorscrieftTransaksis.map((t) =>
            t.kodeAnggaran === nextKode
              ? {
                  ...t,
                  ...data,
                  kodeAnggaran: nextKode,
                  mataAnggaran: mataAnggaranBaru,
                  updatedAt: new Date(),
                }
              : t
          );

          return {
            kodeAnggarans: updated,
            doorscrieftTransaksis,
          };
        }),

      deleteKodeAnggaran: (kodeAnggaran) =>
        set((state) => {
          const nextKode = String(kodeAnggaran ?? '').trim();

          // Pilihan aman: jangan hapus transaksi, tapi set mataAnggaran menjadi ''
          const doorscrieftTransaksis = state.doorscrieftTransaksis.map((t) =>
            t.kodeAnggaran === nextKode
              ? {
                  ...t,
                  mataAnggaran: '',
                  updatedAt: new Date(),
                }
              : t
          );

          return {
            kodeAnggarans: state.kodeAnggarans.filter((k) => k.kodeAnggaran !== nextKode),
            doorscrieftTransaksis,
          };
        }),


      // Batang Tubuh
      batangTubuhs: [],
      setBatangTubuhs: (items) => set({ batangTubuhs: items }),


      // Transaksi doorscrieft
      doorscrieftTransaksis: [],
      setDoorscrieftTransaksis: (transaksis) => set({ doorscrieftTransaksis: transaksis }),

      addDoorscrieftTransaksi: (transaksi) =>
        set((state) => {
          const hit = state.kodeAnggarans.find((k) => k.kodeAnggaran === transaksi.kodeAnggaran);
          if (!hit) {
            throw new Error(`Kode anggaran tidak valid: ${transaksi.kodeAnggaran}`);
          }
          // Use provided lembarId, or assign to the most recent one
          const lembarId = (transaksi as { lembarId?: string | null }).lembarId || (() => {
            const existingLembarIds = [...new Set(state.doorscrieftTransaksis.map((t) => t.lembarId).filter(Boolean))];
            return existingLembarIds.length > 0 ? existingLembarIds[existingLembarIds.length - 1] : generateId();
          })();

          // UUID untuk sync: uuid = id (anti-double via upsert on conflict uuid)
          const nextId = ensureTxId({
            id: (transaksi as { id?: string }).id,
            uuid: (transaksi as { uuid?: string }).uuid,
          });
          const uuid = nextId;


          // Add to outbox immediately so sync worker can pick it up
          addPendingUuid(String(uuid));

          return {
            doorscrieftTransaksis: [
              ...state.doorscrieftTransaksis,
              {
                ...transaksi,
                id: nextId,
                uuid,

                // sync metadata
                sync_status: 'pending',
                is_public: true,


                createdAt: new Date(),
                created_at: new Date().toISOString(),
                lembarId,

                // mataAnggaran dipaksa mengikuti master
                mataAnggaran: hit.mataAnggaran,
              },
            ],
          };
        }),


      updateDoorscrieftTransaksi: (id, data) =>
        set((state) => {
          const target = state.doorscrieftTransaksis.find((t) => t.id === id);
          if (!target) return state;

          const nextKode = data.kodeAnggaran ?? target.kodeAnggaran;
          const hit = state.kodeAnggarans.find((k) => k.kodeAnggaran === nextKode);
          if (!hit) {
            throw new Error(`Kode anggaran tidak valid: ${nextKode}`);
          }

          // Add/update in outbox so worker can retry
          addPendingUuid(String(id));

          return {
            doorscrieftTransaksis: state.doorscrieftTransaksis.map((t) =>
              t.id === id
                ? {
                    ...t,
                    ...data,
                    kodeAnggaran: nextKode,
                    mataAnggaran: hit.mataAnggaran,
                    updatedAt: new Date(),
                    updated_at: new Date().toISOString(),
                    // mark pending sync
                    sync_status: 'pending',
                  }
                : t
            ),

          };
        }),


      deleteDoorscrieftTransaksi: (id) =>
        set((state) => {
          const target = state.doorscrieftTransaksis.find((t) => t.id === id);
          if (!target) {
            return { doorscrieftTransaksis: state.doorscrieftTransaksis };
          }

          // Soft delete metadata for sync (tetap hapus dari UI lama)

          // Menyimpan logis deleted_at tidak bisa dipertahankan jika baris benar-benar dihapus.

          // Jadi untuk tahap 1 ini, kita mark pending untuk item itu jika tetap ada.
          // Karena app lama menghapus dari array, baris tidak lagi ada untuk dikirim.
          // Penghapusan fisik masih bisa di-handle di fase berikutnya (outbox + tombstone).

          return {
            doorscrieftTransaksis: state.doorscrieftTransaksis.filter((t) => t.id !== id),
          };
        }),



      tahunAktif: new Date().getFullYear(),
      setTahunAktif: (tahun) => set({ tahunAktif: tahun }),

      selectedBulan: new Date().getMonth() + 1,
      setSelectedBulan: (bulan) => set({ selectedBulan: bulan }),

      namaJemaat: 'Gereja Protestan Maluku',
      setNamaJemaat: (nama) => set({ namaJemaat: nama }),
      kopGereja: 'Gereja Protestan Maluku',
      setKopGereja: (nama) => set({ kopGereja: nama }),
      kopKlas: 'KLASIS PULAU AMBON TIMUR',
      setKopKlas: (nama) => set({ kopKlas: nama }),
      appName: 'Aplikasi Keuangan',
      setAppName: (nama) => set({ appName: nama }),
      appSubtitle: 'Jemaat GPM Suli',
      setAppSubtitle: (nama) => set({ appSubtitle: nama }),
      loginBackgroundImage: null,
      setLoginBackgroundImage: (image) => set({ loginBackgroundImage: image }),
      resetLoginBackgroundImage: () => set({ loginBackgroundImage: null }),
      adminUsername: 'admin',
      adminPassword: 'admin123',
      setAdminCredentials: (username, password) => set({ adminUsername: username, adminPassword: password }),

      clearSyncedData: () =>
        set(() => ({
          subSeksis: [],
          batangTubuhs: [],
          doorscrieftTransaksis: [],
          kodeAnggarans: [],
          pemasukans: [],
          pengeluarans: [],
          realisasis: [],
        })),

      // --- Sync Online (Supabase) ---
      markTransactionsSynced: (ids) =>
        set((state) => ({
          doorscrieftTransaksis: state.doorscrieftTransaksis.map((t) =>
            ids.includes(t.id)
              ? {
                  ...t,
                  sync_status: 'synced',
                  updated_at: new Date().toISOString(),
                }
              : t
          ),
        })),

      markTransactionsFailed: (ids) =>
        set((state) => ({
          doorscrieftTransaksis: state.doorscrieftTransaksis.map((t) =>
            ids.includes(t.id)
              ? {
                  ...t,
                  sync_status: 'failed',
                  updated_at: new Date().toISOString(),
                }
              : t
          ),
        })),

      removePendingUuid: (uuid) => {
        removePendingUuidFromOutbox(uuid);
      },
    }),
);


// --- Auto-save: persist relevant state to localStorage on every change ---
const STORAGE_KEY = 'keuangan-gereja-autosave';

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
          tanggal: r.tanggal ? new Date(String(r.tanggal)) : new Date(''),
          createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date(''),
          updatedAt: r.updatedAt ? new Date(String(r.updatedAt)) : undefined,
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
if (saved.namaJemaat) {
  useStore.setState({ namaJemaat: saved.namaJemaat });
}
if (saved.tahunAktif) {
  useStore.setState({ tahunAktif: saved.tahunAktif });
}
if (saved.kopGereja) {
  useStore.setState({ kopGereja: saved.kopGereja });
}
if (saved.kopKlas) {
  useStore.setState({ kopKlas: saved.kopKlas });
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

// Subscribe to store changes and persist to localStorage
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((state) => {
  const data = {
    doorscrieftTransaksis: state.doorscrieftTransaksis,
    kodeAnggarans: state.kodeAnggarans,
    subSeksis: state.subSeksis,
    batangTubuhs: state.batangTubuhs,
    namaJemaat: state.namaJemaat,
    tahunAktif: state.tahunAktif,
    kopGereja: state.kopGereja,
    kopKlas: state.kopKlas,
    appName: state.appName,
    appSubtitle: state.appSubtitle,
    loginBackgroundImage: state.loginBackgroundImage,
    adminUsername: state.adminUsername,
    adminPassword: state.adminPassword,
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
