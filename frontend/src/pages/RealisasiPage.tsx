import { useState, useMemo, useEffect } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, getMonthName } from '@/lib/utils';
import { BarChart3, TrendingUp, Plus } from 'lucide-react';
import type { DoorscrieftRowInput, KodeAnggaranItem } from '@/types';

interface RealizationItem {
  kodeAnggaran: string;
  mataAnggaran: string;
  bulan: number;
  anggaran: number;
  realized: number;
  selisih: number;
  percentage: number;
}

export function RealisasiPage() {
  const { doorscrieftTransaksis, realisasis, addRealisasi, updateRealisasi, kodeAnggarans, setKodeAnggarans, tahunAktif } = useStore();

  // Load kode anggaran dari Excel DATA BASE2 on mount
  useEffect(() => {
    const anyWin = window as any;
    if (!anyWin?.electronAPI?.loadDataKodeAnggaran) return;
    anyWin.electronAPI
      .loadDataKodeAnggaran()
      .then((items: KodeAnggaranItem[]) => {
        if (Array.isArray(items) && items.length > 0) setKodeAnggarans(items);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    bulan: 1,
    kodeAnggaran: '',
    anggaran: 0,
  });

  const realizationData: RealizationItem[] = useMemo(() => {
    const data: RealizationItem[] = [];

    kodeAnggarans.forEach((ka) => {
      for (let bulan = 1; bulan <= 12; bulan++) {
        const anggaran = realisasis.find(
          (r) => r.kategoriId === ka.kodeAnggaran && r.bulan === bulan
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
          percentage: anggaran > 0 ? Math.round((realized / anggaran) * 100) : 0,
        });
      }
    });

    return data;
  }, [kodeAnggarans, realisasis, doorscrieftTransaksis, tahunAktif]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateRealisasi(editingId, form);
    } else {
      addRealisasi({
        tahun: tahunAktif,
        bulan: form.bulan,
        kategoriId: form.kodeAnggaran,
        subKategoriId: '',
        anggaran: Number(form.anggaran),
      });
    }
    setIsOpen(false);
    setEditingId(null);
    setForm({ bulan: 1, kodeAnggaran: '', anggaran: 0 });
  };

  const groupedData: Record<string, RealizationItem[]> = useMemo(() => {
    const group: Record<string, RealizationItem[]> = {};
    realizationData.forEach((item) => {
      if (!group[item.kodeAnggaran]) group[item.kodeAnggaran] = [];
      group[item.kodeAnggaran].push(item);
    });
    return group;
  }, [realizationData]);

  const totalAnggaran = realisasis.filter((r) => r.tahun === tahunAktif).reduce((sum, r) => sum + r.anggaran, 0);
  const totalRealisasi = realizationData.reduce((sum, r) => sum + r.realized, 0);

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Realisasi Anggaran</h1>
          <p className='text-slate-500'>Pantau realisasi anggaran per bulan berdasarkan Kode Anggaran</p>
        </div>
        <Button onClick={() => { setForm({ bulan: 1, kodeAnggaran: '', anggaran: 0 }); setEditingId(null); setIsOpen(true); }}>
          <Plus className='mr-2 h-4 w-4' /> Set Anggaran
        </Button>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center gap-4'>
              <div className='p-3 bg-blue-100 dark:bg-blue-900 rounded-lg'>
                <TrendingUp className='h-6 w-6 text-blue-600' />
              </div>
              <div>
                <p className='text-sm text-slate-500'>Total Anggaran</p>
                <p className='text-xl font-bold'>{formatCurrency(totalAnggaran)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center gap-4'>
              <div className='p-3 bg-green-100 dark:bg-green-900 rounded-lg'>
                <TrendingUp className='h-6 w-6 text-green-600' />
              </div>
              <div>
                <p className='text-sm text-slate-500'>Total Realisasi</p>
                <p className='text-xl font-bold text-green-600'>{formatCurrency(totalRealisasi)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='pt-6'>
            <div className='flex items-center gap-4'>
              <div className='p-3 bg-orange-100 dark:bg-orange-900 rounded-lg'>
                <BarChart3 className='h-6 w-6 text-orange-600' />
              </div>
              <div>
                <p className='text-sm text-slate-500'>Rata-rata %</p>
                <p className='text-xl font-bold text-orange-600'>
                  {totalAnggaran > 0 ? Math.round((totalRealisasi / totalAnggaran) * 100) : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {Object.entries(groupedData).map(([kode, items]) => (
        <Card key={kode}>
          <CardHeader>
            <CardTitle>
              <span className='font-mono text-sm mr-2'>{kode}</span>
              {items[0]?.mataAnggaran || ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead>
                  <tr className='border-b dark:border-slate-700 text-left text-sm font-medium text-slate-500'>
                    <th className='pb-3 pr-4'>Bulan</th>
                    <th className='pb-3 pr-4 text-right'>Anggaran</th>
                    <th className='pb-3 pr-4 text-right'>Realisasi</th>
                    <th className='pb-3 pr-4 text-right'>Selisih</th>
                    <th className='pb-3 pr-4 text-right'>%</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className='border-b dark:border-slate-700 last:border-0 dark:text-slate-200'>
                      <td className='py-3 pr-4'>{getMonthName(item.bulan)}</td>
                      <td className='py-3 pr-4 text-right'>{formatCurrency(item.anggaran)}</td>
                      <td className='py-3 pr-4 text-right'>{formatCurrency(item.realized)}</td>
                      <td className={'py-3 pr-4 text-right font-medium ' + (item.selisih >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                        {formatCurrency(item.selisih)}
                      </td>
                      <td className='py-3 pr-4 text-right'>
                        <span className={'px-2 py-1 rounded text-xs font-medium ' +
                          (item.percentage > 100 ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : item.percentage > 80 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300')
                        }>
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

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Anggaran Realisasi</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div>
              <label className='text-sm font-medium mb-2 block'>Bulan</label>
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
              <label className='text-sm font-medium mb-2 block'>Kode Anggaran</label>
              <select
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
                value={form.kodeAnggaran}
                onChange={(e) => setForm({ ...form, kodeAnggaran: e.target.value })}
                required
              >
                <option value=''>Pilih Kode Anggaran</option>
                {kodeAnggarans.map((k) => (
                  <option key={k.kodeAnggaran} value={k.kodeAnggaran}>{k.kodeAnggaran} — {k.mataAnggaran}</option>
                ))}
              </select>
            </div>
            <Input
              label='Jumlah Anggaran'
              type='number'
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
