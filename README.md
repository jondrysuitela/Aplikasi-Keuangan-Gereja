# Aplikasi Keuangan Gereja

Aplikasi desktop Windows untuk mengelola keuangan gereja dengan fitur lengkap.

## Fitur

- **Dashboard**: Ringkasan keuangan dengan grafik
- **Pemasukan**: CRUD data pemasukan dengan export Excel
- **Pengeluaran**: CRUD data pengeluaran dengan export Excel
- **Laporan Bulanan**: Laporan per bulan dengan export PDF
- **Realisasi Anggaran**: Pantau realisation anggaran
- **Komponen Pendapatan**: Kelola kategori pendapatan
- **Komponen Belanja**: Kelola kategori belanja
- **Sub Seksi**: Kelola data sub seksi
- **Rekonsiliasi**: Cocokkan pemasukan dan pengeluaran
- **Pengaturan**: Backup/restore data, dark mode

## Teknologi

- React + TypeScript
- TailwindCSS
- Zustand (state management)
- Electron (desktop engine)
- Recharts (chart)
- ExcelJS (export Excel)
- jsPDF (export PDF)

## Cara Install

```bash
# Install dependencies
cd frontend
npm install

# Install Electron di root
cd ..
npm install
```

## Cara Run Development

```bash
# Run development mode
npm run dev
```

Ini akan menjalankan:
1. Vite dev server di http://localhost:5173
2. Electron app

## Build untuk Production

```bash
# Build app
npm run build
```

File installer .exe akan berada di folder `dist/`

## Login Demo

- **Admin**: admin / admin123
- **Bendahara**: bendahara / bendahara123
- **Viewer**: viewer / viewer123

## Struktur Folder

```
keuangan-app/
+-- electron/          # Electron main process
¦   +-- main.js
¦   +-- preload.js
+-- frontend/          # React frontend
¦   +-- src/
¦   ¦   +-- components/  # UI components
¦   ¦   +-- pages/      # Page components
¦   ¦   +-- stores/      # Zustand store
¦   ¦   +-- types/      # TypeScript types
¦   ¦   +-- lib/        # Utilities
¦   +-- index.html
+-- data/              # Data Excel
+-- public/            # Static assets
+-- package.json
```

## License

MIT
