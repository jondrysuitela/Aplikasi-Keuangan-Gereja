import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { DoorscrieftRowInput, KodeAnggaranItem } from '@/types';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, FileCheck2, Lock, Plus, Search, WalletCards } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { can } from '@/lib/permissions';
import { getElectronAPI } from '@/lib/electron';
import { YearLockedBanner } from '@/components/YearLockedBanner';
import { AppStateMessage } from '@/components/AppStateMessage';

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
  const { user, tahunAktif, lockedYears, kodeAnggarans, setKodeAnggarans, doorscrieftTransaksis, addDoorscrieftTransaksi } = useStore();
  const isYearLocked = lockedYears.includes(tahunAktif);
  const canInput = can(user?.role, 'input');

  // Master Kode Anggaran di Pengaturan adalah pusat data aplikasi.
  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.loadKodeAnggaran) return;
    electronAPI
      .loadKodeAnggaran()
      .then((items: KodeAnggaranItem[]) => {
        if (Array.isArray(items)) setKodeAnggarans(items);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(initialForm);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 150);

  const kodeAnggaranMap = useMemo(() => {
    return new Map(kodeAnggarans.map((item) => [item.kodeAnggaran, item]));
  }, [kodeAnggarans]);
  const kodeAnggaranInputItems = useMemo(() => {
    return kodeAnggarans.filter((item) => item.aktifInput !== false && item.jenisKode !== 'judul');
  }, [kodeAnggarans]);

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

  const summary = useMemo(() => {
    const rows = doorscrieftTransaksis.filter((r) => {
      const d = new Date(r.tanggal);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === tahunAktif;
    });
    const totalPenerimaan = rows.reduce((sum, row) => sum + Number(row.penerimaan || 0), 0);
    const totalPengeluaran = rows.reduce((sum, row) => sum + Number(row.pengeluaran || 0), 0);
    const invalidKode = rows.filter((row) => !kodeAnggaranMap.has(row.kodeAnggaran)).length;
    const lastDate = rows
      .map((row) => new Date(row.tanggal))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return {
      rows: rows.length,
      totalPenerimaan,
      totalPengeluaran,
      saldo: totalPenerimaan - totalPengeluaran,
      invalidKode,
      lastDate,
    };
  }, [doorscrieftTransaksis, kodeAnggaranMap, tahunAktif]);

  const validateKodeAnggaran = (kode: string) => {
    const hit = kodeAnggaranMap.get(kode);
    if (!hit || hit.jenisKode === 'judul' || hit.aktifInput === false) return null;
    return hit;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin input data.');
      return;
    }
    if (isYearLocked) {
      toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk mengubah data.`);
      return;
    }
    const tanggal = new Date(form.tanggal);
    const penerimaan = Number(form.penerimaan || 0);
    const pengeluaran = Number(form.pengeluaran || 0);

    if (Number.isNaN(tanggal.getTime())) {
      toast.error('Tanggal transaksi belum valid.');
      return;
    }
    if (tanggal.getFullYear() !== tahunAktif) {
      toast.error(`Tanggal harus berada pada tahun aktif ${tahunAktif}.`);
      return;
    }
    if (!form.no.trim() || !form.uraian.trim()) {
      toast.error('No dan uraian wajib diisi.');
      return;
    }
    if (penerimaan <= 0 && pengeluaran <= 0) {
      toast.error('Isi nominal penerimaan atau pengeluaran.');
      return;
    }
    if (penerimaan > 0 && pengeluaran > 0) {
      toast.error('Satu transaksi hanya boleh berisi salah satu: penerimaan atau pengeluaran.');
      return;
    }

    const kode = form.kodeAnggaran.trim();
    const mata = validateKodeAnggaran(kode);
    if (!mata) {
      toast.error('Kode anggaran tidak valid.', {
        description: 'Kode tidak ada di DATA BASE2.',
      });
      return;
    }

    try {
      addDoorscrieftTransaksi({
        tanggal,
        no: form.no.trim(),
        uraian: form.uraian.trim(),
        kodeAnggaran: kode,
        mataAnggaran: mata.mataAnggaran,
        penerimaan,
        pengeluaran,
        createdBy: user?.username || 'system',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Data gagal disimpan.');
      return;
    }

    setIsOpen(false);
    setForm(initialForm);
  };

  const handleKodeAnggaranChange = (kode: string) => {
    const normalizedKode = kode.trim();
    const mata = validateKodeAnggaran(normalizedKode);
    setForm({
      ...form,
      kodeAnggaran: kode,
      mataAnggaran: mata?.mataAnggaran || '',
    });
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>Entri Transaksi</p>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Input Data Keuangan</h1>
          <p className='text-slate-500 dark:text-slate-400'>Catat transaksi manual berbasis kode anggaran untuk Tahun {tahunAktif}</p>
          {isYearLocked && (
            <p className='mt-1 inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700'>
              <Lock className='h-3.5 w-3.5' />
              Tahun {tahunAktif} terkunci
            </p>
          )}
        </div>
        <Button disabled={isYearLocked || !canInput} onClick={() => { setForm(initialForm); setIsOpen(true); }}>
          <Plus className='mr-2 h-4 w-4' /> Tambah
        </Button>
      </div>

      {isYearLocked && <YearLockedBanner tahun={tahunAktif} />}

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <SummaryCard
          title='Total Penerimaan'
          value={formatCurrency(summary.totalPenerimaan)}
          detail={`${summary.rows} transaksi tahun aktif`}
          icon={<ArrowUpCircle className='h-4 w-4' />}
          tone='income'
        />
        <SummaryCard
          title='Total Pengeluaran'
          value={formatCurrency(summary.totalPengeluaran)}
          detail='Akumulasi input manual'
          icon={<ArrowDownCircle className='h-4 w-4' />}
          tone='expense'
        />
        <SummaryCard
          title='Saldo Input'
          value={formatCurrency(summary.saldo)}
          detail={summary.lastDate ? `Update ${summary.lastDate.toLocaleDateString('id-ID')}` : 'Belum ada transaksi'}
          icon={<WalletCards className='h-4 w-4' />}
          tone={summary.saldo < 0 ? 'expense' : 'neutral'}
        />
        <SummaryCard
          title='Kesiapan Data'
          value={summary.invalidKode > 0 ? `${summary.invalidKode} perlu dicek` : 'Valid'}
          detail={`${kodeAnggaranInputItems.length} kode Isi tersedia`}
          icon={summary.invalidKode > 0 ? <AlertTriangle className='h-4 w-4' /> : <FileCheck2 className='h-4 w-4' />}
          tone={summary.invalidKode > 0 ? 'warning' : 'success'}
        />
      </div>

      <Card>
        <CardHeader className='gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <FileCheck2 className='h-4 w-4 text-slate-500' />
              Daftar Transaksi Manual
            </CardTitle>
            <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
              Menampilkan {filteredRows.length} dari {summary.rows} transaksi Tahun {tahunAktif}.
            </p>
          </div>
          <div className='relative w-full lg:max-w-sm'>
            <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
            <Input
              className='pl-9'
              placeholder='Cari no, uraian, kode anggaran...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
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
                    <td colSpan={7} className='py-12'>
                      <AppStateMessage
                        tone={summary.rows === 0 ? 'empty' : 'search'}
                        title={summary.rows === 0 ? 'Belum ada transaksi' : 'Belum ada transaksi yang cocok'}
                        detail={summary.rows === 0 ? 'Tambahkan data manual untuk mulai mencatat transaksi.' : 'Ubah kata kunci pencarian untuk melihat transaksi.'}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.id} className='border-b last:border-0 dark:border-slate-700 dark:text-slate-200'>
                      <td className='py-3 pr-4'>{r.no}</td>
                      <td className='py-3 pr-4'>{new Date(r.tanggal).toLocaleDateString('id-ID')}</td>
                      <td className='py-3 pr-4'>{r.uraian}</td>
                      <td className='py-3 pr-4'>
                        <span className={cn(
                          'rounded-md px-2 py-1 font-mono text-xs',
                          kodeAnggaranMap.has(r.kodeAnggaran)
                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                            : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
                        )}>
                          {r.kodeAnggaran}
                        </span>
                      </td>
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
      <Dialog open={isOpen} onOpenChange={setIsOpen} draggable>
        <DialogContent>
          <DialogHeader draggable>
            <DialogTitle>Tambah Transaksi Manual</DialogTitle>
          </DialogHeader>
          {!canInput && (
            <p className='rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700'>
              Role Anda hanya dapat melihat data.
            </p>
          )}
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
              onChange={(e) => handleKodeAnggaranChange(e.target.value)}
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

function SummaryCard({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: 'income' | 'expense' | 'neutral' | 'success' | 'warning';
}) {
  return (
    <Card>
      <CardContent className='flex items-start justify-between gap-3 py-5'>
        <div>
          <p className='text-sm font-medium text-slate-500 dark:text-slate-400'>{title}</p>
          <p className={cn(
            'mt-2 text-xl font-bold text-slate-900 dark:text-white',
            tone === 'income' && 'text-green-600 dark:text-green-400',
            tone === 'expense' && 'text-red-600 dark:text-red-400',
            tone === 'success' && 'text-blue-600 dark:text-blue-400',
            tone === 'warning' && 'text-amber-600 dark:text-amber-400',
          )}>
            {value}
          </p>
          <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>{detail}</p>
        </div>
        <div className={cn(
          'rounded-md p-2',
          tone === 'income' && 'bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-300',
          tone === 'expense' && 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300',
          tone === 'neutral' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
          tone === 'success' && 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
          tone === 'warning' && 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
        )}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

