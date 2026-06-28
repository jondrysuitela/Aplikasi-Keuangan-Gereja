import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileSpreadsheet,
  HelpCircle,
  LifeBuoy,
  Lock,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useStore } from '@/stores';
import { can, roleLabel } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { releaseNotes } from '@/lib/releaseNotes';

type HelpTopic = {
  title: string;
  category: 'Alur Kerja' | 'Input Data' | 'Laporan' | 'Keamanan' | 'Troubleshooting';
  summary: string;
  steps: string[];
};

const workflowSteps = [
  {
    title: 'Setup identitas',
    detail: 'Lengkapi nama Jemaat/Klasis, kop laporan, penandatangan, dan akun pengguna.',
    href: '/pengaturan',
  },
  {
    title: 'Susun Master Kode Anggaran',
    detail: 'Input atau import kode judul dan kode isi dari Pengaturan, lalu sinkronkan ke struktur laporan.',
    href: '/pengaturan',
  },
  {
    title: 'Isi Dianggarkan',
    detail: 'Masukkan program dan rincian program per kode anggaran pada sidebar Dianggarkan.',
    href: '/dianggarkan',
  },
  {
    title: 'Input Doorscrieft',
    detail: 'Catat transaksi penerimaan dan pengeluaran harian dengan kode anggaran yang sesuai.',
    href: '/doorscrieft',
  },
  {
    title: 'Cek Data dan Review Laporan',
    detail: 'Periksa validasi, rekonsiliasi, realisasi per bulan, dan laporan pendapatan/pengeluaran.',
    href: '/cek-data',
  },
];

const helpTopics: HelpTopic[] = [
  {
    title: 'Urutan kerja yang disarankan',
    category: 'Alur Kerja',
    summary: 'Pakai alur master data dulu, baru anggaran, transaksi, validasi, laporan.',
    steps: [
      'Mulai dari Pengaturan untuk identitas aplikasi dan Master Kode Anggaran.',
      'Gunakan Dianggarkan untuk mengisi program dan rincian anggaran.',
      'Input transaksi di Doorscrieft sesuai kode anggaran.',
      'Buka Cek Data sebelum export, print, atau tutup buku.',
      'Simpan project dan buat backup setelah pekerjaan penting selesai.',
    ],
  },
  {
    title: 'Import Master Kode Anggaran',
    category: 'Input Data',
    summary: 'Template import mengganti master lama, bukan menggabungkan data.',
    steps: [
      'Download template dari Pengaturan bagian Master Kode Anggaran.',
      'Isi kode pendapatan dengan awalan I dan pengeluaran dengan awalan II.',
      'Tandai kode kelompok sebagai Judul dan kode yang dipakai transaksi sebagai Isi.',
      'Import kembali template. Aplikasi akan meminta password admin.',
      'Setelah import, gunakan Sinkron Semua untuk memperbarui Sub Seksi dan Batang Tubuh.',
    ],
  },
  {
    title: 'Input transaksi Doorscrieft',
    category: 'Input Data',
    summary: 'Riwayat uraian membantu mempercepat input berdasarkan kode anggaran sebelumnya.',
    steps: [
      'Pilih tanggal dan isi uraian transaksi.',
      'Gunakan saran riwayat jika uraian pernah dipakai sebelumnya.',
      'Kode anggaran dan mata anggaran akan mengikuti riwayat yang dipilih.',
      'Masukkan nominal penerimaan atau pengeluaran sesuai posisi transaksi.',
      'Cek kembali baris bertanda masalah sebelum menyimpan atau export.',
    ],
  },
  {
    title: 'Print dan preview laporan',
    category: 'Laporan',
    summary: 'Preview cetak memakai pengaturan kertas aplikasi, termasuk custom ukuran kertas.',
    steps: [
      'Buka halaman laporan yang ingin dicetak.',
      'Klik Print untuk membuka window preview.',
      'Pilih orientasi, margin, dan ukuran kertas dari panel preview.',
      'Gunakan ukuran custom jika kertas tidak tersedia di daftar.',
      'Pastikan jumlah halaman di preview sesuai sebelum dikirim ke printer.',
    ],
  },
  {
    title: 'Backup, restore, dan project',
    category: 'Keamanan',
    summary: 'Backup dipakai sebagai pengaman sebelum restore, hapus data, atau update besar.',
    steps: [
      'Gunakan Simpan untuk menyimpan file project aktif.',
      'Gunakan Backup untuk membuat salinan cadangan.',
      'Restore dan hapus data selalu meminta verifikasi admin.',
      'Jika data terlihat salah setelah update, pulihkan dari backup terakhir.',
      'Jangan hapus folder data aplikasi sebelum backup project dibuat.',
    ],
  },
  {
    title: 'Tahun terkunci',
    category: 'Keamanan',
    summary: 'Tahun terkunci mencegah perubahan setelah tutup buku.',
    steps: [
      'Saat tahun terkunci, input, import, dan reset data tahun tersebut dibatasi.',
      'Buka kunci hanya jika perlu koreksi resmi.',
      'Aplikasi meminta password admin untuk membuka kunci tahun.',
      'Setelah koreksi selesai, kunci kembali tahun tersebut.',
    ],
  },
  {
    title: 'Data tidak muncul di laporan',
    category: 'Troubleshooting',
    summary: 'Biasanya terjadi karena kode anggaran belum sinkron atau transaksi belum punya kode yang benar.',
    steps: [
      'Buka Cek Data dan lihat error kode anggaran.',
      'Pastikan Master Kode Anggaran punya kode Isi untuk transaksi.',
      'Sinkronkan Master ke Sub Seksi dan Batang Tubuh.',
      'Pastikan tahun aktif sama dengan tahun transaksi.',
      'Reload aplikasi setelah import besar jika tampilan belum berubah.',
    ],
  },
  {
    title: 'Import tidak bereaksi',
    category: 'Troubleshooting',
    summary: 'Import desktop membutuhkan aplikasi Electron, file template valid, dan izin role yang sesuai.',
    steps: [
      'Pastikan aplikasi dibuka dari versi desktop, bukan hanya browser dev.',
      'Pastikan file yang dipilih berasal dari template aplikasi.',
      'Cek apakah role aktif memiliki izin import.',
      'Jika import master, masukkan password admin saat diminta.',
      'Jika masih gagal, buat backup lalu restart aplikasi.',
    ],
  },
];

