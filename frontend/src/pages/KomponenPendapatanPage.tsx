import { useMemo, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { ArrowUpCircle, BookOpen, ChevronRight, FileText, Search } from 'lucide-react';
import type { DoorscrieftRowInput, KodeAnggaranItem } from '@/types';
import { ReportPrintButton, ReportPrintDocument } from '@/components/print/ReportPrint';

function isPendapatanRow(r: DoorscrieftRowInput) {
  const p = Number(r.penerimaan || 0);
  const q = Number(r.pengeluaran || 0);
  return p !== 0 && q === 0;
}

export function KomponenPendapatanPage() {
  const { kodeAnggarans, doorscrieftTransaksis, tahunAktif } = useStore();
  const [kodeAnggaranAktif, setKodeAnggaranAktif] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const kodeAnggaranPendapatanFromDoorscrieft = useMemo(() => {
    const itemsByKode = new Map<string, KodeAnggaranItem & { total: number; count: number }>();

    doorscrieftTransaksis
      .filter((r) => {
        const d = new Date(r.tanggal);
        return d.getFullYear() === tahunAktif && isPendapatanRow(r) && String(r.kodeAnggaran || '').startsWith('I.');
      })
      .forEach((r) => {
        const kodeAnggaran = String(r.kodeAnggaran || '').trim();
        if (!kodeAnggaran) return;

        const master = kodeAnggarans.find((k) => k.kodeAnggaran === kodeAnggaran);
        const current = itemsByKode.get(kodeAnggaran) || {
          kodeAnggaran,
          mataAnggaran: master?.mataAnggaran || r.mataAnggaran || kodeAnggaran,
          total: 0,
          count: 0,
        };
        current.total += Number(r.penerimaan || 0);
        current.count += 1;
        itemsByKode.set(kodeAnggaran, current);
      });

    return Array.from(itemsByKode.values()).sort((a, b) => a.kodeAnggaran.localeCompare(b.kodeAnggaran));
  }, [doorscrieftTransaksis, kodeAnggarans, tahunAktif]);

  const kodeAktifItem = useMemo(() => {
    if (!kodeAnggaranAktif) return null;
    return kodeAnggaranPendapatanFromDoorscrieft.find((x) => x.kodeAnggaran === kodeAnggaranAktif) ?? null;
  }, [kodeAnggaranAktif, kodeAnggaranPendapatanFromDoorscrieft]);

  const rowsPendapatanAktif = useMemo(() => {
    if (!kodeAnggaranAktif) return [];

    return doorscrieftTransaksis
      .filter((r) => {
        const d = new Date(r.tanggal);
        return d.getFullYear() === tahunAktif;
      })
      .filter((r) => r.kodeAnggaran === kodeAnggaranAktif)
      .filter((r) => isPendapatanRow(r))
      .sort((a, b) => {
        const da = new Date(a.tanggal).getTime();
        const db = new Date(b.tanggal).getTime();
        if (db !== da) return db - da;
        return String(a.no).localeCompare(String(b.no));
      });
  }, [doorscrieftTransaksis, kodeAnggaranAktif, tahunAktif]);

  const totals = useMemo(() => {
    const penerimaan = rowsPendapatanAktif.reduce((sum, r) => sum + Number(r.penerimaan || 0), 0);
    return { penerimaan };
  }, [rowsPendapatanAktif]);

  const filteredKodeAnggaran = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kodeAnggaranPendapatanFromDoorscrieft;
    return kodeAnggaranPendapatanFromDoorscrieft.filter((k) => (
      (k.kodeAnggaran || '').toLowerCase().includes(q) ||
      (k.mataAnggaran || '').toLowerCase().includes(q)
    ));
  }, [kodeAnggaranPendapatanFromDoorscrieft, search]);

  const summary = useMemo(() => {
    const total = kodeAnggaranPendapatanFromDoorscrieft.reduce((sum, item) => sum + item.total, 0);
    const count = kodeAnggaranPendapatanFromDoorscrieft.reduce((sum, item) => sum + item.count, 0);
    const top = kodeAnggaranPendapatanFromDoorscrieft.length > 0
      ? [...kodeAnggaranPendapatanFromDoorscrieft].sort((a, b) => b.total - a.total)[0]
      : null;
    return { total, count, top };
  }, [kodeAnggaranPendapatanFromDoorscrieft]);

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300'>
            <ArrowUpCircle className='h-4 w-4' />
            Referensi Pendapatan
          </div>
          <h1 className='mt-1 text-2xl font-bold text-slate-900 dark:text-white'>Komponen Pendapatan</h1>
          <p className='text-slate-500 dark:text-slate-400'>Mata anggaran pendapatan yang terpakai di Doorscrieft Tahun {tahunAktif}</p>
        </div>
        <ReportPrintButton title={`Komponen_Pendapatan_${tahunAktif}`} />
      </div>

      <ReportPrintDocument
        title='KOMPONEN PENDAPATAN'
        subtitle={`Tahun Anggaran ${tahunAktif}`}
        meta={[
          { label: 'Tahun', value: tahunAktif },
          { label: 'Kode Aktif', value: kodeAnggaranPendapatanFromDoorscrieft.length },
          { label: 'Transaksi', value: summary.count },
          { label: 'Total Penerimaan', value: formatCurrency(summary.total) },
        ]}
      >
        <table>
          <thead>
            <tr>
              <th className='text-center'>No</th>
              <th>Kode</th>
              <th>Mata Anggaran</th>
              <th className='text-center'>Transaksi</th>
              <th className='text-right'>Total Penerimaan</th>
            </tr>
          </thead>
          <tbody>
            {filteredKodeAnggaran.length === 0 ? (
              <tr><td colSpan={5} className='text-center'>Tidak ada komponen pendapatan.</td></tr>
            ) : filteredKodeAnggaran.map((item, index) => (
              <tr key={item.kodeAnggaran}>
                <td className='text-center'>{index + 1}</td>
                <td>{item.kodeAnggaran}</td>
                <td>{item.mataAnggaran}</td>
                <td className='text-center'>{item.count}</td>
                <td className='text-right'>{formatCurrency(item.total)}</td>
              </tr>
            ))}
            <tr className='font-bold'>
              <td colSpan={4}>TOTAL PENDAPATAN</td>
              <td className='text-right'>{formatCurrency(summary.total)}</td>
            </tr>
          </tbody>
        </table>
      </ReportPrintDocument>

      <div className='grid gap-3 md:grid-cols-3'>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Total Penerimaan</p>
            <p className='mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(summary.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Kode Aktif</p>
            <p className='mt-2 text-xl font-bold text-slate-900 dark:text-white'>{kodeAnggaranPendapatanFromDoorscrieft.length}</p>
            <p className='text-xs text-slate-500 dark:text-slate-400'>{summary.count} transaksi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Komponen Terbesar</p>
            <p className='mt-2 truncate text-base font-bold text-slate-900 dark:text-white'>{summary.top?.kodeAnggaran || '-'}</p>
            <p className='text-xs text-slate-500 dark:text-slate-400'>{summary.top ? formatCurrency(summary.top.total) : 'Belum ada data'}</p>
          </CardContent>
        </Card>
      </div>

      <div className='grid min-h-0 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]'>
        <Card className='flex max-h-[calc(100vh-13rem)] min-h-[560px] flex-col overflow-hidden'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <BookOpen className='h-5 w-5' />
              Daftar Mata Anggaran
            </CardTitle>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Pilih kode untuk melihat transaksi pendapatan.</p>
          </CardHeader>
          <CardContent className='flex min-h-0 flex-1 flex-col space-y-4'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
              <Input
                className='pl-10'
                placeholder='Cari kode / mata anggaran...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
              {filteredKodeAnggaran.length === 0 ? (
                <div className='flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500 dark:text-slate-400'>
                  <FileText className='h-8 w-8' />
                  <p>Tidak ada mata anggaran pendapatan untuk filter ini.</p>
                </div>
              ) : (
                <div className='space-y-2'>
                  {filteredKodeAnggaran.map((k) => {
                    const active = kodeAnggaranAktif === k.kodeAnggaran;
                    return (
                      <button
                        key={k.kodeAnggaran}
                        type='button'
                        onClick={() => setKodeAnggaranAktif(k.kodeAnggaran)}
                        className={`w-full rounded-md border px-3 py-3 text-left transition ${
                          active
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100'
                            : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <div className='flex items-start justify-between gap-3'>
                          <div className='min-w-0'>
                            <p className='font-mono text-xs text-slate-500 dark:text-slate-400'>{k.kodeAnggaran}</p>
                            <p className='mt-1 truncate text-sm font-semibold'>{k.mataAnggaran}</p>
                          </div>
                          <ChevronRight className='mt-1 h-4 w-4 shrink-0 text-slate-400' />
                        </div>
                        <div className='mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400'>
                          <span>{k.count} transaksi</span>
                          <span className='font-semibold text-emerald-700 dark:text-emerald-300'>{formatCurrency(k.total)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className='flex max-h-[calc(100vh-13rem)] min-h-[560px] flex-col overflow-hidden'>
          <CardHeader className='gap-3 lg:flex-row lg:items-start lg:justify-between'>
            <div>
              <CardTitle className='text-base'>Detail Mata Anggaran</CardTitle>
              <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
                {kodeAktifItem ? `${kodeAktifItem.kodeAnggaran} - ${kodeAktifItem.mataAnggaran}` : 'Pilih mata anggaran pendapatan.'}
              </p>
            </div>
            <div className='text-right'>
              <p className='text-sm text-slate-500 dark:text-slate-400'>Total Penerimaan</p>
              <p className='text-xl font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(totals.penerimaan)}</p>
            </div>
          </CardHeader>
          <CardContent className='flex min-h-0 flex-1 flex-col'>
            {!kodeAnggaranAktif ? (
              <div className='flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500 dark:text-slate-400'>
                <BookOpen className='h-8 w-8' />
                <p>Klik sebuah mata anggaran di panel kiri.</p>
              </div>
            ) : (
              <div className='min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 dark:border-slate-700'>
                <table className='w-full min-w-[720px] text-sm'>
                  <thead className='bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400'>
                    <tr>
                      <th className='px-4 py-3'>No</th>
                      <th className='px-4 py-3'>Tanggal</th>
                      <th className='px-4 py-3'>Uraian</th>
                      <th className='px-4 py-3 text-right'>Penerimaan</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
                    {rowsPendapatanAktif.length === 0 ? (
                      <tr>
                        <td colSpan={4} className='px-4 py-10 text-center text-slate-500'>Tidak ada transaksi pendapatan.</td>
                      </tr>
                    ) : (
                      rowsPendapatanAktif.map((r) => (
                        <tr key={r.id} className='hover:bg-slate-50 dark:hover:bg-slate-700/50'>
                          <td className='px-4 py-3 text-slate-500'>{r.no}</td>
                          <td className='px-4 py-3 font-medium text-slate-700 dark:text-slate-200'>{new Date(r.tanggal).toLocaleDateString('id-ID')}</td>
                          <td className='px-4 py-3 text-slate-700 dark:text-slate-200'>{r.uraian}</td>
                          <td className='px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-300'>
                            {formatCurrency(r.penerimaan || 0)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
