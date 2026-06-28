import { useMemo, useState } from 'react';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Download, Edit2, FileText, ShieldCheck, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Wallet, Eye } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { churchLogoUrl } from '@/lib/assets';
import { getDoorscrieftValidationIssues, summarizeValidationForExport } from '@/lib/dataValidation';
import { can } from '@/lib/permissions';
import { getElectronAPI } from '@/lib/electron';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ReportPrintButton } from '@/components/print/ReportPrint';
import { toast } from 'sonner';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function LaporanBulananPage() {
  const {
    doorscrieftTransaksis,
    kodeAnggarans,
    tahunAktif,
    namaJemaat,
    setNamaJemaat,
    user,
    kopGereja: storedKopGereja,
    kopKlas: storedKopKlas,
    penandatanganKiriJabatan,
    penandatanganKiriNama,
    penandatanganKananJabatan,
    penandatanganKananNama,
    addAuditLog,
  } = useStore();

  const canExport = can(user?.role, 'export');
  const confirm = useConfirm();
  const [editKop, setEditKop] = useState(false);
  const [kopGereja, setKopGereja] = useState('Gereja Protestan Maluku');
  const [kopSub, setKopSub] = useState('(ANGGOTA PGI)');
  const [kopKlas, setKopKlas] = useState('KLASIS PULAU AMBON TIMUR');
  const [bulanAwal, setBulanAwal] = useState(1);
  const [bulanAkhir, setBulanAkhir] = useState(12);

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
      return {
        month,
        monthName: MONTHS[monthIdx],
        transaksi: filtered.length,
        jumlahPendapatan,
        jumlahPengeluaran,
        ukpPendapatan,
        ukpPengeluaran,
      };
    });
  }, [doorscrieftTransaksis, tahunAktif]);

  const tahunRows = useMemo(() => doorscrieftTransaksis.filter((row) => {
    const tanggal = new Date(row.tanggal);
    return !Number.isNaN(tanggal.getTime()) && tanggal.getFullYear() === tahunAktif;
  }), [doorscrieftTransaksis, tahunAktif]);

  const validationSummary = useMemo(() => {
    return summarizeValidationForExport(getDoorscrieftValidationIssues(doorscrieftTransaksis, kodeAnggarans, tahunAktif));
  }, [doorscrieftTransaksis, kodeAnggarans, tahunAktif]);

  const normalizedBulanAwal = Math.min(bulanAwal, bulanAkhir);
  const normalizedBulanAkhir = Math.max(bulanAwal, bulanAkhir);
  const reportRows = monthlyData.filter((m) => m.month >= normalizedBulanAwal && m.month <= normalizedBulanAkhir);
  const periodRows = tahunRows.filter((row) => {
    const tanggal = new Date(row.tanggal);
    const month = tanggal.getMonth() + 1;
    return month >= normalizedBulanAwal && month <= normalizedBulanAkhir;
  });
  const periodLabel = normalizedBulanAwal === normalizedBulanAkhir
    ? `${MONTHS[normalizedBulanAwal - 1]} ${tahunAktif}`
    : `${MONTHS[normalizedBulanAwal - 1]} - ${MONTHS[normalizedBulanAkhir - 1]} ${tahunAktif}`;
  const totalPendapatan = reportRows.reduce((s, m) => s + m.jumlahPendapatan, 0);
  const totalPengeluaran = reportRows.reduce((s, m) => s + m.jumlahPengeluaran, 0);
  const totalUkpPendapatan = reportRows.reduce((s, m) => s + m.ukpPendapatan, 0);
  const totalUkpPengeluaran = reportRows.reduce((s, m) => s + m.ukpPengeluaran, 0);
  const pendapatanMurniPendapatan = totalPendapatan - totalUkpPendapatan;
  const pendapatanMurniPengeluaran = totalPengeluaran - totalUkpPengeluaran;
  const sisaSaldo = totalPendapatan - totalPengeluaran;
  const activeMonths = reportRows.filter((m) => m.transaksi > 0).length;
  const printedAt = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const reportStatus = validationSummary.errors > 0
    ? 'Perlu Perbaikan'
    : validationSummary.warnings > 0
      ? 'Siap dengan Catatan'
      : 'Siap Cetak';
  const handleExportExcel = async () => {
    if (!canExport) {
      toast.error('Role Anda tidak memiliki izin export.');
      return;
    }
    const electronAPI = getElectronAPI();
    if (!electronAPI?.exportRealisasiPerbulan) {
      toast.error('Export Excel Realisasi Perbulan hanya tersedia di aplikasi desktop Electron.');
      return;
    }

    if (validationSummary.errors > 0) {
      const lanjut = await confirm({
        title: 'Export dengan data bermasalah?',
        description: `Ditemukan ${validationSummary.errors} error data dan ${validationSummary.warnings} peringatan. Pilih Batal untuk membuka halaman Cek Data.`,
        confirmText: 'Tetap Export',
        tone: 'warning',
      });
      if (!lanjut) {
        window.location.hash = '#/cek-data';
        return;
      }
    }

    const result = await electronAPI.exportRealisasiPerbulan({
      tahun: tahunAktif,
      namaJemaat,
      namaGereja: storedKopGereja || kopGereja,
      kopSub,
      klasis: storedKopKlas || kopKlas,
      monthlyData: reportRows,
      periode: {
        bulanAwal: normalizedBulanAwal,
        bulanAkhir: normalizedBulanAkhir,
        label: periodLabel,
      },
      totals: {
        totalPendapatan,
        totalPengeluaran,
        totalUkpPendapatan,
        totalUkpPengeluaran,
        pendapatanMurniPendapatan,
        pendapatanMurniPengeluaran,
        sisaSaldo,
      },
      validationSummary,
      reportStatus,
      printedAt,
    });

    if (result.success) {
      addAuditLog('Export Realisasi Perbulan', 'Excel', result.path || `Tahun ${tahunAktif}`, result.path || '');
      toast.success('Realisasi Perbulan berhasil diexport.', { description: result.path || '' });
    } else if (!result.canceled) {
      toast.error(`Gagal export: ${result.error || 'Unknown error'}`);
    }
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300'>
            <FileText className='h-4 w-4' />
            Realisasi Perbulan
          </div>
          <h1 className='mt-1 text-2xl font-bold text-slate-900 dark:text-white'>Realisasi Perbulan</h1>
          <p className='text-slate-500 dark:text-slate-400'>Konsolidasi laporan, validasi, preview cetak, dan jalur review periode {periodLabel}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' onClick={() => { window.location.hash = '#/cek-data'; }}>
            <ShieldCheck className='mr-2 h-4 w-4' /> Cek Data
          </Button>
          <Button variant='outline' onClick={handleExportExcel} disabled={!canExport}>
            <Download className='mr-2 h-4 w-4' /> Export Excel
          </Button>
          <ReportPrintButton title={`Realisasi_Perbulan_${MONTHS[normalizedBulanAwal - 1]}_sd_${MONTHS[normalizedBulanAkhir - 1]}_${tahunAktif}`} disabled={!canExport} />
        </div>
      </div>

      <Card className='print-hidden'>
        <CardContent className='p-4'>
          <div className='grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end'>
            <div>
              <p className='text-sm font-semibold text-slate-900 dark:text-white'>Periode Laporan</p>
              <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
                Semua ringkasan, kartu laporan, preview, export, dan cetak Realisasi Perbulan mengikuti rentang ini.
              </p>
            </div>
            <div className='flex flex-wrap items-end gap-3'>
              <label className='grid gap-1 text-sm'>
                <span className='text-xs font-medium text-slate-500 dark:text-slate-400'>Bulan Awal</span>
                <select
                  value={bulanAwal}
                  onChange={(e) => setBulanAwal(Number(e.target.value))}
                  className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
              </label>
              <label className='grid gap-1 text-sm'>
                <span className='text-xs font-medium text-slate-500 dark:text-slate-400'>Bulan Akhir</span>
                <select
                  value={bulanAkhir}
                  onChange={(e) => setBulanAkhir(Number(e.target.value))}
                  className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
              </label>
              <Button variant='outline' onClick={() => { setBulanAwal(1); setBulanAkhir(12); }}>
                Tahun Penuh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className='overflow-hidden print-hidden'>
        <CardHeader className='border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div>
              <CardTitle className='text-base'>Ringkasan Kesiapan Laporan</CardTitle>
              <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
                Gunakan panel ini sebagai titik awal review sebelum mencetak atau export laporan.
              </p>
            </div>
            <div className={`inline-flex w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
              validationSummary.errors > 0
                ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                : validationSummary.warnings > 0
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
            }`}>
              {validationSummary.errors > 0 ? <AlertTriangle className='h-4 w-4' /> : <ShieldCheck className='h-4 w-4' />}
              {reportStatus}
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-4'>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <ReportMetric label='Transaksi Periode' value={String(periodRows.length)} detail={`${activeMonths} dari ${reportRows.length} bulan memiliki data`} />
            <ReportMetric label='Pendapatan' value={formatCurrency(totalPendapatan)} detail='Total penerimaan tercatat' tone='good' />
            <ReportMetric label='Pengeluaran' value={formatCurrency(totalPengeluaran)} detail='Total pengeluaran tercatat' tone='bad' />
            <ReportMetric label='Validasi' value={`${validationSummary.errors} error`} detail={`${validationSummary.warnings} peringatan`} tone={validationSummary.errors > 0 ? 'bad' : validationSummary.warnings > 0 ? 'warn' : 'good'} />
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4 print-hidden'>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Total Pendapatan</p>
                <p className='mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(totalPendapatan)}</p>
              </div>
              <ArrowUpCircle className='h-5 w-5 text-emerald-600' />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Total Pengeluaran</p>
                <p className='mt-2 text-xl font-bold text-rose-700 dark:text-rose-300'>{formatCurrency(totalPengeluaran)}</p>
              </div>
              <ArrowDownCircle className='h-5 w-5 text-rose-600' />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Sisa Saldo</p>
                <p className={`mt-2 text-xl font-bold ${sisaSaldo >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-700 dark:text-rose-300'}`}>
                  {formatCurrency(sisaSaldo)}
                </p>
              </div>
              <Wallet className='h-5 w-5 text-slate-500' />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Status Laporan</p>
                <p className={`mt-2 text-base font-bold ${
                  validationSummary.errors > 0
                    ? 'text-rose-700 dark:text-rose-300'
                    : validationSummary.warnings > 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                }`}>
                  {reportStatus}
                </p>
                <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>
                  {periodRows.length} transaksi, {activeMonths} bulan aktif
                </p>
              </div>
              {validationSummary.errors > 0 ? (
                <AlertTriangle className='h-5 w-5 text-rose-600' />
              ) : (
                <ShieldCheck className='h-5 w-5 text-emerald-600' />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className='print-hidden'>
        <CardHeader className='gap-3 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <CardTitle className='text-base'>Kesiapan Laporan</CardTitle>
            <p className='text-sm text-slate-500 dark:text-slate-400'>
              Validasi membantu memastikan laporan final tidak membawa tanggal, kode, atau nominal bermasalah.
            </p>
          </div>
          <div className='flex flex-wrap gap-2 text-sm'>
            <span className='rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 dark:border-slate-700 dark:text-slate-300'>
              Error: {validationSummary.errors}
            </span>
            <span className='rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 dark:border-slate-700 dark:text-slate-300'>
              Warning: {validationSummary.warnings}
            </span>
          </div>
        </CardHeader>
      </Card>

      <Card id='realisasi-perbulan' className='overflow-hidden scroll-mt-4'>
        <CardHeader className='print-hidden'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div>
              <CardTitle className='text-base'>Preview Dokumen Realisasi Perbulan</CardTitle>
              <p className='text-sm text-slate-500 dark:text-slate-400'>Area di bawah ini adalah bentuk laporan yang akan dicetak.</p>
            </div>
            <Button variant='outline' size='sm' onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <Eye className='mr-2 h-4 w-4' /> Kembali ke Pusat
            </Button>
          </div>
        </CardHeader>
        <CardContent className='p-4 lg:p-6'>
          <div className='print-target rounded-md border border-slate-200 bg-white p-4 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 print:border-0 print:p-0 print:shadow-none'>
            <div className='relative mb-4 flex items-center justify-center gap-4 border-b-2 border-slate-900 pb-3 dark:border-slate-200'>
              <img src={churchLogoUrl} alt='GPM' className='h-20 w-20 flex-shrink-0' />
              <div className='text-center'>
                {editKop ? (
                  <div className='space-y-1'>
                    <input className='w-full rounded border px-1 text-center text-sm font-bold uppercase dark:border-slate-600 dark:bg-slate-700 dark:text-white' value={kopGereja} onChange={(e) => setKopGereja(e.target.value)} />
                    <input className='w-full rounded border px-1 text-center text-xs dark:border-slate-600 dark:bg-slate-700 dark:text-white' value={kopSub} onChange={(e) => setKopSub(e.target.value)} />
                    <input className='w-full rounded border px-1 text-center text-xs font-bold uppercase dark:border-slate-600 dark:bg-slate-700 dark:text-white' value={kopKlas} onChange={(e) => setKopKlas(e.target.value)} />
                    <input className='w-full rounded border px-1 text-center text-sm font-bold uppercase dark:border-slate-600 dark:bg-slate-700 dark:text-white' value={namaJemaat} onChange={(e) => setNamaJemaat(e.target.value)} />
                  </div>
                ) : (
                  <>
                    <p className='text-sm font-bold uppercase'>{kopGereja}</p>
                    <p className='text-xs'>{kopSub}</p>
                    <p className='text-xs font-bold uppercase'>{kopKlas}</p>
                    <p className='text-sm font-bold uppercase'>{namaJemaat}</p>
                  </>
                )}
                <p className='mt-2 text-base font-bold uppercase'>REALISASI PERBULAN</p>
                <p className='text-xs uppercase tracking-wide'>Periode {periodLabel}</p>
              </div>
              <div className='absolute right-0 top-1/2 -translate-y-1/2 print-hidden'>
                <Button variant='ghost' size='sm' onClick={() => setEditKop(!editKop)}>
                  {editKop ? <Check className='mr-1 h-4 w-4' /> : <Edit2 className='mr-1 h-4 w-4' />}
                  {editKop ? 'Selesai' : 'Edit Kop'}
                </Button>
              </div>
            </div>

            <div className='print-hidden mb-3 grid gap-2 text-xs sm:grid-cols-3'>
              <div>
                <p className='text-slate-500 dark:text-slate-400'>Periode</p>
                <p className='font-semibold'>{periodLabel}</p>
              </div>
              <div>
                <p className='text-slate-500 dark:text-slate-400'>Tanggal Cetak</p>
                <p className='font-semibold'>{printedAt}</p>
              </div>
              <div>
                <p className='text-slate-500 dark:text-slate-400'>Status Validasi</p>
                <p className='font-semibold'>{reportStatus}</p>
              </div>
            </div>

            <div className='overflow-x-auto'>
              <table className='w-full min-w-[760px] border-collapse text-xs'>
                <thead>
                  <tr className='border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-700'>
                    <th className='w-8 border border-slate-300 px-1 py-1.5 text-center dark:border-slate-600'>No</th>
                    <th className='w-44 border border-slate-300 px-1 py-1.5 dark:border-slate-600'>URAIAN</th>
                    <th className='w-28 border border-slate-300 px-1 py-1.5 text-center dark:border-slate-600'>JUMLAH PENDAPATAN</th>
                    <th className='w-28 border border-slate-300 px-1 py-1.5 text-center dark:border-slate-600'>JUMLAH PENGELUARAN</th>
                    <th className='border border-slate-300 px-1 py-1.5 text-center dark:border-slate-600' colSpan={2}>UKP</th>
                  </tr>
                  <tr className='border border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-700'>
                    <th className='border border-slate-300 px-1 py-1.5 dark:border-slate-600' colSpan={4}></th>
                    <th className='w-24 border border-slate-300 px-1 py-1.5 text-center dark:border-slate-600'>PENDAPATAN</th>
                    <th className='w-24 border border-slate-300 px-1 py-1.5 text-center dark:border-slate-600'>PENGELUARAN</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((m, idx) => (
                    <tr key={m.month}>
                      <td className='border border-slate-300 px-1 py-1.5 text-center dark:border-slate-600'>{idx + 1}</td>
                      <td className='border border-slate-300 px-1 py-1.5 dark:border-slate-600'>{m.monthName} {tahunAktif}</td>
                      <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{m.jumlahPendapatan > 0 ? formatCurrency(m.jumlahPendapatan) : ''}</td>
                      <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{m.jumlahPengeluaran > 0 ? formatCurrency(m.jumlahPengeluaran) : ''}</td>
                      <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{m.ukpPendapatan > 0 ? formatCurrency(m.ukpPendapatan) : ''}</td>
                      <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{m.ukpPengeluaran > 0 ? formatCurrency(m.ukpPengeluaran) : ''}</td>
                    </tr>
                  ))}
                  <tr className='bg-slate-50 font-bold dark:bg-slate-700'>
                    <td className='border border-slate-300 px-1 py-1.5 dark:border-slate-600'></td>
                    <td className='border border-slate-300 px-1 py-1.5 dark:border-slate-600'>PENDAPATAN MURNI</td>
                    <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{formatCurrency(pendapatanMurniPendapatan)}</td>
                    <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{formatCurrency(pendapatanMurniPengeluaran)}</td>
                    <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{formatCurrency(totalUkpPendapatan)}</td>
                    <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{formatCurrency(totalUkpPengeluaran)}</td>
                  </tr>
                  <tr className='bg-slate-50 font-bold dark:bg-slate-700'>
                    <td className='border border-slate-300 px-1 py-1.5 dark:border-slate-600'></td>
                    <td className='border border-slate-300 px-1 py-1.5 dark:border-slate-600'>TOTAL</td>
                    <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{formatCurrency(totalPendapatan)}</td>
                    <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{formatCurrency(totalPengeluaran)}</td>
                    <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'>{formatCurrency(totalUkpPendapatan)}</td>
                    <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600'></td>
                  </tr>
                  <tr className='font-bold'>
                    <td className='border border-slate-300 px-1 py-1.5 dark:border-slate-600'></td>
                    <td className='border border-slate-300 px-1 py-1.5 dark:border-slate-600'>SISA SALDO</td>
                    <td className='border border-slate-300 px-1 py-1.5 text-right font-mono dark:border-slate-600' colSpan={4}>
                      {formatCurrency(sisaSaldo)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className='mt-6 grid grid-cols-2 gap-8 text-center text-xs'>
              <div>
                <p>Mengetahui,</p>
                <p className='font-semibold'>{penandatanganKiriJabatan || 'Ketua Majelis Jemaat'}</p>
                <div className='h-16' />
                <p className='border-t border-slate-400 pt-1 font-semibold'>{penandatanganKiriNama || '\u00A0'}</p>
              </div>
              <div>
                <p>Disusun oleh,</p>
                <p className='font-semibold'>{penandatanganKananJabatan || 'Bendahara Jemaat'}</p>
                <div className='h-16' />
                <p className='border-t border-slate-400 pt-1 font-semibold'>{penandatanganKananNama || '\u00A0'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  return (
    <div className='rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800'>
      <p className='text-xs font-medium text-slate-500 dark:text-slate-400'>{label}</p>
      <p className={`mt-1 text-lg font-bold ${
        tone === 'good'
          ? 'text-emerald-700 dark:text-emerald-300'
          : tone === 'warn'
            ? 'text-amber-700 dark:text-amber-300'
            : tone === 'bad'
              ? 'text-rose-700 dark:text-rose-300'
              : 'text-slate-900 dark:text-white'
      }`}>{value}</p>
      <p className='mt-0.5 text-xs text-slate-500 dark:text-slate-400'>{detail}</p>
    </div>
  );
}