const categoryTone: Record<HelpTopic['category'], string> = {
  'Alur Kerja': 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200',
  'Input Data': 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
  Laporan: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200',
  Keamanan: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
  Troubleshooting: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
};

export function BantuanPage() {
  const [query, setQuery] = useState('');
  const { user, tahunAktif, lockedYears, kodeAnggarans, doorscrieftTransaksis, hasUnsavedChanges } = useStore();
  const role = user?.role;
  const isYearLocked = lockedYears.includes(tahunAktif);

  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return helpTopics;
    return helpTopics.filter((topic) => {
      const haystack = [topic.title, topic.category, topic.summary, ...topic.steps].join(' ').toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query]);

  const quickStatus = [
    {
      label: 'Role Aktif',
      value: roleLabel(role),
      detail: can(role, 'settings') ? 'Akses penuh pengaturan' : can(role, 'input') ? 'Akses input operasional' : 'Mode baca dan export',
      icon: ShieldCheck,
    },
    {
      label: 'Tahun Aktif',
      value: String(tahunAktif),
      detail: isYearLocked ? 'Terkunci' : 'Terbuka untuk pekerjaan',
      icon: Lock,
    },
    {
      label: 'Master Kode',
      value: String(kodeAnggarans.length),
      detail: 'Kode anggaran tersedia',
      icon: Settings,
    },
    {
      label: 'Transaksi',
      value: String(doorscrieftTransaksis.length),
      detail: hasUnsavedChanges ? 'Ada perubahan belum disimpan' : 'Status tersimpan aman',
      icon: FileSpreadsheet,
    },
  ];

  return (
    <div className='space-y-6'>
      <section className='overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900'>
        <div className='border-b border-slate-200 bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-950 p-6 text-white dark:border-slate-700'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
            <div>
              <div className='flex items-center gap-2 text-sm font-semibold text-emerald-200'>
                <LifeBuoy className='h-4 w-4' />
                Pusat Bantuan
              </div>
              <h1 className='mt-2 text-2xl font-bold'>Panduan Operasional Keuangan Gereja</h1>
              <p className='mt-2 max-w-3xl text-sm text-slate-200'>
                Ringkasan cara kerja aplikasi, urutan input, pengamanan data, dan langkah cepat saat ada kendala.
              </p>
            </div>
            <div className='relative w-full lg:w-80'>
              <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
              <Input
                className='border-white/20 bg-white/10 pl-9 text-white placeholder:text-slate-300'
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Cari bantuan...'
              />
            </div>
          </div>
        </div>

        <div className='grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4'>
          {quickStatus.map((item) => (
            <div key={item.label} className='rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/80'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='text-xs font-semibold uppercase text-slate-500 dark:text-slate-400'>{item.label}</p>
                  <p className='mt-1 text-xl font-bold text-slate-950 dark:text-white'>{item.value}</p>
                </div>
                <span className='rounded-md bg-white p-2 text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300'>
                  <item.icon className='h-5 w-5' />
                </span>
              </div>
              <p className='mt-2 text-sm text-slate-600 dark:text-slate-300'>{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className='grid gap-4 xl:grid-cols-[1.1fr_0.9fr]'>
        <Card className='overflow-hidden'>
          <CardHeader className='border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70'>
            <CardTitle className='flex items-center gap-2'>
              <BookOpen className='h-5 w-5 text-blue-600 dark:text-blue-300' />
              Alur Kerja Utama
            </CardTitle>
            <CardDescription>Urutan yang paling aman untuk pekerjaan rutin.</CardDescription>
          </CardHeader>
          <CardContent className='p-0'>
            <div className='divide-y divide-slate-100 dark:divide-slate-700'>
              {workflowSteps.map((step, index) => (
                <div key={step.title} className='grid gap-3 p-4 sm:grid-cols-[44px_1fr_auto] sm:items-center'>
                  <div className='flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200'>
                    {index + 1}
                  </div>
                  <div>
                    <p className='font-semibold text-slate-950 dark:text-white'>{step.title}</p>
                    <p className='mt-1 text-sm text-slate-600 dark:text-slate-300'>{step.detail}</p>
                  </div>
                  <Link
                    to={step.href}
                    className={cn(
                      'inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium transition-colors hover:bg-gray-100',
                      'dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700',
                    )}
                  >
                    Buka
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className='overflow-hidden'>
          <CardHeader className='border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70'>
            <CardTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-amber-600 dark:text-amber-300' />
              Saat Ada Masalah
            </CardTitle>
            <CardDescription>Langkah cepat sebelum mengubah data besar.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 p-4'>
            {[
              'Buat backup project sebelum restore, import besar, atau hapus data.',
              'Buka Cek Data untuk melihat transaksi tanpa kode, tanggal salah, atau nominal tidak seimbang.',
              'Pastikan tahun aktif sesuai periode transaksi yang sedang dicek.',
              'Untuk laporan cetak, cek preview dulu sebelum memilih printer.',
            ].map((item) => (
              <div key={item} className='flex gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900'>
                <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300' />
                <p className='text-slate-700 dark:text-slate-200'>{item}</p>
              </div>
            ))}
            <div className='grid gap-2 pt-1 sm:grid-cols-2'>
              <Link
                to='/cek-data'
                className='inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
              >
                <ShieldCheck className='mr-2 h-4 w-4' /> Cek Data
              </Link>
              <Link
                to='/pengaturan'
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100',
                  'dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700',
                )}
              >
                <Settings className='mr-2 h-4 w-4' /> Pengaturan
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className='space-y-3'>
        <div className='flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <h2 className='text-lg font-bold text-slate-950 dark:text-white'>Topik Bantuan</h2>
            <p className='text-sm text-slate-500 dark:text-slate-400'>{filteredTopics.length} topik tersedia</p>
          </div>
        </div>

        <div className='grid gap-4 lg:grid-cols-2'>
          {filteredTopics.map((topic) => (
            <Card key={topic.title} className='overflow-hidden'>
              <CardHeader className='space-y-2'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <CardTitle className='flex items-center gap-2 text-base'>
                      {topic.category === 'Laporan' ? <Printer className='h-4 w-4 text-violet-600' /> : <HelpCircle className='h-4 w-4 text-blue-600' />}
                      {topic.title}
                    </CardTitle>
                    <CardDescription>{topic.summary}</CardDescription>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${categoryTone[topic.category]}`}>
                    {topic.category}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <ol className='space-y-2 text-sm text-slate-700 dark:text-slate-200'>
                  {topic.steps.map((step, index) => (
                    <li key={step} className='grid grid-cols-[24px_1fr] gap-2'>
                      <span className='flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className='space-y-3'>
        <div>
          <h2 className='text-lg font-bold text-slate-950 dark:text-white'>Riwayat Update</h2>
          <p className='text-sm text-slate-500 dark:text-slate-400'>Catatan perubahan penting dan status build aplikasi.</p>
        </div>
        <div className='space-y-4'>
          {releaseNotes.map((release) => (
            <Card key={release.version} className='overflow-hidden'>
              <CardHeader className='border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70'>
                <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                  <div>
                    <CardTitle className='flex items-center gap-2'>
                      <Sparkles className='h-5 w-5 text-blue-600 dark:text-blue-300' />
                      v{release.version} - {release.label}
                    </CardTitle>
                    <CardDescription>{release.date} - {release.summary}</CardDescription>
                  </div>
                  <span className={cn(
                    'w-fit rounded-md border px-2.5 py-1 text-xs font-semibold',
                    release.stability === 'patch'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                      : release.stability === 'major'
                        ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200'
                        : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
                  )}>
                    {release.stability === 'patch' ? 'Patch Stabil' : release.stability === 'major' ? 'Update Besar' : 'Stabil'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className='grid gap-4 p-4 lg:grid-cols-[1.2fr_0.8fr]'>
                <div>
                  <p className='mb-2 text-sm font-semibold text-slate-900 dark:text-white'>Perubahan</p>
                  <ul className='space-y-2 text-sm text-slate-700 dark:text-slate-200'>
                    {release.highlights.map((item) => (
                      <li key={item} className='flex gap-2'>
                        <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300' />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className='rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900'>
                  <p className='mb-2 text-sm font-semibold text-slate-900 dark:text-white'>Checklist Build</p>
                  <ul className='space-y-2 text-sm text-slate-600 dark:text-slate-300'>
                    {release.checks.map((item) => (
                      <li key={item} className='flex gap-2'>
                        <ShieldCheck className='mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300' />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
