# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.8.1](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/compare/v1.8.0...v1.8.1) (2026-09-25)


### Dokumentasi

* tambah release notes v1.8.0 ([8e931a1](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/commit/8e931a151d93c4795d73d6f5aebd5dddc2fa0cc4))


### Maintenance

* perbaiki pola gitignore file excel besar ([605a5ec](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/commit/605a5ec917fbafee893d0ed5bc2bea75547c3468))


### Perbaikan

* hapus kolom & perhitungan Saldo di Laporan Semester ([5beecbc](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/commit/5beecbc6f7a78babb2eab5825d80d5660de198ef))

## [1.8.0](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/compare/v1.5.0...v1.8.0) (2026-09-25)


### Maintenance

* add v1.5.0 build artifacts ([7122ba4](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/commit/7122ba47575f49c75f0046527d192222e1021c69))
* ignore large excel file ([52765f9](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/commit/52765f90d73ba39bd4b34a885faf9c729183c8c5))
* remove large file from tracking ([acb5a2d](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/commit/acb5a2dd9e97672ba7e9cfa530ec87b7f713c26d))


### Fitur

* RekonKlasis export, REALISASI Dianggarkan, carryover anggaran; bersihkan file sampah ([1e47a3e](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/commit/1e47a3e786e62cdf2b83f763ece0a76995cdcb3a))


### Perbaikan

* lembar kosong +Lembar, identitas pengaturan di export, crash project korup, sync kode anggaran writable ([564af83](https://github.com/jondryxx/Aplikasi-Keuangan-Gereja-v1/commit/564af834fc49b3feedfdf54c3326fb32de24a6b0))

## [1.7.0] - 2026-07-10

### Fitur
- Export Dianggarkan: kolom REALISASI pindah ke posisi sebelum DIANGGARKAN. REALISASI menampilkan tahun sebelumnya (tahunAktif - 1), otomatis terisi dari transaksi Doorscrieft tahun tersebut.
- Carryover data Dianggarkan: saat Tutup Buku & Buka Tahun Baru, data anggaran (program, rincian, jumlah) dari tahun berjalan otomatis disalin ke tahun baru. Tinggal koreksi, tidak perlu ketik ulang.
## [1.6.3] - 2026-07-10

### Fitur
- Tombol Sisip (+) di kolom Aksi Doorscrieft untuk menyisipkan data baru di antara baris yang sudah ada.
- Nomor urut otomatis menyesuaikan posisi ketika data disisipkan.
## [1.6.2] - 2026-07-09

### Fixed
- Fix card Tanggungan layout: full width, tables side-by-side, total akumulasi dana, selisih merah
- Fix Penetapan Tanggungan tidak jadi 0: auto-hitung dari transaksi Doorscrieft jika data tahunan kosong
- Fix selisih YPPK 1%: realisasi ngikut penetapan (selisih = 0)
- Fix export Rekon Klasis: handler tidak terdaftar karena orphaned code
- Fix export Rekon Klasis: struktur 1:1 dengan template MAPPING REKON
- Fix export Rekon Klasis: label per bulan (Pendapatan, Belanja, Pendapatan Murni, Tahun Lalu)
- Fix newline issue in CHANGELOG

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.6.0] - 2026-07-09

### Fitur

- Mapping Rekon Klasis otomatis: APBG dari data Dianggarkan (tahun berjalan), Pendapatan Murni Tahun Lalu dari tahunAktif - 2.
- Dialog Data Tahunan: ganti tahun auto-reload data tersimpan & APBG sesuai tahun.
- Pemasukan Murni & Pengeluaran Murni otomatis terisi dari transaksi realtime (Doorscrieft) jika belum ada data.
- Label dinamis "Pendapatan Murni Tahun Lalu (tahun)".
- Tabel Rekon Klasis header 2 baris: MURNI/UKP di atas, PENDAPATAN/BELANJA di bawah.
- Catatan Tanggungan Perbulan (30%, 1%, 7% / 12) — hanya di aplikasi, tidak ikut export.
- Judul card "Penetapan APB-G TA {tahunAktif}" sesuai tahun berjalan.

### Perbaikan

- Input Dianggarkan Pendapatan tidak lagi auto-mengisi Dianggarkan Pengeluaran.
- Pendapatan Murni Tahun Lalu tidak pakai fallback localStorage, ambil dari tahun yang benar.
- var -> let/const, isNaN -> Number.isNaN.

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


## [1.6.1] - 2026-07-09

### Fixed
- Fix Ctrl+R refresh shortcut still working in production build (reload menu items now wrapped in isDev)
- Fix export button not responding - added try-catch error handling in handleExport
- Fix incorrect import handler in RekonKlasisPage (was using export code instead of import code)
- Fix preload.js sandbox compatibility

### Changed
- Bump version to 1.6.1 for bug fix release


