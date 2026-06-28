import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { formatCurrency, getLatestFilledMonth, getMonthName } from '@/lib/utils';
import { ReportPrintButton, ReportPrintDocument } from '@/components/print/ReportPrint';
import { AppStateMessage } from '@/components/AppStateMessage';

export function RekonsiliasiPage() {
  const { doorscrieftTransaksis, tahunAktif } = useStore();
  const [selectedBulan, setSelectedBulan] = useState(new Date().getMonth() + 1);
  const hasUserSelectedMonthRef = useRef(false);

  useEffect(() => {
    hasUserSelectedMonthRef.current = false;
  }, [tahunAktif]);

  useEffect(() => {
    if (hasUserSelectedMonthRef.current) return;
    const filledMonth = getLatestFilledMonth(
      doorscrieftTransaksis,
      tahunAktif,
      (row) => Number(row.penerimaan || 0) !== 0 || Number(row.pengeluaran || 0) !== 0,
    );
    if (filledMonth) setSelectedBulan(filledMonth);
  }, [doorscrieftTransaksis, tahunAktif]);

  const cumulativeData = (() => {
    const filtered = doorscrieftTransaksis.filter((t) => {
      const tanggal = new Date(t.tanggal);
      return tanggal.getFullYear() === tahunAktif && tanggal.getMonth() + 1 <= selectedBulan;
    });
    const totalPemasukan = filtered
      .filter((t) => Number(t.penerimaan || 0) !== 0)
      .reduce((sum, t) => sum + Number(t.penerimaan || 0), 0);
    const totalPengeluaran = filtered
      .filter((t) => Number(t.pengeluaran || 0) !== 0)
      .reduce((sum, t) => sum + Number(t.pengeluaran || 0), 0);
    return { totalPemasukan, totalPengeluaran };
  })();

  const totalSaldo = cumulativeData.totalPemasukan - cumulativeData.totalPengeluaran;

  // Detail by kode anggaran
  const detailPemasukan = doorscrieftTransaksis
    .filter((t) => {
      const tanggal = new Date(t.tanggal);
      return tanggal.getFullYear() === tahunAktif && tanggal.getMonth() + 1 <= selectedBulan && Number(t.penerimaan || 0) !== 0;
    })
    .reduce((acc: { kode: string; nama: string; total: number }[], t) => {
      const key = t.kodeAnggaran;
      const existing = acc.find((a) => a.kode === key);
      if (existing) existing.total += Number(t.penerimaan || 0);
      else acc.push({ kode: key, nama: t.mataAnggaran, total: Number(t.penerimaan || 0) });
      return acc;
    }, []).sort((a, b) => b.total - a.total);

  const detailPengeluaran = doorscrieftTransaksis
    .filter((t) => {
      const tanggal = new Date(t.tanggal);
      return tanggal.getFullYear() === tahunAktif && tanggal.getMonth() + 1 <= selectedBulan && Number(t.pengeluaran || 0) !== 0;
    })
    .reduce((acc: { kode: string; nama: string; total: number }[], t) => {
      const key = t.kodeAnggaran;
      const existing = acc.find((a) => a.kode === key);
      if (existing) existing.total += Number(t.pengeluaran || 0);
      else acc.push({ kode: key, nama: t.mataAnggaran, total: Number(t.pengeluaran || 0) });
      return acc;
    }, []).sort((a, b) => b.total - a.total);

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Rekonsiliasi</h1>
          <p className='text-slate-500 dark:text-slate-400'>Cocokkan pemasukan dan pengeluaran kumulatif berdasarkan Kode Anggaran</p>
        </div>
        <ReportPrintButton title={`Rekonsiliasi_Januari_sd_${getMonthName(selectedBulan)}_${tahunAktif}`} />
      </div>

      <ReportPrintDocument
        title='REKONSILIASI'
        subtitle={`Januari - ${getMonthName(selectedBulan)} ${tahunAktif}`}
        meta={[
          { label: 'Cakupan', value: `Januari - ${getMonthName(selectedBulan)} ${tahunAktif}` },
          { label: 'Total Pendapatan', value: formatCurrency(cumulativeData.totalPemasukan) },
          { label: 'Total Pengeluaran', value: formatCurrency(cumulativeData.totalPengeluaran) },
          { label: 'Saldo', value: formatCurrency(totalSaldo) },
          { label: 'Status', value: totalSaldo >= 0 ? 'Saldo Positif' : 'Saldo Negatif' },
        ]}
      >
        <table>
          <thead>
            <tr>
              <th>Keterangan</th>
              <th className='text-right'>Pendapatan</th>
              <th className='text-right'>Pengeluaran</th>
              <th className='text-right'>Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className='font-bold'>
              <td>Akumulasi Januari - {getMonthName(selectedBulan)} {tahunAktif}</td>
              <td className='text-right'>{formatCurrency(cumulativeData.totalPemasukan)}</td>
              <td className='text-right'>{formatCurrency(cumulativeData.totalPengeluaran)}</td>
              <td className='text-right'>{formatCurrency(totalSaldo)}</td>
            </tr>
          </tbody>
        </table>

        <div className='mt-4 grid grid-cols-2 gap-4'>
          <table>
            <thead>
              <tr>
                <th colSpan={3}>Pendapatan per Kode Anggaran</th>
              </tr>
              <tr>
                <th>Kode</th>
                <th>Mata Anggaran</th>
                <th className='text-right'>Total</th>
              </tr>
            </thead>
            <tbody>
              {detailPemasukan.length === 0 ? (
                <tr><td colSpan={3} className='text-center'>Tidak ada data pendapatan.</td></tr>
              ) : detailPemasukan.map((item) => (
                <tr key={item.kode}>
                  <td>{item.kode}</td>
                  <td>{item.nama}</td>
                  <td className='text-right'>{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th colSpan={3}>Pengeluaran per Kode Anggaran</th>
              </tr>
              <tr>
                <th>Kode</th>
                <th>Mata Anggaran</th>
                <th className='text-right'>Total</th>
              </tr>
            </thead>
            <tbody>
              {detailPengeluaran.length === 0 ? (
                <tr><td colSpan={3} className='text-center'>Tidak ada data pengeluaran.</td></tr>
              ) : detailPengeluaran.map((item) => (
                <tr key={item.kode}>
                  <td>{item.kode}</td>
                  <td>{item.nama}</td>
                  <td className='text-right'>{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportPrintDocument>

      <div className='flex items-center gap-4'>
        <Calendar className='text-slate-500 dark:text-slate-400' />
        <span className='text-sm font-medium text-slate-600 dark:text-slate-300'>Akumulasi sampai</span>
        <select
          className='h-10 rounded-md border border-input bg-white dark:bg-slate-800 dark:text-white px-3 text-sm font-medium'
          value={selectedBulan}
          onChange={(e) => {
            hasUserSelectedMonthRef.current = true;
            setSelectedBulan(Number(e.target.value));
          }}
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
              <p className='text-2xl font-bold text-green-600 mt-2'>{formatCurrency(cumulativeData.totalPemasukan)}</p>
              <p className='mt-1 text-xs text-slate-500'>Januari - {getMonthName(selectedBulan)} {tahunAktif}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6'>
            <div className='text-center'>
              <p className='text-sm text-slate-500'>Total Pengeluaran</p>
              <p className='text-2xl font-bold text-red-600 mt-2'>{formatCurrency(cumulativeData.totalPengeluaran)}</p>
              <p className='mt-1 text-xs text-slate-500'>Januari - {getMonthName(selectedBulan)} {tahunAktif}</p>
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
              <p className='mt-1 text-xs text-slate-500'>Januari - {getMonthName(selectedBulan)} {tahunAktif}</p>
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
              <p className='text-green-600 dark:text-green-400 text-sm mt-1'>Akumulasi pemasukan Januari sampai {getMonthName(selectedBulan)} {tahunAktif} lebih besar dari pengeluaran.</p>
            </div>
          ) : (
            <div className='p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800'>
              <p className='text-red-800 dark:text-red-300 font-medium'>Saldo Negatif</p>
              <p className='text-red-600 dark:text-red-400 text-sm mt-1'>Akumulasi pengeluaran Januari sampai {getMonthName(selectedBulan)} {tahunAktif} lebih besar dari pemasukan. Perlu perhatian khusus.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail per Kode Anggaran */}
      <div className='grid gap-6 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-green-600'>Pemasukan per Kode Anggaran - s.d. {getMonthName(selectedBulan)}</CardTitle>
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
              <AppStateMessage compact title='Belum ada data pemasukan' detail={`Tidak ada data pemasukan sampai ${getMonthName(selectedBulan)} ${tahunAktif}.`} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-red-600'>Pengeluaran per Kode Anggaran - s.d. {getMonthName(selectedBulan)}</CardTitle>
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
              <AppStateMessage compact title='Belum ada data pengeluaran' detail={`Tidak ada data pengeluaran sampai ${getMonthName(selectedBulan)} ${tahunAktif}.`} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
