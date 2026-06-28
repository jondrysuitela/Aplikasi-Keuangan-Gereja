import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getLatestFilledMonth } from '@/lib/utils';
import { ArrowUpCircle, CalendarDays, FileText, Search } from 'lucide-react';
import type { DoorscrieftRowInput } from '@/types';
import { ReportPrintButton, ReportPrintDocument } from '@/components/print/ReportPrint';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function isPendapatanRow(r: DoorscrieftRowInput) {
  return Number(r.penerimaan || 0) !== 0 && Number(r.pengeluaran || 0) === 0;
}

export function PendapatanPerbulanPage() {
  const { kodeAnggarans, doorscrieftTransaksis, tahunAktif } = useStore();
  const [selectedBulan, setSelectedBulan] = useState(new Date().getMonth() + 1);
  const [totalPulseKey, setTotalPulseKey] = useState(0);
  const [showFloatingTotal, setShowFloatingTotal] = useState(true);
  const [isBottomTotalVisible, setIsBottomTotalVisible] = useState(false);
  const [search, setSearch] = useState('');
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomTotalRef = useRef<HTMLDivElement | null>(null);
  const hasUserSelectedMonthRef = useRef(false);

  useEffect(() => {
    hasUserSelectedMonthRef.current = false;
  }, [tahunAktif]);

  useEffect(() => {
    if (hasUserSelectedMonthRef.current) return;
    const filledMonth = getLatestFilledMonth(doorscrieftTransaksis, tahunAktif, isPendapatanRow);
    if (filledMonth) setSelectedBulan(filledMonth);
  }, [doorscrieftTransaksis, tahunAktif]);

  const monthlyRows = useMemo(() => {
    return doorscrieftTransaksis.filter((r) => (
      isPendapatanRow(r) &&
      new Date(r.tanggal).getMonth() + 1 === selectedBulan &&
      new Date(r.tanggal).getFullYear() === tahunAktif
    ));
  }, [doorscrieftTransaksis, selectedBulan, tahunAktif]);

  const groupedByKode = useMemo(() => {
    const map = new Map<string, { kode: string; mataAnggaran: string; txs: DoorscrieftRowInput[]; total: number }>();
    for (const tx of monthlyRows) {
      const kode = tx.kodeAnggaran || '-';
      const mata = tx.mataAnggaran || kodeAnggarans.find((k) => k.kodeAnggaran === kode)?.mataAnggaran || kode;
      if (!map.has(kode)) map.set(kode, { kode, mataAnggaran: mata, txs: [], total: 0 });
      const entry = map.get(kode)!;
      entry.txs.push(tx);
      entry.total += Number(tx.penerimaan || 0);
    }

    const query = search.trim().toLowerCase();
    return [...map.values()]
      .filter((item) => {
        if (!query) return true;
        return (
          item.kode.toLowerCase().includes(query) ||
          item.mataAnggaran.toLowerCase().includes(query) ||
          item.txs.some((tx) => (tx.uraian || '').toLowerCase().includes(query))
        );
      })
      .sort((a, b) => a.kode.localeCompare(b.kode));
  }, [monthlyRows, kodeAnggarans, search]);

  const grandTotal = groupedByKode.reduce((s, g) => s + g.total, 0);
  const rawMonthTotal = monthlyRows.reduce((s, row) => s + Number(row.penerimaan || 0), 0);
  const topGroup = groupedByKode.length > 0 ? [...groupedByKode].sort((a, b) => b.total - a.total)[0] : null;

  useEffect(() => {
    setTotalPulseKey((key) => key + 1);
  }, [grandTotal, selectedBulan]);

  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingTotal(false);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        setShowFloatingTotal(true);
        setTotalPulseKey((key) => key + 1);
      }, 220);
    };

    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const target = bottomTotalRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsBottomTotalVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [groupedByKode.length, selectedBulan]);

  const emptyText = search.trim()
    ? 'Tidak ada pendapatan yang cocok dengan pencarian.'
    : `Tidak ada data pendapatan untuk ${MONTHS[selectedBulan - 1]} ${tahunAktif}.`;

  return (
    <div className='space-y-6 pb-24'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300'>
            <ArrowUpCircle className='h-4 w-4' />
            Laporan Pendapatan
          </div>
          <h1 className='mt-1 text-2xl font-bold text-slate-900 dark:text-white'>Pendapatan Perbulan</h1>
          <p className='text-slate-500 dark:text-slate-400'>Rincian penerimaan berdasarkan kode anggaran Tahun {tahunAktif}</p>
        </div>
        <div className='flex items-center gap-2'>
          <ReportPrintButton title={`Pendapatan_Perbulan_${MONTHS[selectedBulan - 1]}_${tahunAktif}`} />
          <CalendarDays className='h-4 w-4 text-slate-500' />
          <select
            className='h-10 rounded-md border border-input bg-white px-3 text-sm font-medium dark:bg-slate-800 dark:text-white'
            value={selectedBulan}
            onChange={(e) => {
              hasUserSelectedMonthRef.current = true;
              setSelectedBulan(Number(e.target.value));
            }}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <ReportPrintDocument
        title='PENDAPATAN PERBULAN'
        subtitle={`${MONTHS[selectedBulan - 1]} ${tahunAktif}`}
        meta={[
          { label: 'Periode', value: `${MONTHS[selectedBulan - 1]} ${tahunAktif}` },
          { label: 'Transaksi', value: monthlyRows.length },
          { label: 'Total Pendapatan', value: formatCurrency(rawMonthTotal) },
        ]}
      >
        <table>
          <thead>
            <tr>
              <th className='text-center'>No</th>
              <th>Tanggal</th>
              <th>Kode</th>
              <th>Mata Anggaran</th>
              <th>Uraian</th>
              <th className='text-right'>Penerimaan</th>
            </tr>
          </thead>
          <tbody>
            {groupedByKode.length === 0 ? (
              <tr>
                <td colSpan={6} className='text-center'>{emptyText}</td>
              </tr>
            ) : groupedByKode.flatMap((group) => [
              ...group.txs
                .slice()
                .sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime())
                .map((tx, index) => (
                  <tr key={`${group.kode}-${tx.id}`}>
                    <td className='text-center'>{index + 1}</td>
                    <td>{new Date(tx.tanggal).toLocaleDateString('id-ID')}</td>
                    <td>{group.kode}</td>
                    <td>{group.mataAnggaran}</td>
                    <td>{tx.uraian}</td>
                    <td className='text-right'>{formatCurrency(Number(tx.penerimaan || 0))}</td>
                  </tr>
                )),
              <tr key={`${group.kode}-subtotal`} className='font-bold'>
                <td colSpan={5}>Subtotal {group.kode} - {group.mataAnggaran}</td>
                <td className='text-right'>{formatCurrency(group.total)}</td>
              </tr>,
            ])}
            <tr className='font-bold'>
              <td colSpan={5}>TOTAL PENDAPATAN</td>
              <td className='text-right'>{formatCurrency(rawMonthTotal)}</td>
            </tr>
          </tbody>
        </table>
      </ReportPrintDocument>

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Total Bulan Ini</p>
            <p className='mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(rawMonthTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Transaksi</p>
            <p className='mt-2 text-xl font-bold text-slate-900 dark:text-white'>{monthlyRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Kode Aktif</p>
            <p className='mt-2 text-xl font-bold text-slate-900 dark:text-white'>{groupedByKode.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Terbesar</p>
            <p className='mt-2 truncate text-base font-bold text-slate-900 dark:text-white'>{topGroup ? topGroup.kode : '-'}</p>
            <p className='text-xs text-slate-500 dark:text-slate-400'>{topGroup ? formatCurrency(topGroup.total) : 'Belum ada data'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className='gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <CardTitle className='text-base'>Rincian {MONTHS[selectedBulan - 1]} {tahunAktif}</CardTitle>
            <p className='text-sm text-slate-500 dark:text-slate-400'>
              Menampilkan {groupedByKode.length} kode dari {monthlyRows.length} transaksi pendapatan.
            </p>
          </div>
          <div className='relative w-full lg:max-w-md'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
            <input
              className='h-10 w-full rounded-md border border-input bg-white pl-10 pr-3 text-sm dark:bg-slate-800 dark:text-white'
              placeholder='Cari kode, mata anggaran, atau uraian...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
      </Card>

      {groupedByKode.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center justify-center gap-2 py-14 text-center text-slate-500 dark:text-slate-400'>
            <FileText className='h-8 w-8' />
            <p>{emptyText}</p>
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-4'>
          {groupedByKode.map((group) => (
            <Card key={group.kode}>
              <CardHeader className='gap-3 pb-2 lg:flex-row lg:items-start lg:justify-between'>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='rounded bg-slate-100 px-2 py-0.5 font-mono text-sm dark:bg-slate-700 dark:text-white'>{group.kode}</span>
                    <CardTitle className='text-base'>{group.mataAnggaran}</CardTitle>
                  </div>
                  <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>{group.txs.length} transaksi</p>
                </div>
                <div className='text-right text-lg font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(group.total)}</div>
              </CardHeader>
              <CardContent>
                <div className='overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700'>
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
                      {group.txs
                        .sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime())
                        .map((tx) => (
                          <tr key={tx.id} className='hover:bg-slate-50 dark:hover:bg-slate-700/50'>
                            <td className='px-4 py-3 text-slate-500'>{tx.no}</td>
                            <td className='px-4 py-3 font-medium text-slate-700 dark:text-slate-200'>{new Date(tx.tanggal).toLocaleDateString('id-ID')}</td>
                            <td className='px-4 py-3 text-slate-700 dark:text-slate-200'>{tx.uraian}</td>
                            <td className='px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-300'>
                              {formatCurrency(Number(tx.penerimaan || 0))}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card ref={bottomTotalRef} className='bg-slate-900 text-white'>
            <CardContent className='flex items-center justify-between gap-4 py-4'>
              <span className='text-base font-bold lg:text-lg'>TOTAL PENDAPATAN {MONTHS[selectedBulan - 1].toUpperCase()} {tahunAktif}</span>
              <span className='text-xl font-bold'>{formatCurrency(grandTotal)}</span>
            </CardContent>
          </Card>
        </div>
      )}

      <div className='pointer-events-none fixed bottom-4 left-0 right-0 z-40 px-4 sm:px-6 lg:left-64 lg:px-8'>
        <div
          key={totalPulseKey}
          className={`pointer-events-auto flex items-center justify-between gap-4 rounded-lg bg-slate-900 px-6 py-4 text-white shadow-2xl transition-all duration-200 ease-out ${
            showFloatingTotal && !isBottomTotalVisible ? 'translate-y-0 opacity-100 animate-[totalSlideUp_.28s_ease-out]' : 'translate-y-24 opacity-0'
          }`}
        >
          <div className='min-w-0'>
            <p className='truncate text-lg font-bold'>TOTAL PENDAPATAN {MONTHS[selectedBulan - 1].toUpperCase()} {tahunAktif}</p>
          </div>
          <div className='shrink-0 text-right text-xl font-bold text-white'>
            {formatCurrency(grandTotal)}
          </div>
        </div>
      </div>
    </div>
  );
}
