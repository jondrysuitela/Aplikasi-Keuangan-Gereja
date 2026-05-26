export type UserRole = 'admin' | 'bendahara' | 'viewer';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

export interface KategoriPendapatan {
  id: string;
  nama: string;
  kode: string;
  subKategoris?: SubKategoriPendapatan[];
}

export interface SubKategoriPendapatan {
  id: string;
  kategoriId: string;
  nama: string;
  kode: string;
}

export interface KategoriBelanja {
  id: string;
  nama: string;
  kode: string;
  subKategoris?: SubKategoriBelanja[];
}

export interface SubKategoriBelanja {
  id: string;
  kategoriId: string;
  nama: string;
  kode: string;
}

export interface SubSeksiAnak {
  kode: string;
  nama: string;
  parentKode?: string;
}

export interface SubSeksi {
  id: string;
  nama: string;
  kode: string;
  jenis?: 'pendapatan' | 'pengeluaran';
  batangTubuh?: BatangTubuh[];
  anak?: SubSeksiAnak[];
}

export interface BatangTubuh {
  id: string;
  subSeksiId: string;
  nama: string;
  kode: string;
  detailRows?: { kode: string; nama: string; dianggarkan: number; realisasi: number }[];
}

export interface BatangTubuhItem {
  kode: string;
  nama: string;
  subSeksiKode: string;
  subSeksiNama: string;
  detailRows: { kode: string; nama: string; dianggarkan: number; realisasi: number }[];
}

// --- Transaksi (versi lama, belum diganti oleh user namun tetap dipertahankan agar kompatibel) ---
export interface Pemasukan {
  id: string;
  tanggal: Date;
  kategoriId: string;
  subKategoriId: string;
  subSeksiId?: string;
  batangTubuhId?: string;
  keterangan: string;
  jumlah: number;
  sumberDana: string;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Pengeluaran {
  id: string;
  tanggal: Date;
  kategoriId: string;
  subKategoriId: string;
  subSeksiId?: string;
  batangTubuhId?: string;
  keterangan: string;
  jumlah: number;
  penanggungJawab: string;
  buktiUrl?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface RealisasiAnggaran {
  id: string;
  tahun: number;
  bulan: number;
  kategoriId: string;
  subKategoriId: string;
  anggaran: number;
  createdAt: Date;
}

export interface Rekonsiliasi {
  id: string;
  tanggal: Date;
  jenis: 'masuk' | 'keluar';
  transaksiId: string;
  jumlah: number;
  selisih: number;
  keterangan: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: string;
  newValue?: string;
  createdAt: Date;
}

// --- Doorscrieft / Kode Anggaran (inti user request) ---
export interface KodeAnggaranItem {
  kodeAnggaran: string;
  mataAnggaran: string;
}

export interface DoorscrieftRowInput {
  /** UUID unik (jadi key untuk upsert & cegah double) */
  id: string;

  /** Status sinkronisasi ke Supabase */
  sync_status?: 'pending' | 'synced' | 'failed';

  /** apakah baris transaksi ini boleh tampil di dashboard publik */
  is_public?: boolean;

  /** audit fields (ISO string) */
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;

  no: string;
  tanggal: Date;
  uraian: string;

  kodeAnggaran: string;
  mataAnggaran: string;


  // Extra field: lembar kerja ID — decouples worksheet grouping from date
  lembarId?: string;

  // Sesuai kolom DOORSCRIEFT2
  penerimaan: number;
  pengeluaran: number;

  // Extra fields from Excel import
  kodeBantu?: string;
  bulan?: number; // 0-11, month section from Excel "lembar kerja"

  createdBy?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface DashboardStats {
  totalPemasukan: number;
  totalPengeluaran: number;
  saldoAkhir: number;
  pemasukanBulanan: { bulan: string; jumlah: number }[];
  pengeluaranBulanan: { bulan: string; jumlah: number }[];
}

export interface LaporanBulanan {
  tahun: number;
  bulan: number;
  totalPemasukan: number;
  totalPengeluaran: number;
  saldo: number;
  byKategori: {
    kategori: string;
    pemasukan: number;
    pengeluaran: number;
  }[];
  bySubSeksi: {
    subSeksi: string;
    pemasukan: number;
    pengeluaran: number;
  }[];
}

