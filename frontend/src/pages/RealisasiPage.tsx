import { useState, useMemo, useEffect } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, getMonthName } from '@/lib/utils';
import { can } from '@/lib/permissions';
import { AlertTriangle, BarChart3, CheckCircle2, Plus, Search, SlidersHorizontal, TrendingUp, WalletCards } from 'lucide-react';
import type { DoorscrieftRowInput, KodeAnggaranItem } from '@/types';
import { toast } from 'sonner';
import { ReportPrintButton, ReportPrintDocument } from '@/components/print/ReportPrint';
import { getElectronAPI } from '@/lib/electron';
import { YearLockedBanner } from '@/components/YearLockedBanner';

interface RealizationItem {
  kodeAnggaran: string;
  mataAnggaran: string;
  bulan: number;
  anggaran: number;
  realized: number;
  selisih: number;
  percentage: number;
}

type GroupedRealization = {
  kodeAnggaran: string;
  mataAnggaran: string;
  items: RealizationItem[];
  totalAnggaran: number;
  totalRealisasi: number;
  selisih: number;
  percentage: number;
  status: 'normal' | 'warning' | 'over';
};

export function RealisasiPage() {
  const { user, doorscrieftTransaksis, realisasis, addRealisasi, updateRealisasi, kodeAnggarans, setKodeAnggarans, tahunAktif, lockedYears } = useStore();
  const canInput = can(user?.role, 'input');
  const isYearLocked = lockedYears.includes(tahunAktif);

  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.loadKodeAnggaran) return;
    electronAPI
      .loadKodeAnggaran()
      .then((items: KodeAnggaranItem[]) => {
        if (Array.isArray(items) && items.length > 0) setKodeAnggarans(items);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState<number | 'all'>('all');
  const [showEmptyCodes, setShowEmptyCodes] = useState(false);
  const [form, setForm] = useState({
    bulan: 1,
    kodeAnggaran: '',
    anggaran: 0,
  });

  const realizationData: RealizationItem[] = useMemo(() => {
    const data: RealizationItem[] = [];
    const belanjaCodes = kodeAnggarans.filter((ka) => String(ka.kodeAnggaran || '').startsWith('II.'));

    belanjaCodes.forEach((ka) => {
      for (let bulan = 1; bulan <= 12; bulan++) {
        const anggaran = realisasis.find(
          (r) => r.tahun === tahunAktif && r.kategoriId === ka.kodeAnggaran && r.bulan === bulan
        )?.anggaran || 0;

        const realized = doorscrieftTransaksis
          .filter((p: DoorscrieftRowInput) => {
            const d = new Date(p.tanggal);
            return d.getFullYear() === tahunAktif &&
              d.getMonth() + 1 === bulan &&
              p.kodeAnggaran === ka.kodeAnggaran &&
              Number(p.pengeluaran || 0) > 0;
          })
          .reduce((sum, p) => sum + Number(p.pengeluaran || 0), 0);

        data.push({
          kodeAnggaran: ka.kodeAnggaran,
          mataAnggaran: ka.mataAnggaran,
          bulan,
          anggaran,
          realized,
          selisih: anggaran - realized,
          percentage: anggaran > 0 ? Math.round((realized / anggaran) * 100) : realized > 0 ? 100 : 0,
        });
      }
    });

    return data;
  }, [kodeAnggarans, realisasis, doorscrieftTransaksis, tahunAktif]);

  const groupedData: GroupedRealization[] = useMemo(() => {
    const group = new Map<string, RealizationItem[]>();
    realizationData.forEach((item) => {
      if (monthFilter !== 'all' && item.bulan !== monthFilter) return;
      if (!group.has(item.kodeAnggaran)) group.set(item.kodeAnggaran, []);
      group.get(item.kodeAnggaran)!.push(item);
    });

    const query = search.trim().toLowerCase();
    return [...group.entries()]
      .map(([kodeAnggaran, items]) => {
        const totalAnggaran = items.reduce((sum, item) => sum + item.anggaran, 0);
        const totalRealisasi = items.reduce((sum, item) => sum + item.realized, 0);
        const percentage = totalAnggaran > 0 ? Math.round((totalRealisasi / totalAnggaran) * 100) : totalRealisasi > 0 ? 100 : 0;
        const status: GroupedRealization['status'] = percentage > 100 ? 'over' : percentage >= 80 ? 'warning' : 'normal';
        return {
          kodeAnggaran,
          mataAnggaran: items[0]?.mataAnggaran || kodeAnggaran,
          items,
          totalAnggaran,
          totalRealisasi,
          selisih: totalAnggaran - totalRealisasi,
          percentage,
          status,
        };
      })
      .filter((item) => showEmptyCodes || item.totalAnggaran > 0 || item.totalRealisasi > 0)
      .filter((item) => {
        if (!query) return true;
        return item.kodeAnggaran.toLowerCase().includes(query) || item.mataAnggaran.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (b.totalRealisasi !== a.totalRealisasi) return b.totalRealisasi - a.totalRealisasi;
        return a.kodeAnggaran.localeCompare(b.kodeAnggaran);
      });
  }, [realizationData, monthFilter, search, showEmptyCodes]);

  const summary = useMemo(() => {
    const scoped = monthFilter === 'all'
      ? realizationData
      : realizationData.filter((item) => item.bulan === monthFilter);
    const totalAnggaran = scoped.reduce((sum, item) => sum + item.anggaran, 0);
    const totalRealisasi = scoped.reduce((sum, item) => sum + item.realized, 0);
    const percentage = totalAnggaran > 0 ? Math.round((totalRealisasi / totalAnggaran) * 100) : 0;
    const overBudget = groupedData.filter((item) => item.status === 'over').length;
    const nearLimit = groupedData.filter((item) => item.status === 'warning').length;
    return { totalAnggaran, totalRealisasi, percentage, overBudget, nearLimit, selisih: totalAnggaran - totalRealisasi };
  }, [realizationData, monthFilter, groupedData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin input data.');
      return;
    }
    if (isYearLocked) {
      toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk mengubah anggaran.`);
      return;
    }
    if (!form.kodeAnggaran) {
      toast.error('Pilih kode anggaran terlebih dahulu.');
      return;
    }
    if (Number(form.anggaran || 0) < 0) {
      toast.error('Anggaran tidak boleh bernilai negatif.');
      return;
    }

    try {
      if (editingId) {
        updateRealisasi(editingId, {
          bulan: form.bulan,
          kategoriId: form.kodeAnggaran,
          anggaran: Number(form.anggaran),
        });
        toast.success('Anggaran diperbarui.');
      } else {
        addRealisasi({
          tahun: tahunAktif,
          bulan: form.bulan,
          kategoriId: form.kodeAnggaran,
          subKategoriId: '',
          anggaran: Number(form.anggaran),
        });
        toast.success('Anggaran ditambahkan.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan anggaran.');
      return;
    }
    setIsOpen(false);
    setEditingId(null);
    setForm({ bulan: 1, kodeAnggaran: '', anggaran: 0 });
  };

  const statusBadge = (group: GroupedRealization) => {
    if (group.status === 'over') return 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300';
    if (group.status === 'warning') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300'>
            <BarChart3 className='h-4 w-4' />
            Monitoring Anggaran
          </div>
          <h1 className='mt-1 text-2xl font-bold text-slate-900 dark:text-white'>Realisasi Anggaran</h1>
          <p className='text-slate-500 dark:text-slate-400'>Pantau anggaran belanja dan realisasi per kode Tahun {tahunAktif}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <ReportPrintButton title={`Realisasi_Anggaran_${tahunAktif}`} />
          <Button disabled={!canInput || isYearLocked} onClick={() => { setForm({ bulan: 1, kodeAnggaran: '', anggaran: 0 }); setEditingId(null); setIsOpen(true); }}>
            <Plus className='mr-2 h-4 w-4' /> Set Anggaran
          </Button>
        </div>
      </div>

      {isYearLocked && <YearLockedBanner tahun={tahunAktif} detail='Realisasi dan set anggaran hanya bisa dilihat. Buka kunci dari Pengaturan jika perlu revisi.' />}

      <ReportPrintDocument
        title='REALISASI ANGGARAN'
        subtitle={`Tahun Anggaran ${tahunAktif}`}
        meta={[
          { label: 'Periode', value: monthFilter === 'all' ? `Januari - Desember ${tahunAktif}` : `${getMonthName(monthFilter)} ${tahunAktif}` },
          { label: 'Total Anggaran', value: formatCurrency(summary.totalAnggaran) },
          { label: 'Total Realisasi', value: formatCurrency(summary.totalRealisasi) },
          { label: 'Rasio', value: `${summary.percentage}%` },
        ]}
      >
        <table>
          <thead>
            <tr>
              <th className='text-center'>No</th>
              <th>Kode</th>
              <th>Mata Anggaran</th>
              <th className='text-right'>Anggaran</th>
              <th className='text-right'>Realisasi</th>
              <th className='text-right'>Selisih</th>
              <th className='text-right'>%</th>
            </tr>
          </thead>
          <tbody>
            {groupedData.length === 0 ? (
              <tr><td colSpan={7} className='text-center'>Belum ada anggaran atau realisasi yang cocok dengan filter ini.</td></tr>
            ) : groupedData.map((group, index) => (
              <tr key={group.kodeAnggaran}>
                <td className='text-center'>{index + 1}</td>
                <td>{group.kodeAnggaran}</td>
                <td>{group.mataAnggaran}</td>
                <td className='text-right'>{formatCurrency(group.totalAnggaran)}</td>
                <td className='text-right'>{formatCurrency(group.totalRealisasi)}</td>
                <td className='text-right'>{formatCurrency(group.selisih)}</td>
                <td className='text-right'>{group.percentage}%</td>
              </tr>
            ))}
            <tr className='font-bold'>
              <td colSpan={3}>TOTAL</td>
              <td className='text-right'>{formatCurrency(summary.totalAnggaran)}</td>
              <td className='text-right'>{formatCurrency(summary.totalRealisasi)}</td>
              <td className='text-right'>{formatCurrency(summary.selisih)}</td>
              <td className='text-right'>{summary.percentage}%</td>
            </tr>
          </tbody>
        </table>
      </ReportPrintDocument>

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Total Anggaran</p>
                <p className='mt-2 text-xl font-bold text-slate-900 dark:text-white'>{formatCurrency(summary.totalAnggaran)}</p>
              </div>
              <WalletCards className='h-5 w-5 text-slate-500' />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Total Realisasi</p>
                <p className='mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(summary.totalRealisasi)}</p>
              </div>
              <TrendingUp className='h-5 w-5 text-emerald-600' />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Rasio Realisasi</p>
            <p className={`mt-2 text-xl font-bold ${summary.percentage > 100 ? 'text-rose-700 dark:text-rose-300' : summary.percentage >= 80 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>
              {summary.percentage}%
            </p>
            <p className='text-xs text-slate-500 dark:text-slate-400'>Sisa {formatCurrency(summary.selisih)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Perhatian</p>
            <div className='mt-2 flex items-center gap-3'>
              <span className='inline-flex items-center gap-1 text-sm font-semibold text-rose-700 dark:text-rose-300'>
                <AlertTriangle className='h-4 w-4' /> {summary.overBudget}
              </span>
              <span className='inline-flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-300'>
                <SlidersHorizontal className='h-4 w-4' /> {summary.nearLimit}
              </span>
              <span className='inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300'>
                <CheckCircle2 className='h-4 w-4' /> {Math.max(groupedData.length - summary.overBudget - summary.nearLimit, 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className='gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <CardTitle className='text-base'>Daftar Realisasi</CardTitle>
            <p className='text-sm text-slate-500 dark:text-slate-400'>
              Menampilkan {groupedData.length} kode anggaran {monthFilter === 'all' ? 'setahun' : `bulan ${getMonthName(monthFilter)}`}.
            </p>
          </div>
          <div className='flex w-full flex-col gap-2 lg:w-auto lg:flex-row'>
            <div className='relative w-full lg:w-80'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
              <Input
                className='pl-10'
                placeholder='Cari kode atau mata anggaran...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className='h-10 rounded-md border border-input bg-background px-3 text-sm dark:bg-slate-800 dark:text-white'
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value='all'>Semua bulan</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((b) => (
                <option key={b} value={b}>{getMonthName(b)}</option>
              ))}
            </select>
            <label className='inline-flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm dark:border-slate-700'>
              <input
                type='checkbox'
                checked={showEmptyCodes}
                onChange={(e) => setShowEmptyCodes(e.target.checked)}
              />
              Semua kode
            </label>
          </div>
        </CardHeader>
      </Card>

      {groupedData.length === 0 ? (
        <Card>
          <CardContent className='py-14 text-center text-slate-500 dark:text-slate-400'>
            Belum ada anggaran atau realisasi yang cocok dengan filter ini.
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-4'>
          {groupedData.map((group) => (
            <Card key={group.kodeAnggaran}>
              <CardHeader className='gap-3 lg:flex-row lg:items-start lg:justify-between'>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='rounded bg-slate-100 px-2 py-0.5 font-mono text-sm dark:bg-slate-700 dark:text-white'>{group.kodeAnggaran}</span>
                    <CardTitle className='text-base'>{group.mataAnggaran}</CardTitle>
                  </div>
                  <div className='mt-2 flex flex-wrap gap-2 text-xs'>
                    <span className={`rounded px-2 py-1 font-semibold ${statusBadge(group)}`}>
                      {group.percentage}% terpakai
                    </span>
                    <span className='rounded bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-700 dark:text-slate-300'>
                      Sisa {formatCurrency(group.selisih)}
                    </span>
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-4 text-right text-sm'>
                  <div>
                    <p className='text-slate-500 dark:text-slate-400'>Anggaran</p>
                    <p className='font-bold text-slate-900 dark:text-white'>{formatCurrency(group.totalAnggaran)}</p>
                  </div>
                  <div>
                    <p className='text-slate-500 dark:text-slate-400'>Realisasi</p>
                    <p className='font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(group.totalRealisasi)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className='overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700'>
                  <table className='w-full min-w-[760px] text-sm'>
                    <thead className='bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400'>
                      <tr>
                        <th className='px-4 py-3'>Bulan</th>
                        <th className='px-4 py-3 text-right'>Anggaran</th>
                        <th className='px-4 py-3 text-right'>Realisasi</th>
                        <th className='px-4 py-3 text-right'>Selisih</th>
                        <th className='px-4 py-3 text-right'>%</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
                      {group.items.map((item) => (
                        <tr key={`${group.kodeAnggaran}-${item.bulan}`} className='hover:bg-slate-50 dark:hover:bg-slate-700/50'>
                          <td className='px-4 py-3 font-medium text-slate-700 dark:text-slate-200'>{getMonthName(item.bulan)}</td>
                          <td className='px-4 py-3 text-right'>{formatCurrency(item.anggaran)}</td>
                          <td className='px-4 py-3 text-right'>{formatCurrency(item.realized)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${item.selisih >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                            {formatCurrency(item.selisih)}
                          </td>
                          <td className='px-4 py-3 text-right'>
                            <span className={`rounded px-2 py-1 text-xs font-semibold ${
                              item.percentage > 100
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                : item.percentage >= 80
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            }`}>
                              {item.percentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Anggaran Realisasi</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div>
              <label className='mb-2 block text-sm font-medium'>Bulan</label>
              <select
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
                value={form.bulan}
                onChange={(e) => setForm({ ...form, bulan: Number(e.target.value) })}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((b) => (
                  <option key={b} value={b}>{getMonthName(b)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className='mb-2 block text-sm font-medium'>Kode Anggaran</label>
              <select
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
                value={form.kodeAnggaran}
                onChange={(e) => setForm({ ...form, kodeAnggaran: e.target.value })}
                required
              >
                <option value=''>Pilih Kode Anggaran</option>
                {kodeAnggarans.filter((k) => String(k.kodeAnggaran || '').startsWith('II.')).map((k) => (
                  <option key={k.kodeAnggaran} value={k.kodeAnggaran}>{k.kodeAnggaran} - {k.mataAnggaran}</option>
                ))}
              </select>
            </div>
            <Input
              label='Jumlah Anggaran'
              type='number'
              min={0}
              value={form.anggaran}
              onChange={(e) => setForm({ ...form, anggaran: Number(e.target.value) })}
              required
            />
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setIsOpen(false)}>Batal</Button>
              <Button type='submit'>Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
