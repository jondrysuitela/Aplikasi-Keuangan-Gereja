import { useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { formatCurrency, getMonthName } from '@/lib/utils';

export function RekonsiliasiPage() {
  const { doorscrieftTransaksis, tahunAktif } = useStore();
  const [selectedBulan, setSelectedBulan] = useState(new Date().getMonth() + 1);

  const data = (() => {
    const filtered = doorscrieftTransaksis.filter(
      (t) => new Date(t.tanggal).getFullYear() === tahunAktif && new Date(t.tanggal).getMonth() + 1 === selectedBulan
    );
    const totalPemasukan = filtered
      .filter((t) => Number(t.penerimaan || 0) !== 0)
      .reduce((sum, t) => sum + Number(t.penerimaan || 0), 0);
    const totalPengeluaran = filtered
      .filter((t) => Number(t.pengeluaran || 0) !== 0)
      .reduce((sum, t) => sum + Number(t.pengeluaran || 0), 0);
    return { totalPemasukan, totalPengeluaran };
  })();

  const totalSaldo = data.totalPemasukan - data.totalPengeluaran;

  // Detail by kode anggaran
  const detailPemasukan = doorscrieftTransaksis
    .filter((t) => new Date(t.tanggal).getFullYear() === tahunAktif && new Date(t.tanggal).getMonth() + 1 === selectedBulan && Number(t.penerimaan || 0) !== 0)
    .reduce((acc: { kode: string; nama: string; total: number }[], t) => {
      const key = t.kodeAnggaran;
      const existing = acc.find((a) => a.kode === key);
      if (existing) existing.total += Number(t.penerimaan || 0);
      else acc.push({ kode: key, nama: t.mataAnggaran, total: Number(t.penerimaan || 0) });
      return acc;
    }, []).sort((a, b) => b.total - a.total);

  const detailPengeluaran = doorscrieftTransaksis
    .filter((t) => new Date(t.tanggal).getFullYear() === tahunAktif && new Date(t.tanggal).getMonth() + 1 === selectedBulan && Number(t.pengeluaran || 0) !== 0)
    .reduce((acc: { kode: string; nama: string; total: number }[], t) => {
      const key = t.kodeAnggaran;
      const existing = acc.find((a) => a.kode === key);
      if (existing) existing.total += Number(t.pengeluaran || 0);
      else acc.push({ kode: key, nama: t.mataAnggaran, total: Number(t.pengeluaran || 0) });
      return acc;
    }, []).sort((a, b) => b.total - a.total);

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Rekonsiliasi</h1>
        <p className='text-slate-500 dark:text-slate-400'>Cocokkan pemasukan dan pengeluaran berdasarkan Kode Anggaran</p>
      </div>

      <div className='flex items-center gap-4'>
        <Calendar className='text-slate-500 dark:text-slate-400' />
        <select
          className='h-10 rounded-md border border-input bg-white dark:bg-slate-800 dark:text-white px-3 text-sm font-medium'
          value={selectedBulan}
          onChange={(e) => setSelectedBulan(Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((bulan) => (
            <option key={bulan} value={bulan}>
              {getMonthName(bulan)}
            </option>
          ))}
        </select>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardContent className='pt-6'>
            <div className='text-center'>
              <p className='text-sm text-slate-500'>Total Pemasukan</p>
              <p className='text-2xl font-bold text-green-600 mt-2'>{formatCurrency(data.totalPemasukan)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6'>
            <div className='text-center'>
              <p className='text-sm text-slate-500'>Total Pengeluaran</p>
              <p className='text-2xl font-bold text-red-600 mt-2'>{formatCurrency(data.totalPengeluaran)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className={totalSaldo >= 0 ? 'border-green-500' : 'border-red-500'}>
          <CardContent className='pt-6'>
            <div className='text-center'>
              <p className='text-sm text-slate-500'>Saldo</p>
              <p className={'text-2xl font-bold mt-2 ' + (totalSaldo >= 0 ? 'text-green-600' : 'text-red-600')}>
                {formatCurrency(totalSaldo)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            {totalSaldo >= 0 ? (
              <CheckCircle className='h-5 w-5 text-green-600' />
            ) : (
              <AlertCircle className='h-5 w-5 text-red-600' />
            )}
            Status Rekonsiliasi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalSaldo >= 0 ? (
            <div className='p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800'>
              <p className='text-green-800 dark:text-green-300 font-medium'>Saldo Positif</p>
              <p className='text-green-600 dark:text-green-400 text-sm mt-1'>Pemasukan lebih besar dari pengeluaran. Keuangan sehat.</p>
            </div>
          ) : (
            <div className='p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800'>
              <p className='text-red-800 dark:text-red-300 font-medium'>Saldo Negatif</p>
              <p className='text-red-600 dark:text-red-400 text-sm mt-1'>Pengeluaran lebih besar dari pemasukan. Perlu perhatian khusus.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail per Kode Anggaran */}
      <div className='grid gap-6 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-green-600'>Pemasukan per Kode Anggaran</CardTitle>
          </CardHeader>
          <CardContent>
            {detailPemasukan.length > 0 ? (
              <div className='space-y-2'>
                {detailPemasukan.map((item) => (
                  <div key={item.kode} className='flex justify-between items-center border-b dark:border-slate-700 pb-2 last:border-0'>
                    <div>
                      <span className='font-mono text-xs text-slate-500 dark:text-slate-400'>{item.kode}</span>
                      <p className='text-sm text-slate-700 dark:text-slate-200'>{item.nama}</p>
                    </div>
                    <span className='font-medium text-green-600 dark:text-green-400'>{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className='text-center text-slate-500 dark:text-slate-400 py-8'>Tidak ada data pemasukan bulan ini</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-red-600'>Pengeluaran per Kode Anggaran</CardTitle>
          </CardHeader>
          <CardContent>
            {detailPengeluaran.length > 0 ? (
              <div className='space-y-2'>
                {detailPengeluaran.map((item) => (
                  <div key={item.kode} className='flex justify-between items-center border-b dark:border-slate-700 pb-2 last:border-0'>
                    <div>
                      <span className='font-mono text-xs text-slate-500 dark:text-slate-400'>{item.kode}</span>
                      <p className='text-sm text-slate-700 dark:text-slate-200'>{item.nama}</p>
                    </div>
                    <span className='font-medium text-red-600 dark:text-red-400'>{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className='text-center text-slate-500 dark:text-slate-400 py-8'>Tidak ada data pengeluaran bulan ini</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
