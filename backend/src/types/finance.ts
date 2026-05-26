export type SyncTransaction = {
  uuid: string;
  tanggal: string; // ISO
  no: string;
  uraian: string;
  kode_anggaran: string;
  mata_anggaran: string;
  lembar_id?: string | null;
  penerimaan: number;
  pengeluaran: number;

  is_public: boolean;

  created_at?: string;
  updated_at?: string;

  deleted_at?: string | null;

  created_by?: string | null;
  deleted_by?: string | null;
};

