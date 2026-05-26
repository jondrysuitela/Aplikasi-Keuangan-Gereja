# Versioning dan Conventional Commits

Project ini memakai Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

Sumber utama versi aplikasi adalah root `package.json`. Electron membaca versi dari package tersebut melalui `app.getVersion()`, sedangkan frontend membaca versi yang sama lewat konfigurasi Vite.

## Aturan Kenaikan Versi

- `PATCH`: perbaikan bug, chore kecil, typo, perubahan internal kecil.
- `MINOR`: fitur baru yang tidak merusak fitur lama.
- `MAJOR`: breaking change, perubahan besar database, struktur data, API, atau format export yang tidak kompatibel.
- Prerelease: gunakan `beta` atau `rc` saat aplikasi belum stabil untuk rilis final.

## Format Commit

Gunakan Conventional Commits:

```text
fix: perbaiki default bulan halaman rekonsiliasi
feat: tambah validasi data transaksi
refactor: rapikan service export Doorscrieft
chore: update konfigurasi build Electron
docs: tambah panduan versioning
test: tambah test export Sub Seksi
perf: optimasi grouping transaksi
feat!: ubah format data project
```

Breaking change juga bisa ditulis dengan footer:

```text
feat: ubah format export Batang Tubuh

BREAKING CHANGE: struktur sheet export lama tidak kompatibel lagi.
```

## Script Release

Lihat hasil bump tanpa mengubah file:

```bash
npm run version:dry
```

Bump otomatis berdasarkan commit sejak tag terakhir:

```bash
npm run version:bump
```

Paksa jenis bump:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

Prerelease:

```bash
npm run version:beta
npm run version:rc
```

Script release akan:

- menaikkan versi di `package.json` dan `package-lock.json`
- memperbarui `CHANGELOG.md`
- membuat commit release
- membuat git tag dengan prefix `v`, contoh `v1.3.13`

## Contoh Dampak Commit

PATCH:

```text
fix: perbaiki tanggal default input Doorscrieft
chore: rapikan konfigurasi backup otomatis
```

MINOR:

```text
feat: tambah halaman Cek Data
feat: tambah backup otomatis sebelum import
```

MAJOR:

```text
feat!: ubah struktur file project gpm
```

atau

```text
refactor: migrasi database lokal

BREAKING CHANGE: project versi lama perlu proses migrasi sebelum dibuka.
```
