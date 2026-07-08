# Changelog

Semua perubahan penting aplikasi ini akan dicatat di file ini.

Format changelog mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) secara praktis, dan versi mengikuti [Semantic Versioning](https://semver.org/).


## [1.5.0] - 2026-07-08

### Fitur

- Menambahkan halaman Laporan Semester dengan ringkasan Pendapatan, Pengeluaran, dan Saldo per Semester 1 (Jan-Jun) dan Semester 2 (Jul-Des).
- Laporan per Sub Seksi hanya menampilkan transaksi dengan kode anggaran I.3 (pendapatan sub-seksi) dan II.3 (pengeluaran sub-seksi).
- Setiap program pada sub-seksi dapat di-expand untuk melihat detail transaksi (tanggal, keterangan, nominal).
- Panel ringkasan (header, toggle semester, dan kartu saldo) dibuat sticky agar tetap terlihat saat scroll.
- Navigasi Laporan Semester tersedia di sidebar.
## [1.4.2] - 2026-06-22

### Fitur

- Menambahkan kalkulator otomatis pada Keterangan Rincian Dianggarkan untuk pola seperti `32 minggu x 27 unit x Rp90.000`.
- Menambahkan kalkulator ringan pada kolom Jumlah Dianggarkan untuk input seperti `3 x 17.000.000`, teks satuan, atau nominal rupiah biasa.
- Menampilkan nominal jumlah secara otomatis dalam format rupiah agar input anggaran lebih mudah dicek.

### Perbaikan

- Mengizinkan Keterangan Rincian kosong saat pengguna hanya perlu mengisi jumlah.
- Membuat pembacaan nominal lebih toleran terhadap format `Rp`, `Rp.`, titik ribuan, dan teks tambahan.

## [1.4.1] - 2026-06-19

### Fitur

- Menambahkan Halaman Bantuan berisi alur kerja, panduan import, print, backup/restore, tahun terkunci, troubleshooting, dan riwayat update.
- Menambahkan riwayat update terpusat agar popup update dan halaman bantuan membaca catatan versi yang sama.
- Menambahkan proteksi password admin untuk aksi berisiko seperti restore, hapus data, buka kunci tahun, tutup buku, import master, sinkron master, dan reset dianggarkan.

### Perbaikan

- Menyiapkan patch stabil v1.4.1 setelah update besar v1.4.0 agar build berikutnya punya catatan perubahan yang jelas.

## [1.4.0] - 2026-06-19

### Fitur

- Menambahkan sidebar Dianggarkan untuk menyusun Program dan Rincian Program yang tersinkron ke Batang Tubuh.
- Memperbarui setup awal aplikasi untuk level Klasis/Jemaat, background login, dan nama penandatangan laporan.
- Menjadikan Master Kode Anggaran sebagai pusat sinkronisasi untuk Doorscrieft, Sub Seksi, dan Batang Tubuh.
- Memperbaiki preview cetak dan pengaturan kertas agar hasil laporan lebih konsisten.
- Memoles tampilan card, empty state, status aplikasi, dashboard, dan laporan agar terasa lebih operasional.

## [1.3.13] - 2026-05-27

### Perbaikan

- Memperbaiki parsing tanggal import Doorscrieft Excel agar mendukung format `dd/mm/yyyy` dan `dd-mm-yyyy`.
- Menormalisasi kode anggaran import dengan trailing titik agar cocok dengan master kode.
- Menambahkan validasi serta tes import Doorscrieft untuk memastikan stabilitas proses impor.

## [1.3.12] - 2026-05-27

### Fitur

- Menetapkan versi rilis aktif aplikasi sebagai `1.3.12`.
- Menambahkan fondasi auto versioning berbasis Conventional Commits.

### Catatan

- Changelog berikutnya dapat dibuat otomatis dengan `npm run version:bump`.

