import { useMemo, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { Search, BookOpen, ChevronRight } from 'lucide-react';
import type { DoorscrieftRowInput, KodeAnggaranItem } from '@/types';

function isBelanjaRow(r: DoorscrieftRowInput) {
  const p = Number(r.penerimaan || 0);
  const q = Number(r.pengeluaran || 0);
  return q !== 0 && p === 0;
}

export function KomponenBelanjaPage() {
  const { kodeAnggarans, doorscrieftTransaksis, tahunAktif } = useStore();

  const [kodeAnggaranAktif, setKodeAnggaranAktif] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const kodeAnggaranBelanjaFromDoorscrieft = useMemo(() => {
    const itemsByKode = new Map<string, KodeAnggaranItem>();

    doorscrieftTransaksis
      .filter((r) => {
        const d = new Date(r.tanggal);
        return d.getFullYear() === tahunAktif && isBelanjaRow(r) && String(r.kodeAnggaran || '').startsWith('II.');
      })
      .forEach((r) => {
        const kodeAnggaran = String(r.kodeAnggaran || '').trim();
        if (!kodeAnggaran || itemsByKode.has(kodeAnggaran)) return;

        const master = kodeAnggarans.find((k) => k.kodeAnggaran === kodeAnggaran);
        itemsByKode.set(kodeAnggaran, {
          kodeAnggaran,
          mataAnggaran: master?.mataAnggaran || r.mataAnggaran || kodeAnggaran,
        });
      });

    return Array.from(itemsByKode.values()).sort((a, b) => a.kodeAnggaran.localeCompare(b.kodeAnggaran));
  }, [doorscrieftTransaksis, kodeAnggarans, tahunAktif]);

  const kodeAktifItem = useMemo(() => {
    if (!kodeAnggaranAktif) return null;
    return kodeAnggaranBelanjaFromDoorscrieft.find((x) => x.kodeAnggaran === kodeAnggaranAktif) ?? null;
  }, [kodeAnggaranAktif, kodeAnggaranBelanjaFromDoorscrieft]);

  const rowsBelanjaAktif = useMemo(() => {
    if (!kodeAnggaranAktif) return [];

    return doorscrieftTransaksis
      .filter((r) => {
        const d = new Date(r.tanggal);
        return d.getFullYear() === tahunAktif;
      })
      .filter((r) => r.kodeAnggaran === kodeAnggaranAktif)
      .filter((r) => isBelanjaRow(r))
      .sort((a, b) => {
        const da = new Date(a.tanggal).getTime();
        const db = new Date(b.tanggal).getTime();
        if (db !== da) return db - da;
        return String(a.no).localeCompare(String(b.no));
      });
  }, [doorscrieftTransaksis, kodeAnggaranAktif, tahunAktif]);

  const totals = useMemo(() => {
    const penerimaan = rowsBelanjaAktif.reduce((sum, r) => sum + Number(r.penerimaan || 0), 0);
    const pengeluaran = rowsBelanjaAktif.reduce((sum, r) => sum + Number(r.pengeluaran || 0), 0);
    return { penerimaan, pengeluaran, saldo: penerimaan - pengeluaran };
  }, [rowsBelanjaAktif]);

  const filteredKodeAnggaran = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kodeAnggaranBelanjaFromDoorscrieft;
    return kodeAnggaranBelanjaFromDoorscrieft.filter((k) => {
      return (
        (k.kodeAnggaran || '').toLowerCase().includes(q) ||
        (k.mataAnggaran || '').toLowerCase().includes(q)
      );
    });
  }, [kodeAnggaranBelanjaFromDoorscrieft, search]);

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Komponen Pengeluaran</h1>
          <p className='text-slate-500'>Semua Mata Anggaran Belanja (key: Kode Anggaran)</p>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BookOpen className='h-5 w-5' />
              Daftar Mata Anggaran Belanja
            </CardTitle>
            <CardDescription>klik kode untuk melihat detail dari Doorscrieft.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
              <Input
                className='pl-10'
                placeholder='Cari kode / mata anggaran...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className='flex flex-wrap gap-2'>
              {filteredKodeAnggaran.length === 0 ? (
                <p className='text-sm text-slate-500'>Tidak ada mata anggaran belanja untuk tahun aktif.</p>
              ) : (
                filteredKodeAnggaran.map((k) => (
                  <Button
                    key={k.kodeAnggaran}
                    variant={kodeAnggaranAktif === k.kodeAnggaran ? 'default' : 'outline'}
                    onClick={() => setKodeAnggaranAktif(k.kodeAnggaran)}
                    className='max-w-full'
                  >
                    <span className='font-mono text-xs mr-2'>{k.kodeAnggaran}</span>
                    <span className='truncate text-sm'>{k.mataAnggaran}</span>
                  </Button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center justify-between gap-2'>
              <span>Detail Mata Anggaran</span>
              {kodeAnggaranAktif ? <ChevronRight className='h-4 w-4' /> : null}
            </CardTitle>
            <CardDescription>
              {kodeAktifItem
                ? `${kodeAktifItem.kodeAnggaran} - ${kodeAktifItem.mataAnggaran}`
                : 'Pilih mata anggaran belanja.'}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-3'>
              <div>
                <p className='text-sm text-slate-500'>Total Pengeluaran</p>
                <div className='text-xl font-bold text-red-600'>{formatCurrency(totals.pengeluaran)}</div>
              </div>
            </div>

            {!kodeAnggaranAktif ? (
              <p className='text-sm text-slate-500'>Klik sebuah mata anggaran di panel kiri.</p>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full'>
                  <thead>
                    <tr className='border-b dark:border-slate-700 text-left text-sm font-medium text-slate-500'>
                      <th className='pb-3 pr-4'>No</th>
                      <th className='pb-3 pr-4'>Tanggal</th>
                      <th className='pb-3 pr-4'>Uraian</th>
                      <th className='pb-3 pr-4 text-right'>Pengeluaran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsBelanjaAktif.length === 0 ? (
                      <tr>
                        <td colSpan={4} className='py-8 text-center text-slate-500'>Tidak ada transaksi belanja.</td>
                      </tr>
                    ) : (
                      rowsBelanjaAktif.map((r) => (
                        <tr key={r.id} className='border-b last:border-0 dark:border-slate-700 dark:text-slate-200'>
                          <td className='py-3 pr-4'>{r.no}</td>
                          <td className='py-3 pr-4'>{new Date(r.tanggal).toLocaleDateString('id-ID')}</td>
                          <td className='py-3 pr-4'>{r.uraian}</td>
                          <td className='py-3 pr-4 text-right text-red-600 font-medium'>
                            {formatCurrency(r.pengeluaran || 0)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
