import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStore } from '@/stores';
import { formatCurrency, getMonthName } from '@/lib/utils';
import { ArrowUpCircle, ArrowDownCircle, Wallet, TrendingUp, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import {
  getFinanceSummary,
  getMonthlyChart,
  getFinanceCategories,
  getRecentTransactions,
} from '@/lib/financeClient';
import type { SummaryData, RecentTransaction } from '@/lib/financeClient';

type MonthlyDataItem = {
  bulan: string;
  pemasukan: number;
  pengeluaran: number;
};

type PieDatum = {
  name: string;
  value: number;
};

export function DashboardPage() {
  const { tahunAktif } = useStore();
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyDataItem[]>(
    Array.from({ length: 12 }, (_, i) => ({
      bulan: getMonthName(i + 1).substring(0, 3),
      pemasukan: 0,
      pengeluaran: 0,
    }))
  );
  const [kategoriData, setKategoriData] = useState<PieDatum[]>([]);
  const [recentPemasukan, setRecentPemasukan] = useState<RecentTransaction[]>([]);
  const [recentPengeluaran, setRecentPengeluaran] = useState<RecentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark] = useState(() => localStorage.getItem('theme') === 'dark');

  const chartGridColor = isDark ? '#334155' : '#e5e7eb';
  const chartTooltipBg = isDark ? '#1e293b' : '#ffffff';
  const chartTooltipBorder = isDark ? '#334155' : '#e5e7eb';
  const chartTextColor = isDark ? '#94a3b8' : '#64748b';

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setIsLoading(true);
      setError(null);

      try {
        const [summaryResult, monthlyChart, categoriesResult, recentResult] = await Promise.all([
          getFinanceSummary(tahunAktif),
          getMonthlyChart(tahunAktif),
          getFinanceCategories(tahunAktif),
          getRecentTransactions(tahunAktif),
        ]);

        if (!active) return;

        setSummary(summaryResult);

        setMonthlyData(
          Array.from({ length: 12 }, (_, index) => ({
            bulan: getMonthName(index + 1).substring(0, 3),
            pemasukan: monthlyChart.pemasukan[index]?.jumlah ?? 0,
            pengeluaran: monthlyChart.pengeluaran[index]?.jumlah ?? 0,
          }))
        );

        const sortedCategories = categoriesResult
          .map((item) => ({ name: item.kategori, value: item.pengeluaran }))
          .sort((a, b) => b.value - a.value);

        const topCategories = sortedCategories.slice(0, 7);
        const totalCategoryValue = sortedCategories.reduce((sum, item) => sum + item.value, 0);
        const shownCategoryValue = topCategories.reduce((sum, item) => sum + item.value, 0);

        if (totalCategoryValue > shownCategoryValue) {
          topCategories.push({ name: 'Lainnya', value: totalCategoryValue - shownCategoryValue });
        }

        setKategoriData(topCategories);

        setRecentPemasukan(recentResult.filter((row) => row.penerimaan > 0).slice(0, 5));
        setRecentPengeluaran(recentResult.filter((row) => row.pengeluaran > 0).slice(0, 5));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, [tahunAktif]);

  const currentSummary = summary ?? {
    totalPemasukan: 0,
    totalPengeluaran: 0,
    saldoAkhir: 0,
  };

  const PIE_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
  ];

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Dashboard</h1>
          <p className='text-slate-500 dark:text-slate-400'>Ringkasan keuangan Tahun {tahunAktif}</p>
        </div>
      </div>

      {isLoading && (
        <div className='rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'>
          Memuat dashboard dari server...
        </div>
      )}

      {error && (
        <div className='rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-700/40 dark:bg-red-950/20 dark:text-red-200'>
          Gagal memuat data: {error}
        </div>
      )}

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
              {recentPemasukan.length} transaksi
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
              {recentPengeluaran.length} transaksi
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
              Saldo kas gereja
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
              {currentSummary.totalPemasukan > 0 ? Math.round((currentSummary.totalPengeluaran / currentSummary.totalPemasukan) * 100) : 0}%
            </div>
            <p className='text-xs text-slate-500'>
              Dari total pemasukan
            </p>
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-6 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Grafik Arus Kas Bulanan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='h-[300px]'>
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray='3 3' stroke={chartGridColor} />
                  <XAxis dataKey='bulan' tick={{ fontSize: 12, fill: chartTextColor }} />
                  <YAxis tick={{ fontSize: 12, fill: chartTextColor }} tickFormatter={(v) => `Rp ${(v / 1000000).toFixed(0)}jt`} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{ borderRadius: '8px', border: `1px solid ${chartTooltipBorder}`, backgroundColor: chartTooltipBg, color: isDark ? '#e2e8f0' : '#334155' }}
                  />
                  <Bar dataKey='pemasukan' name='Pemasukan' fill='#10B981' radius={[4, 4, 0, 0]} />
                  <Bar dataKey='pengeluaran' name='Pengeluaran' fill='#EF4444' radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribusi Pengeluaran per Kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='h-[400px]'>
              {kategoriData.length > 0 ? (
                <ResponsiveContainer width='100%' height='100%'>
                  <PieChart>
                    <Pie
                      data={kategoriData}
                      cx='50%'
                      cy='50%'
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey='value'
                      label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {kategoriData.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown) => [
                        value ? formatCurrency(Number(value)) : 'Rp 0',
                      ]}
                      contentStyle={{ borderRadius: '8px', border: `1px solid ${chartTooltipBorder}`, backgroundColor: chartTooltipBg, color: isDark ? '#e2e8f0' : '#334155' }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', overflow: 'hidden', color: isDark ? '#94a3b8' : '#64748b' }}
                      iconSize={10}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className='flex items-center justify-center h-full text-slate-500 dark:text-slate-400'>
                  <Calendar className='mr-2' />
                  Belum ada data pengeluaran
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

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
                  <div key={item.uuid} className='flex items-center justify-between border-b dark:border-slate-700 pb-3 last:border-0 last:pb-0'>
                    <div>
                      <p className='font-medium text-slate-900 dark:text-white'>{item.uraian}</p>
                      <p className='text-sm text-slate-500 dark:text-slate-400'>
                        {new Date(item.tanggal).toLocaleDateString('id-ID')}
                        {item.kode_anggaran && (
                          <span className='ml-1 font-mono text-xs'>({item.kode_anggaran})</span>
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
              <p className='text-center text-slate-500 dark:text-slate-400 py-8'>Belum ada data pemasukan</p>
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
                  <div key={item.uuid} className='flex items-center justify-between border-b dark:border-slate-700 pb-3 last:border-0 last:pb-0'>
                    <div>
                      <p className='font-medium text-slate-900 dark:text-white'>{item.uraian}</p>
                      <p className='text-sm text-slate-500 dark:text-slate-400'>
                        {new Date(item.tanggal).toLocaleDateString('id-ID')}
                        {item.kode_anggaran && (
                          <span className='ml-1 font-mono text-xs'>({item.kode_anggaran})</span>
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
              <p className='text-center text-slate-500 dark:text-slate-400 py-8'>Belum ada data pengeluaran</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
