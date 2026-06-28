import { lazy, Suspense, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { applyBatangTubuhAnggaranForYear, useStore } from '@/stores';
import { cn, formatCurrency, getMonthName } from '@/lib/utils';
import { getDoorscrieftValidationIssues, summarizeValidationForExport } from '@/lib/dataValidation';
import { can } from '@/lib/permissions';
import { ArrowUpCircle, ArrowDownCircle, Wallet, TrendingUp, ClipboardCheck, FileText, Lock, ShieldCheck, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AppStateMessage } from '@/components/AppStateMessage';

const DashboardCharts = lazy(() => import('@/components/dashboard/DashboardCharts').then((m) => ({ default: m.DashboardCharts })));

type MonthlyDataItem = {
  bulan: string;
  pemasukan: number;
  pengeluaran: number;
};

type PieDatum = {
  name: string;
  value: number;
};

type RecentTransaction = {
  id: string;
  tanggal: Date;
  uraian: string;
  kodeAnggaran?: string;
  penerimaan: number;
  pengeluaran: number;
};

type BudgetDashboardRow = {
  kode: string;
  nama: string;
  anggaran: number;
  realisasi: number;
  selisih: number;
  percentage: number;
  status: 'good' | 'warn' | 'bad' | 'empty';
};

export function DashboardPage() {
  const {
    tahunAktif,
    doorscrieftTransaksis,
    pemasukans,
    pengeluarans,
    kategoriBelanjas,
    kodeAnggarans,
    lockedYears,
    activeProjectPath,
    lastSavedAt,
    hasUnsavedChanges,
    auditLogs,
    batangTubuhs,
    batangTubuhAnggaranByYear,
    batangTubuhProgramByYear,
    user,
  } = useStore();
  const [isDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const canInput = can(user?.role, 'input');
  const canExport = can(user?.role, 'export');
  const isCurrentYearLocked = lockedYears.includes(tahunAktif);

  const {
    currentSummary,
    monthlyData,
    kategoriData,
    recentPemasukan,
    recentPengeluaran,
    transactionCounts,
    lastTransactionDate,
    topCashMonth,
  } = useMemo(() => {
    const emptyMonths: MonthlyDataItem[] = Array.from({ length: 12 }, (_, index) => ({
      bulan: getMonthName(index + 1).substring(0, 3),
      pemasukan: 0,
      pengeluaran: 0,
    }));

    const recentRows: RecentTransaction[] = [];
    const expenseByCategory = new Map<string, number>();
    let totalPemasukan = 0;
    let totalPengeluaran = 0;
    let totalPemasukanRows = 0;
    let totalPengeluaranRows = 0;

    const addExpenseCategory = (name: string, amount: number) => {
      if (amount <= 0) return;
      const key = name || 'Tanpa Kategori';
      expenseByCategory.set(key, (expenseByCategory.get(key) || 0) + amount);
    };

    doorscrieftTransaksis.forEach((row) => {
      const tanggal = row.tanggal instanceof Date ? row.tanggal : new Date(row.tanggal);
      if (Number.isNaN(tanggal.getTime()) || tanggal.getFullYear() !== tahunAktif) return;

      const penerimaan = Number(row.penerimaan || 0);
      const pengeluaran = Number(row.pengeluaran || 0);
      const monthIndex = tanggal.getMonth();

      totalPemasukan += penerimaan;
      totalPengeluaran += pengeluaran;
      if (penerimaan > 0) totalPemasukanRows += 1;
      if (pengeluaran > 0) totalPengeluaranRows += 1;
      emptyMonths[monthIndex].pemasukan += penerimaan;
      emptyMonths[monthIndex].pengeluaran += pengeluaran;
      addExpenseCategory(row.mataAnggaran || row.kodeAnggaran, pengeluaran);

      recentRows.push({
        id: row.id,
        tanggal,
        uraian: row.uraian,
        kodeAnggaran: row.kodeAnggaran,
        penerimaan,
        pengeluaran,
      });
    });

    pemasukans.forEach((row) => {
      const tanggal = row.tanggal instanceof Date ? row.tanggal : new Date(row.tanggal);
      if (Number.isNaN(tanggal.getTime()) || tanggal.getFullYear() !== tahunAktif) return;

      const jumlah = Number(row.jumlah || 0);
      if (jumlah > 0) totalPemasukanRows += 1;
      totalPemasukan += jumlah;
      emptyMonths[tanggal.getMonth()].pemasukan += jumlah;
      recentRows.push({
        id: row.id,
        tanggal,
        uraian: row.keterangan,
        penerimaan: jumlah,
        pengeluaran: 0,
      });
    });

    pengeluarans.forEach((row) => {
      const tanggal = row.tanggal instanceof Date ? row.tanggal : new Date(row.tanggal);
      if (Number.isNaN(tanggal.getTime()) || tanggal.getFullYear() !== tahunAktif) return;

      const jumlah = Number(row.jumlah || 0);
      const kategori = kategoriBelanjas.find((item) => item.id === row.kategoriId)?.nama || row.kategoriId;
      if (jumlah > 0) totalPengeluaranRows += 1;
      totalPengeluaran += jumlah;
      emptyMonths[tanggal.getMonth()].pengeluaran += jumlah;
      addExpenseCategory(kategori, jumlah);
      recentRows.push({
        id: row.id,
        tanggal,
        uraian: row.keterangan,
        kodeAnggaran: kategori,
        penerimaan: 0,
        pengeluaran: jumlah,
      });
    });

    const sortedRecentRows = recentRows.sort((a, b) => b.tanggal.getTime() - a.tanggal.getTime());
    const topMonth = [...emptyMonths]
      .map((item) => ({ ...item, net: item.pemasukan - item.pengeluaran }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0];
    const sortedCategories = Array.from(expenseByCategory.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const topCategories: PieDatum[] = sortedCategories.slice(0, 7);
    const totalCategoryValue = sortedCategories.reduce((sum, item) => sum + item.value, 0);
    const shownCategoryValue = topCategories.reduce((sum, item) => sum + item.value, 0);

    if (totalCategoryValue > shownCategoryValue) {
      topCategories.push({ name: 'Lainnya', value: totalCategoryValue - shownCategoryValue });
    }

    const realizedByCode = new Map<string, number>();
    doorscrieftTransaksis.forEach((row) => {
      const tanggal = row.tanggal instanceof Date ? row.tanggal : new Date(row.tanggal);
      if (Number.isNaN(tanggal.getTime()) || tanggal.getFullYear() !== tahunAktif) return;
      const kode = String(row.kodeAnggaran || '').trim();
      if (!kode) return;
      const amount = kode.startsWith('I.')
        ? Number(row.penerimaan || 0)
        : kode.startsWith('II.')
          ? Number(row.pengeluaran || 0)
          : Number(row.penerimaan || 0) + Number(row.pengeluaran || 0);
      realizedByCode.set(kode, (realizedByCode.get(kode) || 0) + amount);
    });

    const budgetByCode = new Map<string, { kode: string; nama: string; anggaran: number }>();
    applyBatangTubuhAnggaranForYear(batangTubuhs, batangTubuhAnggaranByYear, tahunAktif, batangTubuhProgramByYear).forEach((group) => {
      (group.detailRows || []).forEach((detail) => {
        const kode = String(detail.kode || '').trim();
        if (!kode) return;
        const current = budgetByCode.get(kode) || { kode, nama: detail.nama || detail.MataAnggaran || kode, anggaran: 0 };
        current.nama = current.nama || detail.nama || detail.MataAnggaran || kode;
        current.anggaran += Number(detail.dianggarkan || 0);
        budgetByCode.set(kode, current);
      });
    });

    realizedByCode.forEach((realisasi, kode) => {
      if (budgetByCode.has(kode)) return;
      const master = kodeAnggarans.find((item) => item.kodeAnggaran === kode);
      budgetByCode.set(kode, {
        kode,
        nama: master?.mataAnggaran || kode,
        anggaran: 0,
      });
    });

    const budgetRows: BudgetDashboardRow[] = Array.from(budgetByCode.values())
      .map((item) => {
        const realisasi = realizedByCode.get(item.kode) || 0;
        const percentage = item.anggaran > 0 ? Math.round((realisasi / item.anggaran) * 100) : realisasi > 0 ? 100 : 0;
        const status: BudgetDashboardRow['status'] = item.anggaran <= 0 && realisasi <= 0
          ? 'empty'
          : percentage > 100
            ? 'bad'
            : percentage >= 80
              ? 'warn'
              : 'good';
        return {
          ...item,
          realisasi,
          selisih: item.anggaran - realisasi,
          percentage,
          status,
        };
      })
      .filter((item) => item.anggaran > 0 || item.realisasi > 0)
      .sort((a, b) => {
        const statusRank = { bad: 0, warn: 1, good: 2, empty: 3 };
        return statusRank[a.status] - statusRank[b.status] || b.realisasi - a.realisasi || a.kode.localeCompare(b.kode);
      });

    const totalBudget = budgetRows.reduce((sum, item) => sum + item.anggaran, 0);
    const totalRealized = budgetRows.reduce((sum, item) => sum + item.realisasi, 0);
    const budgetPercentage = totalBudget > 0 ? Math.round((totalRealized / totalBudget) * 100) : totalRealized > 0 ? 100 : 0;

    return {
      currentSummary: {
        totalPemasukan,
        totalPengeluaran,
        saldoAkhir: totalPemasukan - totalPengeluaran,
      },
      monthlyData: emptyMonths,
      kategoriData: topCategories,
      recentPemasukan: sortedRecentRows.filter((row) => row.penerimaan > 0).slice(0, 5),
      recentPengeluaran: sortedRecentRows.filter((row) => row.pengeluaran > 0).slice(0, 5),
      transactionCounts: {
        pemasukan: totalPemasukanRows,
        pengeluaran: totalPengeluaranRows,
        total: totalPemasukanRows + totalPengeluaranRows,
      },
      lastTransactionDate: sortedRecentRows[0]?.tanggal ?? null,
      topCashMonth: topMonth,
      budgetDashboard: {
        rows: budgetRows.slice(0, 8),
        totalBudget,
        totalRealized,
        remaining: totalBudget - totalRealized,
        percentage: budgetPercentage,
        overBudget: budgetRows.filter((item) => item.status === 'bad').length,
        nearLimit: budgetRows.filter((item) => item.status === 'warn').length,
        activeCodes: budgetRows.length,
      },
    };
  }, [batangTubuhAnggaranByYear, batangTubuhProgramByYear, batangTubuhs, doorscrieftTransaksis, kategoriBelanjas, kodeAnggarans, pemasukans, pengeluarans, tahunAktif]);

  const validationSummary = useMemo(() => {
    return summarizeValidationForExport(getDoorscrieftValidationIssues(doorscrieftTransaksis, kodeAnggarans, tahunAktif));
  }, [doorscrieftTransaksis, kodeAnggarans, tahunAktif]);

  const expenseRatio = currentSummary.totalPemasukan > 0
    ? Math.round((currentSummary.totalPengeluaran / currentSummary.totalPemasukan) * 100)
    : 0;
  const operationalStatus = validationSummary.errors > 0
    ? 'Perlu Perbaikan'
    : hasUnsavedChanges
      ? 'Perlu Disimpan'
      : 'Siap Operasional';
  const lastSavedText = lastSavedAt ? new Date(lastSavedAt).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }) : 'Belum disimpan';

  const healthChecks = [
    {
      label: 'Data Transaksi',
      detail: transactionCounts.total > 0 ? `${transactionCounts.total} transaksi tahun ${tahunAktif}` : 'Belum ada transaksi tahun aktif',
      tone: transactionCounts.total > 0 ? 'good' : 'warn',
    },
    {
      label: 'Validasi Doorscrieft',
      detail: validationSummary.errors > 0 ? `${validationSummary.errors} error perlu diperbaiki` : `${validationSummary.warnings} peringatan`,
      tone: validationSummary.errors > 0 ? 'bad' : validationSummary.warnings > 0 ? 'warn' : 'good',
    },
    {
      label: 'Status Simpan',
      detail: hasUnsavedChanges ? 'Ada perubahan belum disimpan' : lastSavedText,
      tone: hasUnsavedChanges ? 'warn' : 'good',
    },
    {
      label: 'File Project',
      detail: activeProjectPath ? activeProjectPath.split(/[\\/]/).pop() || 'File aktif' : 'Belum tersambung ke file project',
      tone: activeProjectPath ? 'good' : 'warn',
    },
    {
      label: 'Tahun Aktif',
      detail: isCurrentYearLocked ? `Tahun ${tahunAktif} terkunci` : `Tahun ${tahunAktif} masih terbuka`,
      tone: isCurrentYearLocked ? 'good' : 'warn',
    },
    {
      label: 'Audit Aktivitas',
      detail: auditLogs.length > 0 ? `${auditLogs.length} aktivitas tercatat` : 'Belum ada aktivitas tercatat',
      tone: auditLogs.length > 0 ? 'good' : 'warn',
    },
  ] as const;

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Dashboard</h1>
          <p className='text-slate-500 dark:text-slate-400'>Ringkasan operasional keuangan Tahun {tahunAktif}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' onClick={() => { window.location.hash = '#/doorscrieft'; }} disabled={!canInput || isCurrentYearLocked}>
            <Upload className='mr-2 h-4 w-4' /> Input Data
          </Button>
          <Button variant='outline' onClick={() => { window.location.hash = '#/cek-data'; }}>
            <ClipboardCheck className='mr-2 h-4 w-4' /> Cek Data
          </Button>
          <Button onClick={() => { window.location.hash = '#/laporan'; }} disabled={!canExport}>
            <FileText className='mr-2 h-4 w-4' /> Laporan
          </Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Pemasukan</CardTitle>
            <ArrowUpCircle className='h-4 w-4 text-green-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {formatCurrency(currentSummary.totalPemasukan)}
            </div>
            <p className='text-xs text-slate-500'>
              {transactionCounts.pemasukan} transaksi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Pengeluaran</CardTitle>
            <ArrowDownCircle className='h-4 w-4 text-red-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>
              {formatCurrency(currentSummary.totalPengeluaran)}
            </div>
            <p className='text-xs text-slate-500'>
              {transactionCounts.pengeluaran} transaksi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Saldo Akhir</CardTitle>
            <Wallet className='h-4 w-4 text-blue-600' />
          </CardHeader>
          <CardContent>
            <div className={'text-2xl font-bold ' + (currentSummary.saldoAkhir >= 0 ? 'text-blue-600' : 'text-red-600')}>
              {formatCurrency(currentSummary.saldoAkhir)}
            </div>
            <p className='text-xs text-slate-500'>
              {lastTransactionDate ? `Update ${lastTransactionDate.toLocaleDateString('id-ID')}` : 'Belum ada transaksi'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Rasio Pengeluaran</CardTitle>
            <TrendingUp className='h-4 w-4 text-orange-600' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>
              {expenseRatio}%
            </div>
            <div className='mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-700'>
              <div className={cn('h-2 rounded-full', expenseRatio > 100 ? 'bg-red-600' : expenseRatio > 80 ? 'bg-amber-500' : 'bg-orange-500')} style={{ width: `${Math.min(expenseRatio, 100)}%` }} />
            </div>
            <p className='mt-1 text-xs text-slate-500'>Dari total pemasukan</p>
          </CardContent>
        </Card>
      </div>

      <Suspense fallback={<DashboardChartsSkeleton />}>
        <DashboardCharts monthlyData={monthlyData} kategoriData={kategoriData} isDark={isDark} />
      </Suspense>

      <div className='grid gap-6 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center'>
              <ArrowUpCircle className='mr-2 h-5 w-5 text-green-600' />
              Pemasukan Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPemasukan.length > 0 ? (
              <div className='space-y-4'>
                {recentPemasukan.map((item) => (
                  <div key={item.id} className='flex items-center justify-between border-b dark:border-slate-700 pb-3 last:border-0 last:pb-0'>
                    <div>
                      <p className='font-medium text-slate-900 dark:text-white'>{item.uraian}</p>
                      <p className='text-sm text-slate-500 dark:text-slate-400'>
                        {item.tanggal.toLocaleDateString('id-ID')}
                        {item.kodeAnggaran && (
                          <span className='ml-1 font-mono text-xs'>({item.kodeAnggaran})</span>
                        )}
                      </p>
                    </div>
                    <div className='text-right'>
                      <p className='font-semibold text-green-600 dark:text-green-400'>{formatCurrency(item.penerimaan)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AppStateMessage compact title='Belum ada data pemasukan' detail='Transaksi penerimaan terbaru akan muncul di sini.' />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center'>
              <ArrowDownCircle className='mr-2 h-5 w-5 text-red-600' />
              Pengeluaran Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPengeluaran.length > 0 ? (
              <div className='space-y-4'>
                {recentPengeluaran.map((item) => (
                  <div key={item.id} className='flex items-center justify-between border-b dark:border-slate-700 pb-3 last:border-0 last:pb-0'>
                    <div>
                      <p className='font-medium text-slate-900 dark:text-white'>{item.uraian}</p>
                      <p className='text-sm text-slate-500 dark:text-slate-400'>
                        {item.tanggal.toLocaleDateString('id-ID')}
                        {item.kodeAnggaran && (
                          <span className='ml-1 font-mono text-xs'>({item.kodeAnggaran})</span>
                        )}
                      </p>
                    </div>
                    <div className='text-right'>
                      <p className='font-semibold text-red-600 dark:text-red-400'>{formatCurrency(item.pengeluaran)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AppStateMessage compact title='Belum ada data pengeluaran' detail='Transaksi pengeluaran terbaru akan muncul di sini.' />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={cn(
        'border-l-4',
        validationSummary.errors > 0 ? 'border-l-red-500' : hasUnsavedChanges ? 'border-l-amber-500' : 'border-l-green-600',
      )}>
        <CardContent className='grid gap-4 py-5 lg:grid-cols-[1.2fr_2fr] lg:items-center'>
          <div className='flex items-center gap-3'>
            <div className={cn(
              'grid h-12 w-12 place-items-center rounded-md',
              validationSummary.errors > 0 ? 'bg-red-50 text-red-600 dark:bg-red-950/40' : hasUnsavedChanges ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40' : 'bg-green-50 text-green-600 dark:bg-green-950/40',
            )}>
              {validationSummary.errors > 0 ? <AlertTriangle className='h-5 w-5' /> : <ShieldCheck className='h-5 w-5' />}
            </div>
            <div>
              <p className='text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400'>Status Kerja</p>
              <p className='text-lg font-bold text-slate-900 dark:text-white'>{operationalStatus}</p>
            </div>
          </div>
          <div className='grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2 xl:grid-cols-4'>
            <StatusChip label='Project' value={activeProjectPath ? 'File aktif' : 'Belum ada file'} tone={activeProjectPath ? 'good' : 'neutral'} />
            <StatusChip label='Simpan' value={hasUnsavedChanges ? 'Belum tersimpan' : lastSavedText} tone={hasUnsavedChanges ? 'warn' : 'good'} />
            <StatusChip label='Validasi' value={`${validationSummary.errors} error, ${validationSummary.warnings} peringatan`} tone={validationSummary.errors > 0 ? 'bad' : validationSummary.warnings > 0 ? 'warn' : 'good'} />
            <StatusChip label='Tahun' value={isCurrentYearLocked ? 'Terkunci' : 'Terbuka'} tone={isCurrentYearLocked ? 'warn' : 'good'} />
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-3'>
        <WorkflowCard
          title='1. Input dan Import'
          detail={isCurrentYearLocked ? `Tahun ${tahunAktif} terkunci. Buka kunci dari Pengaturan untuk mengubah data.` : 'Masukkan transaksi Doorscrieft atau import data operasional.'}
          icon={<Upload className='h-5 w-5' />}
          action='Buka Doorscrieft'
          disabled={!canInput || isCurrentYearLocked}
          onClick={() => { window.location.hash = '#/doorscrieft'; }}
        />
        <WorkflowCard
          title='2. Validasi Data'
          detail={validationSummary.errors > 0 ? 'Ada error yang perlu dibereskan sebelum laporan final.' : 'Cek tanggal, kode anggaran, dan nominal sebelum export.'}
          icon={<ClipboardCheck className='h-5 w-5' />}
          action='Cek Data'
          tone={validationSummary.errors > 0 ? 'bad' : validationSummary.warnings > 0 ? 'warn' : 'good'}
          onClick={() => { window.location.hash = '#/cek-data'; }}
        />
        <WorkflowCard
          title='3. Review Laporan'
          detail={transactionCounts.total > 0 ? `Bulan bergerak terbesar: ${topCashMonth?.bulan || '-'}.` : 'Laporan akan terisi setelah ada transaksi tahun aktif.'}
          icon={<FileText className='h-5 w-5' />}
          action='Buka Laporan'
          disabled={!canExport}
          onClick={() => { window.location.hash = '#/laporan'; }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <ShieldCheck className='h-5 w-5 text-blue-600' />
            Kesehatan Project
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {healthChecks.map((item) => (
              <HealthCheckItem key={item.label} label={item.label} detail={item.detail} tone={item.tone} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardChartsSkeleton() {
  return (
    <div className='grid gap-6 xl:grid-cols-[1.2fr_0.8fr]'>
      {['Grafik Arus Kas Bulanan', 'Distribusi Pengeluaran per Kategori'].map((title, index) => (
        <Card key={title}>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn('animate-pulse rounded-md bg-slate-100 dark:bg-slate-800', index === 0 ? 'h-[300px]' : 'h-[400px]')} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  return (
    <div className='rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900'>
      <p className='text-xs text-slate-500 dark:text-slate-400'>{label}</p>
      <p className='mt-0.5 flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white'>
        <span className={cn(
          'h-2 w-2 rounded-full',
          tone === 'good' && 'bg-green-600',
          tone === 'warn' && 'bg-amber-500',
          tone === 'bad' && 'bg-red-600',
          tone === 'neutral' && 'bg-slate-400',
        )} />
        {value}
      </p>
    </div>
  );
}

function WorkflowCard({
  title,
  detail,
  icon,
  action,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  title: string;
  detail: string;
  icon: React.ReactNode;
  action: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  return (
    <Card className={cn(
      'border-l-4',
      tone === 'good' && 'border-l-green-600',
      tone === 'warn' && 'border-l-amber-500',
      tone === 'bad' && 'border-l-red-600',
      tone === 'neutral' && 'border-l-blue-600',
    )}>
      <CardContent className='flex h-full flex-col gap-4 py-5'>
        <div className='flex items-start gap-3'>
          <div className='rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-slate-900 dark:text-slate-200'>{icon}</div>
          <div>
            <p className='font-semibold text-slate-900 dark:text-white'>{title}</p>
            <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>{detail}</p>
          </div>
        </div>
        <Button className='mt-auto justify-start' variant='outline' onClick={onClick} disabled={disabled}>
          {disabled ? <Lock className='mr-2 h-4 w-4' /> : <CheckCircle2 className='mr-2 h-4 w-4' />}
          {action}
        </Button>
      </CardContent>
    </Card>
  );
}

function HealthCheckItem({ label, detail, tone }: { label: string; detail: string; tone: 'good' | 'warn' | 'bad' }) {
  return (
    <div className='flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900'>
      <div className={cn(
        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
        tone === 'good' && 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
        tone === 'warn' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        tone === 'bad' && 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
      )}>
        {tone === 'bad' ? <AlertTriangle className='h-4 w-4' /> : <CheckCircle2 className='h-4 w-4' />}
      </div>
      <div className='min-w-0'>
        <p className='font-medium text-slate-900 dark:text-white'>{label}</p>
        <p className='mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400' title={detail}>{detail}</p>
      </div>
    </div>
  );
}
