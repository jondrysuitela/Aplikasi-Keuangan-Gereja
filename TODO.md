# TODO - Keuangan Gereja

## Sub Seksi & Drill-down (Excel → UI)
- [x] SubSeksiPage: perbaiki import `useEffect` agar komponen bisa render.
- [ ] Tambahkan dropdown Bulan pada SubSeksiPage.
- [ ] Ubah UX: klik nama sub-seksi membuka panel drill-down rincian grup sub-seksi + data keuangan.
- [ ] Pastikan filter data keuangan menggunakan `kodeAnggaran` dari transaksi (doorscrieft + input data).

## Master Kode Anggaran (bisa edit)
- [ ] Buat master kode anggaran tersimpan lokal (JSON via Zustand persist / atau localStorage).
- [ ] Tambah CRUD untuk `kodeAnggarans` di PengaturanPage.
- [ ] Tambah tombol **Sync dari Excel** dengan strategi **Merge** (kode sama update mataAnggaran, kode baru tambah; tidak hapus kode lokal yang tidak ada di Excel).
- [ ] Update: pastikan proses validasi/penyimpanan `doorscrieftTransaksis` selalu mengikuti master kode anggaran terbaru.

## Validasi
- [ ] Jalankan `npm run dev` dan pastikan menu Sub Seksi tidak blank.
- [ ] Cek alur: InputData/Doorscrieft → SubSeksi (berdasarkan kode anggaran).

