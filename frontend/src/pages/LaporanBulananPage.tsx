import { useMemo, useState } from 'react';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Edit2, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { churchLogoUrl } from '@/lib/assets';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function LaporanBulananPage() {
  const { doorscrieftTransaksis, tahunAktif, namaJemaat, setNamaJemaat } = useStore();

  const [editKop, setEditKop] = useState(false);
  const [kopGereja, setKopGereja] = useState('Gereja Protestan Maluku');
  const [kopSub, setKopSub] = useState('(ANGGOTA PGI)');
  const [kopKlas, setKopKlas] = useState('KLASIS PULAU AMBON TIMUR');

  const monthlyData = useMemo(() => {
    return MONTHS.map((_, monthIdx) => {
      const month = monthIdx + 1;
      const filtered = doorscrieftTransaksis.filter(
        (t) => new Date(t.tanggal).getFullYear() === tahunAktif && new Date(t.tanggal).getMonth() + 1 === month
      );
      const jumlahPendapatan = filtered.reduce((s, t) => s + Number(t.penerimaan || 0), 0);
      const jumlahPengeluaran = filtered.reduce((s, t) => s + Number(t.pengeluaran || 0), 0);
      const ukpPendapatan = filtered
        .filter((t) => t.kodeAnggaran?.startsWith('I.6.'))
        .reduce((s, t) => s + Number(t.penerimaan || 0), 0);
      const ukpPengeluaran = filtered
        .filter((t) => t.kodeAnggaran?.startsWith('II.6.'))
        .reduce((s, t) => s + Number(t.pengeluaran || 0), 0);
      return { month, monthName: MONTHS[monthIdx], jumlahPendapatan, jumlahPengeluaran, ukpPendapatan, ukpPengeluaran };
    });
  }, [doorscrieftTransaksis, tahunAktif]);

  const totalPendapatan = monthlyData.reduce((s, m) => s + m.jumlahPendapatan, 0);
  const totalPengeluaran = monthlyData.reduce((s, m) => s + m.jumlahPengeluaran, 0);
  const totalUkpPendapatan = monthlyData.reduce((s, m) => s + m.ukpPendapatan, 0);
  const totalUkpPengeluaran = monthlyData.reduce((s, m) => s + m.ukpPengeluaran, 0);
  const pendapatanMurniPendapatan = totalPendapatan - totalUkpPendapatan;
  const pendapatanMurniPengeluaran = totalPengeluaran - totalUkpPengeluaran;
  const grandTotalPendapatan = totalPendapatan;
  const grandTotalPengeluaran = totalPengeluaran;
  const sisaSaldo = totalPendapatan - totalPengeluaran;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Realisasi Perbulan</h1>
          <p className='text-slate-500'>Realisasi per bulan</p>
        </div>
        <div className='flex gap-3'>
          <Button variant='outline' size='sm' onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {/* Print-target wrapper */}
      <div className='print-target'>
        {/* Header - inline editable */}
        <div className='relative flex items-center justify-center gap-4 mb-2'>
          <img src={churchLogoUrl} alt="GPM" className="w-20 h-20 flex-shrink-0" />
          <div className='text-center'>
            {editKop ? (
              <div className='space-y-1'>
                <input className='text-center text-sm font-bold uppercase w-full border rounded px-1 dark:bg-slate-700 dark:text-white dark:border-slate-600' value={kopGereja} onChange={(e) => setKopGereja(e.target.value)} />
                <input className='text-center text-xs w-full border rounded px-1 dark:bg-slate-700 dark:text-white dark:border-slate-600' value={kopSub} onChange={(e) => setKopSub(e.target.value)} />
                <input className='text-center text-xs font-bold uppercase w-full border rounded px-1 dark:bg-slate-700 dark:text-white dark:border-slate-600' value={kopKlas} onChange={(e) => setKopKlas(e.target.value)} />
                <input className='text-center text-sm font-bold uppercase w-full border rounded px-1 dark:bg-slate-700 dark:text-white dark:border-slate-600' value={namaJemaat} onChange={(e) => setNamaJemaat(e.target.value)} />
              </div>
            ) : (
              <>
                <p className='text-sm font-bold uppercase dark:text-white'>{kopGereja}</p>
                <p className='text-xs dark:text-slate-300'>{kopSub}</p>
                <p className='text-xs font-bold uppercase dark:text-white'>{kopKlas}</p>
                <p className='text-sm font-bold uppercase dark:text-white'>{namaJemaat}</p>
              </>
            )}
            <p className='text-base font-bold uppercase mt-1 dark:text-white'>REALISASI PERBULAN</p>
          </div>
          <div className='absolute right-0 top-1/2 -translate-y-1/2'>
            <Button variant='ghost' size='sm' className='print-hidden' onClick={() => setEditKop(!editKop)}>
              {editKop ? <Check className='h-4 w-4 mr-1' /> : <Edit2 className='h-4 w-4 mr-1' />}
              {editKop ? 'Selesai' : 'Edit'}
            </Button>
          </div>
        </div>

        {/* Table */}
        <table className='w-full border-collapse text-xs dark:text-slate-200'>
          <thead>
            <tr className='bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600'>
              <th className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 w-8 text-center dark:text-white'>No</th>
              <th className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 w-40 dark:text-white'>URAIAN</th>
              <th className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-center w-24 dark:text-white'>JUMLAH PENDAPATAN</th>
              <th className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-center w-24 dark:text-white'>JUMLAH PENGELUARAN</th>
              <th className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-center' colSpan={2}>UKP</th>
            </tr>
            <tr className='bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600'>
              <th className='border border-slate-300 dark:border-slate-600 px-1 py-1.5' colSpan={4}></th>
              <th className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-center w-20 dark:text-white'>PENDAPATAN</th>
              <th className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-center w-20 dark:text-white'>PENGELUARAN</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((m, idx) => (
              <tr key={m.month} className='border-b dark:border-slate-700'>
                <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-center'>{idx + 1}</td>
                <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5'>{m.monthName} {tahunAktif}</td>
                <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{m.jumlahPendapatan > 0 ? formatCurrency(m.jumlahPendapatan) : ''}</td>
                <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{m.jumlahPengeluaran > 0 ? formatCurrency(m.jumlahPengeluaran) : ''}</td>
                <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{m.ukpPendapatan > 0 ? formatCurrency(m.ukpPendapatan) : ''}</td>
                <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{m.ukpPengeluaran > 0 ? formatCurrency(m.ukpPengeluaran) : ''}</td>
              </tr>
            ))}
            {/* PENDAPATAN MURNI */}
            <tr className='font-bold bg-slate-50 dark:bg-slate-700 dark:text-white'>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5'></td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5'>PENDAPATAN MURNI</td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{formatCurrency(pendapatanMurniPendapatan)}</td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{formatCurrency(pendapatanMurniPengeluaran)}</td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{formatCurrency(totalUkpPendapatan)}</td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{formatCurrency(totalUkpPengeluaran)}</td>
            </tr>
            {/* TOTAL */}
            <tr className='font-bold bg-slate-50 dark:bg-slate-700 dark:text-white'>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5'></td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5'>TOTAL</td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{formatCurrency(grandTotalPendapatan)}</td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{formatCurrency(grandTotalPengeluaran)}</td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'>{formatCurrency(totalUkpPendapatan)}</td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono'></td>
            </tr>
            {/* SISA SALDO */}
            <tr className='font-bold'>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5'></td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5'>SISA SALDO</td>
              <td className='border border-slate-300 dark:border-slate-600 px-1 py-1.5 text-right font-mono' colSpan={4}>
                {formatCurrency(sisaSaldo)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
