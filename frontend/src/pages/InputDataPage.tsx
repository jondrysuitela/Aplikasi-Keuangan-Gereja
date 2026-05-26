import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { DoorscrieftRowInput, KodeAnggaranItem } from '@/types';
import { Lock, Plus, Search } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

const initialForm = {
  tanggal: new Date().toISOString().split('T')[0],
  no: '',
  uraian: '',
  kodeAnggaran: '',
  mataAnggaran: '',
  penerimaan: 0,
  pengeluaran: 0,
};

export function InputDataPage() {
  const { tahunAktif, lockedYears, kodeAnggarans, setKodeAnggarans, doorscrieftTransaksis, addDoorscrieftTransaksi } = useStore();
  const isYearLocked = lockedYears.includes(tahunAktif);

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
  const [form, setForm] = useState(initialForm);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 150);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const rows: DoorscrieftRowInput[] = doorscrieftTransaksis
      .filter((r) => {
        const d = new Date(r.tanggal);
        return d.getFullYear() === tahunAktif;
      })
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

    if (!q) return rows;

    return rows.filter((r) => {
      return (
        String(r.no).includes(q) ||
        (r.uraian || '').toLowerCase().includes(q) ||
        (r.kodeAnggaran || '').toLowerCase().includes(q) ||
        (r.mataAnggaran || '').toLowerCase().includes(q)
      );
    });
  }, [doorscrieftTransaksis, tahunAktif, debouncedSearch]);

  const validateKodeAnggaran = (kode: string) => {
    const hit = kodeAnggarans.find((k: KodeAnggaranItem) => k.kodeAnggaran === kode);
    return hit || null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isYearLocked) {
      toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk mengubah data.`);
      return;
    }
    const mata = validateKodeAnggaran(form.kodeAnggaran);
    if (!mata) {
      alert('Kode anggaran tidak valid (tidak ada di DATA BASE2).');
      return;
    }

    try {
      addDoorscrieftTransaksi({
        tanggal: new Date(form.tanggal),
        no: form.no.trim(),
        uraian: form.uraian.trim(),
        kodeAnggaran: form.kodeAnggaran,
        mataAnggaran: mata.mataAnggaran,
        penerimaan: Number(form.penerimaan),
        pengeluaran: Number(form.pengeluaran),
        createdBy: 'admin',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Data gagal disimpan.');
      return;
    }

    setIsOpen(false);
    setForm(initialForm);
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Input Data</h1>
          <p className='text-slate-500 dark:text-slate-400'>Tab input data floating/tabular berbasis KODE ANGGARAN</p>
          {isYearLocked && (
            <p className='mt-1 inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700'>
              <Lock className='h-3.5 w-3.5' />
              Tahun {tahunAktif} terkunci
            </p>
          )}
        </div>
        <Button disabled={isYearLocked} onClick={() => { setForm(initialForm); setIsOpen(true); }}>
          <Plus className='mr-2 h-4 w-4' /> Tambah
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Search className='h-4 w-4 text-slate-500' />
            Data {tahunAktif}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='relative max-w-xl'>
            <Input
              placeholder='Cari No, Uraian, Kode Anggaran...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead>
                <tr className='border-b dark:border-slate-700 text-left text-sm font-medium text-slate-500'>
                  <th className='pb-3 pr-4'>No</th>
                  <th className='pb-3 pr-4'>Tanggal</th>
                  <th className='pb-3 pr-4'>Uraian</th>
                  <th className='pb-3 pr-4'>KODE ANGGARAN</th>
                  <th className='pb-3 pr-4'>MATA ANGGARAN</th>
                  <th className='pb-3 pr-4 text-right'>Penerimaan</th>
                  <th className='pb-3 pr-4 text-right'>Pengeluaran</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='py-8 text-center text-slate-500 dark:text-slate-400'>Belum ada data</td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.id} className='border-b last:border-0 dark:border-slate-700 dark:text-slate-200'>
                      <td className='py-3 pr-4'>{r.no}</td>
                      <td className='py-3 pr-4'>{new Date(r.tanggal).toLocaleDateString('id-ID')}</td>
                      <td className='py-3 pr-4'>{r.uraian}</td>
                      <td className='py-3 pr-4 font-mono text-xs'>{r.kodeAnggaran}</td>
                      <td className='py-3 pr-4'>{r.mataAnggaran}</td>
                      <td className='py-3 pr-4 text-right text-green-600 dark:text-green-400 font-medium'>{formatCurrency(r.penerimaan || 0)}</td>
                      <td className='py-3 pr-4 text-right text-red-600 dark:text-red-400 font-medium'>{formatCurrency(r.pengeluaran || 0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Floating input dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Data</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
              <Input
                label='No'
                value={form.no}
                onChange={(e) => setForm({ ...form, no: e.target.value })}
                placeholder='Contoh: 1'
                required
              />
              <Input
                label='Tanggal'
                type='date'
                value={form.tanggal}
                onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                required
              />
            </div>

            <Input
              label='Uraian'
              value={form.uraian}
              onChange={(e) => setForm({ ...form, uraian: e.target.value })}
              placeholder='Masukkan uraian'
              required
            />

            <Input
              label='Kode Anggaran'
              value={form.kodeAnggaran}
              onChange={(e) => setForm({ ...form, kodeAnggaran: e.target.value })}
              placeholder='Harus ada di DATA BASE2'
              required
            />

            <Input
              label='Mata Anggaran'
              value={form.mataAnggaran}
              onChange={(e) => setForm({ ...form, mataAnggaran: e.target.value })}
              placeholder='Akan terisi otomatis saat submit'
              disabled
            />

            <div className='grid grid-cols-2 gap-3'>
              <Input
                label='Penerimaan'
                type='number'
                value={form.penerimaan}
                onChange={(e) => setForm({ ...form, penerimaan: Number(e.target.value) })}
              />
              <Input
                label='Pengeluaran'
                type='number'
                value={form.pengeluaran}
                onChange={(e) => setForm({ ...form, pengeluaran: Number(e.target.value) })}
              />
            </div>

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

