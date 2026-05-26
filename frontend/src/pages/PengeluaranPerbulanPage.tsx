import { useMemo, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Calendar } from 'lucide-react';
import type { DoorscrieftRowInput } from '@/types';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function isBelanjaRow(r: DoorscrieftRowInput) {
  return Number(r.pengeluaran || 0) !== 0 && Number(r.penerimaan || 0) === 0;
}

export function PengeluaranPerbulanPage() {
  const { kodeAnggarans, doorscrieftTransaksis, tahunAktif } = useStore();
  const [selectedBulan, setSelectedBulan] = useState(new Date().getMonth() + 1);

  const groupedByKode = useMemo(() => {
    const filtered = doorscrieftTransaksis.filter((r) => {
      return isBelanjaRow(r) && new Date(r.tanggal).getMonth() + 1 === selectedBulan && new Date(r.tanggal).getFullYear() === tahunAktif;
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
      entry.total += Number(tx.pengeluaran || 0);
    }

    return [...map.entries()]
      .map(([, v]) => v)
      .sort((a, b) => a.kode.localeCompare(b.kode));
  }, [doorscrieftTransaksis, kodeAnggarans, selectedBulan, tahunAktif]);

  const grandTotal = groupedByKode.reduce((s, g) => s + g.total, 0);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Pengeluaran Perbulan</h1>
          <p className='text-slate-500'>Pengeluaran per bulan berdasarkan kode anggaran</p>
        </div>
        <div className='flex gap-2 items-center'>
          <Calendar className='text-slate-500 h-4 w-4' />
          <select
            className='h-9 rounded-md border border-input bg-white dark:bg-slate-800 dark:text-white px-3 text-sm font-medium'
            value={selectedBulan}
            onChange={(e) => setSelectedBulan(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {groupedByKode.length === 0 ? (
        <div className='text-center py-16 text-slate-500'>
          <p>Tidak ada data pengeluaran untuk {MONTHS[selectedBulan - 1]} {tahunAktif}</p>
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
                  <span className='text-red-600 font-bold'>{formatCurrency(group.total)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b dark:border-slate-700 text-left text-slate-500'>
                      <th className='pb-2 pr-4'>No</th>
                      <th className='pb-2 pr-4'>Tanggal</th>
                      <th className='pb-2 pr-4'>Uraian</th>
                      <th className='pb-2 text-right'>Pengeluaran</th>
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
                          <td className='py-2 text-right text-red-600 dark:text-red-400 font-medium'>
                            {formatCurrency(Number(tx.pengeluaran || 0))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          {/* Grand Total */}
          <Card className='bg-slate-900 text-white'>
            <CardContent className='flex items-center justify-between py-4'>
              <span className='text-lg font-bold'>TOTAL PENGELUARAN {MONTHS[selectedBulan - 1].toUpperCase()} {tahunAktif}</span>
              <span className='text-xl font-bold'>{formatCurrency(grandTotal)}</span>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
