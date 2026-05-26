import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatCurrency, getLatestFilledMonth } from '@/lib/utils';
import { Calendar } from 'lucide-react';
import type { DoorscrieftRowInput } from '@/types';

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

  const groupedByKode = useMemo(() => {
    const filtered = doorscrieftTransaksis.filter((r) => {
      return isPendapatanRow(r) && new Date(r.tanggal).getMonth() + 1 === selectedBulan && new Date(r.tanggal).getFullYear() === tahunAktif;
    });

    const map = new Map<string, { kode: string; mataAnggaran: string; txs: DoorscrieftRowInput[]; total: number }>();
    for (const tx of filtered) {
      const kode = tx.kodeAnggaran || '-';
      const mata = tx.mataAnggaran || kodeAnggarans.find((k) => k.kodeAnggaran === kode)?.mataAnggaran || kode;
      if (!map.has(kode)) {
        map.set(kode, { kode, mataAnggaran: mata, txs: [], total: 0 });
      }
      const entry = map.get(kode)!;
      entry.txs.push(tx);
      entry.total += Number(tx.penerimaan || 0);
    }

    return [...map.entries()]
      .map(([, v]) => v)
      .sort((a, b) => a.kode.localeCompare(b.kode));
  }, [doorscrieftTransaksis, kodeAnggarans, selectedBulan, tahunAktif]);

  const grandTotal = groupedByKode.reduce((s, g) => s + g.total, 0);

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

  return (
    <div className='space-y-4 pb-24'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Pendapatan Perbulan</h1>
          <p className='text-slate-500'>Pendapatan per bulan berdasarkan kode anggaran</p>
        </div>
        <div className='flex gap-2 items-center'>
          <Calendar className='text-slate-500 h-4 w-4' />
          <select
            className='h-9 rounded-md border border-input bg-white dark:bg-slate-800 dark:text-white px-3 text-sm font-medium'
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

      {groupedByKode.length === 0 ? (
        <div className='text-center py-16 text-slate-500'>
          <p>Tidak ada data pendapatan untuk {MONTHS[selectedBulan - 1]} {tahunAktif}</p>
        </div>
      ) : (
        <div className='space-y-4'>
          {groupedByKode.map((group) => (
            <Card key={group.kode}>
              <CardHeader className='pb-2'>
                <CardTitle className='flex items-center justify-between'>
                  <div>
                    <span className='font-mono text-sm bg-slate-100 dark:bg-slate-700 dark:text-white px-2 py-0.5 rounded mr-2'>{group.kode}</span>
                    <span className='text-lg'>{group.mataAnggaran}</span>
                  </div>
                  <span className='text-green-600 font-bold'>{formatCurrency(group.total)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b dark:border-slate-700 text-left text-slate-500'>
                      <th className='pb-2 pr-4'>No</th>
                      <th className='pb-2 pr-4'>Tanggal</th>
                      <th className='pb-2 pr-4'>Uraian</th>
                      <th className='pb-2 text-right'>Penerimaan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.txs
                      .sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime())
                      .map((tx) => (
                        <tr key={tx.id} className='border-b last:border-0 dark:border-slate-700 dark:text-slate-200'>
                          <td className='py-2 pr-4'>{tx.no}</td>
                          <td className='py-2 pr-4'>{new Date(tx.tanggal).toLocaleDateString('id-ID')}</td>
                          <td className='py-2 pr-4'>{tx.uraian}</td>
                          <td className='py-2 text-right text-green-600 dark:text-green-400 font-medium'>
                            {formatCurrency(Number(tx.penerimaan || 0))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          {/* Grand Total */}
          <Card ref={bottomTotalRef} className='bg-slate-900 text-white'>
            <CardContent className='flex items-center justify-between py-4'>
              <span className='text-lg font-bold'>TOTAL PENDAPATAN {MONTHS[selectedBulan - 1].toUpperCase()} {tahunAktif}</span>
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
