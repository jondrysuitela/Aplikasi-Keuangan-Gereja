import type { DoorscrieftRowInput, KodeAnggaranItem } from '@/types';

export type DataValidationIssue = {
  id: string;
  level: 'error' | 'warning';
  title: string;
  detail: string;
  rowId?: string;
};

function normalizeKode(value: unknown) {
  return String(value || '').trim();
}

export function getDoorscrieftValidationIssues(
  rows: DoorscrieftRowInput[],
  kodeAnggarans: KodeAnggaranItem[],
  tahunAktif: number,
) {
  const masterKode = new Map<string, KodeAnggaranItem>();
  kodeAnggarans.forEach((item) => {
    const kode = normalizeKode(item.kodeAnggaran);
    if (kode) masterKode.set(kode, item);
  });
  const issues: DataValidationIssue[] = [];

  rows.forEach((row, index) => {
    const id = row.id || String(index);
    const date = new Date(row.tanggal);
    const kode = normalizeKode(row.kodeAnggaran);
    const penerimaan = Number(row.penerimaan || 0);
    const pengeluaran = Number(row.pengeluaran || 0);
    const hasPenerimaan = penerimaan !== 0;
    const hasPengeluaran = pengeluaran !== 0;

    if (Number.isNaN(date.getTime())) {
      issues.push({
        id: `${id}-tanggal-invalid`,
        level: 'error',
        title: 'Tanggal tidak valid',
        detail: 'Ada transaksi dengan tanggal yang tidak bisa dibaca.',
        rowId: row.id,
      });
    } else if (date.getFullYear() !== tahunAktif) {
      issues.push({
        id: `${id}-tahun-lain`,
        level: 'warning',
        title: 'Tanggal di luar tahun aktif',
        detail: `Ada transaksi tahun ${date.getFullYear()} saat tahun aktif ${tahunAktif}.`,
        rowId: row.id,
      });
    }

    if (!kode) {
      issues.push({
        id: `${id}-kode-kosong`,
        level: 'error',
        title: 'Kode anggaran kosong',
        detail: 'Ada transaksi tanpa kode anggaran.',
        rowId: row.id,
      });
    } else if (!masterKode.has(kode)) {
      issues.push({
        id: `${id}-kode-tidak-terdaftar`,
        level: 'error',
        title: 'Kode anggaran tidak terdaftar',
        detail: `Kode "${kode}" tidak ditemukan di master kode anggaran.`,
        rowId: row.id,
      });
    } else {
      const master = masterKode.get(kode);
      if (master?.jenisKode === 'judul' || master?.aktifInput === false) {
        issues.push({
          id: `${id}-kode-judul`,
          level: 'error',
          title: 'Kode anggaran memakai Judul',
          detail: `Kode "${kode}" adalah Judul/kelompok. Gunakan kode Isi untuk transaksi.`,
          rowId: row.id,
        });
      }
    }

    if (hasPenerimaan && hasPengeluaran) {
      issues.push({
        id: `${id}-dua-nominal`,
        level: 'error',
        title: 'Penerimaan dan pengeluaran terisi bersamaan',
        detail: 'Satu transaksi sebaiknya hanya mengisi salah satu nominal.',
        rowId: row.id,
      });
    }

    if (!hasPenerimaan && !hasPengeluaran) {
      issues.push({
        id: `${id}-nominal-kosong`,
        level: 'warning',
        title: 'Nominal kosong',
        detail: 'Ada transaksi tanpa penerimaan maupun pengeluaran.',
        rowId: row.id,
      });
    }
  });

  return issues;
}

export function summarizeValidationForExport(issues: DataValidationIssue[]) {
  const errors = issues.filter((issue) => issue.level === 'error').length;
  const warnings = issues.filter((issue) => issue.level === 'warning').length;
  return { errors, warnings };
}
