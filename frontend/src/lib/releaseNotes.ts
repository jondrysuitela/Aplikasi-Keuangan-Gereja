export type ReleaseNote = {
  version: string;
  date: string;
  label: string;
  stability: 'stable' | 'patch' | 'major';
  summary: string;
  highlights: string[];
  checks: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    version: '1.4.2',
    date: '2026-06-22',
    label: 'Patch Kalkulator Anggaran',
    stability: 'patch',
    summary: 'Penyempurnaan input Dianggarkan agar rincian program bisa dihitung otomatis dari pola teks dan nominal.',
    highlights: [
      'Kolom Keterangan Rincian dapat membaca pola seperti 32 minggu x 27 unit x Rp90.000 dan otomatis mengisi kolom Jumlah.',
      'Kolom Jumlah mendukung input kalkulator ringan seperti 3 x 17.000.000, 3 hari x 17.000.000, atau nominal rupiah biasa.',
      'Keterangan rincian tetap boleh kosong saat hanya jumlah yang perlu diisi.',
      'Format rupiah otomatis dibuat lebih toleran untuk penulisan Rp, Rp., titik ribuan, dan teks pendamping.',
    ],
    checks: [
      'Lint frontend hijau.',
      'Build frontend hijau.',
      'Test export/import hijau sebelum installer dibuat.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-06-19',
    label: 'Patch Stabil',
    stability: 'patch',
    summary: 'Stabilisasi keamanan operasional dan bantuan pengguna setelah pembaruan besar v1.4.0.',
    highlights: [
      'Proteksi aksi berisiko dengan verifikasi password admin untuk restore, hapus data, buka kunci tahun, tutup buku, import master, sinkron master, dan reset dianggarkan.',
      'Halaman Bantuan baru berisi alur kerja, panduan import, print, backup/restore, tahun terkunci, dan troubleshooting.',
      'Riwayat update aplikasi dibuat lebih rapi supaya perubahan versi dapat dibaca dari aplikasi.',
      'Popup update mengambil catatan versi dari sumber release notes yang sama dengan halaman bantuan.',
    ],
    checks: [
      'Lint frontend wajib hijau.',
      'Build frontend wajib hijau.',
      'Test export/import wajib hijau sebelum installer dibagikan.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-06-19',
    label: 'Update Besar Operasional',
    stability: 'major',
    summary: 'Pembaruan besar untuk menjadikan aplikasi lebih siap dipakai sebagai aplikasi operasional gereja.',
    highlights: [
      'Sidebar Dianggarkan baru untuk menyusun Program dan Rincian Program yang langsung tersinkron ke Batang Tubuh.',
      'Setup awal aplikasi diperbarui untuk level Klasis/Jemaat, background login, dan nama penandatangan laporan.',
      'Master Kode Anggaran menjadi pusat sinkronisasi untuk Doorscrieft, Sub Seksi, dan Batang Tubuh.',
      'Sub Seksi membaca judul yang benar dari Master Kode Anggaran dan hanya menampilkan struktur Sub Seksi.',
      'Preview cetak dan pengaturan kertas diperbaiki agar hasil laporan lebih konsisten.',
      'Tampilan card, empty state, dan status aplikasi dipoles agar lebih profesional dan mudah dibaca.',
    ],
    checks: [
      'Installer Windows dibuat sebagai rilis v1.4.0.',
      'Export laporan utama sudah dicek melalui test otomatis.',
      'Alur setup, import master, dan print preview menjadi dasar pembaruan berikutnya.',
    ],
  },
  {
    version: '1.3.13',
    date: '2026-05-27',
    label: 'Perbaikan Import Doorscrieft',
    stability: 'stable',
    summary: 'Patch import untuk menormalkan tanggal dan kode anggaran dari Excel.',
    highlights: [
      'Parsing tanggal import Doorscrieft mendukung format dd/mm/yyyy dan dd-mm-yyyy.',
      'Kode anggaran import dengan trailing titik dinormalisasi agar cocok dengan master kode.',
      'Validasi dan tes import Doorscrieft ditambahkan untuk menjaga stabilitas proses impor.',
    ],
    checks: [
      'Test import Doorscrieft ditambahkan.',
      'Format tanggal Indonesia menjadi lebih aman saat import.',
    ],
  },
];

export function getReleaseNote(version: string) {
  return releaseNotes.find((release) => release.version === version) || releaseNotes[0];
}
