import { useState, useMemo } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Plus, Search, Edit2, Trash2, FileDown, ArrowUpCircle, CalendarDays, ListChecks, Landmark } from 'lucide-react';
import type { Pemasukan } from '@/types';
import { can } from '@/lib/permissions';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { YearLockedBanner } from '@/components/YearLockedBanner';

const initialForm = {
  tanggal: new Date().toISOString().split('T')[0],
  kategoriId: '',
  subKategoriId: '',
  keterangan: '',
  jumlah: 0,
  sumberDana: '',
};

export function PemasukanPage() {
  const { user, pemasukans, addPemasukan, updatePemasukan, deletePemasukan, kategoriPendapatans, tahunAktif, lockedYears } = useStore();
  const canInput = can(user?.role, 'input');
  const canDelete = can(user?.role, 'delete');
  const isYearLocked = lockedYears.includes(tahunAktif);
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);

  const tahunData = useMemo(() => {
    return pemasukans
      .filter((p) => new Date(p.tanggal).getFullYear() === tahunAktif)
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  }, [pemasukans, tahunAktif]);

  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tahunData;
    return tahunData.filter((p) => {
      const kategori = kategoriPendapatans.find((k) => k.id === p.kategoriId)?.nama || '';
      return (
        p.keterangan.toLowerCase().includes(query) ||
        p.sumberDana.toLowerCase().includes(query) ||
        kategori.toLowerCase().includes(query)
      );
    });
  }, [tahunData, search, kategoriPendapatans]);

  const stats = useMemo(() => {
    const total = tahunData.reduce((sum, item) => sum + Number(item.jumlah || 0), 0);
    const bulanIni = new Date().getFullYear() === tahunAktif ? new Date().getMonth() : null;
    const bulanIniTotal = bulanIni === null ? 0 : tahunData
      .filter((item) => new Date(item.tanggal).getMonth() === bulanIni)
      .reduce((sum, item) => sum + Number(item.jumlah || 0), 0);
    const average = tahunData.length > 0 ? total / tahunData.length : 0;
    const sumberDanaCount = new Set(tahunData.map((item) => item.sumberDana).filter(Boolean)).size;
    return { total, bulanIniTotal, average, sumberDanaCount };
  }, [tahunData, tahunAktif]);

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

    if (Number(form.jumlah || 0) <= 0) {
      toast.error('Jumlah pemasukan harus lebih dari 0.');
      return;
    }

    try {
      if (editingId) {
        updatePemasukan(editingId, {
          tanggal: new Date(form.tanggal),
          kategoriId: form.kategoriId,
          subKategoriId: form.subKategoriId,
          keterangan: form.keterangan.trim(),
          jumlah: Number(form.jumlah),
          sumberDana: form.sumberDana.trim(),
        });
        toast.success('Data pemasukan diperbarui.');
      } else {
        addPemasukan({
          tanggal: new Date(form.tanggal),
          kategoriId: form.kategoriId,
          subKategoriId: form.subKategoriId,
          keterangan: form.keterangan.trim(),
          jumlah: Number(form.jumlah),
          sumberDana: form.sumberDana.trim(),
          createdBy: user?.username || 'admin',
        });
        toast.success('Data pemasukan ditambahkan.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan pemasukan.');
      return;
    }
    setIsOpen(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleEdit = (item: Pemasukan) => {
    setEditingId(item.id);
    setForm({
      tanggal: new Date(item.tanggal).toISOString().split('T')[0],
      kategoriId: item.kategoriId,
      subKategoriId: item.subKategoriId,
      keterangan: item.keterangan,
      jumlah: item.jumlah,
      sumberDana: item.sumberDana,
    });
    setIsOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      toast.error('Role Anda tidak memiliki izin menghapus data.');
      return;
    }
    if (isYearLocked) {
      toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk menghapus data.`);
      return;
    }
    const lanjut = await confirm({
      title: 'Hapus data pemasukan?',
      description: 'Data yang dihapus tidak bisa dikembalikan dari daftar ini.',
      confirmText: 'Hapus',
      cancelText: 'Batal',
      tone: 'danger',
    });
    if (!lanjut) return;
    try {
      deletePemasukan(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus pemasukan.');
      return;
    }
    toast.success('Data pemasukan dihapus.');
  };

  const exportToExcel = async () => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pemasukan');

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Tanggal', key: 'tanggal', width: 15 },
      { header: 'Kategori', key: 'kategori', width: 24 },
      { header: 'Keterangan', key: 'keterangan', width: 36 },
      { header: 'Jumlah', key: 'jumlah', width: 18 },
      { header: 'Sumber Dana', key: 'sumberDana', width: 22 },
    ];

    filteredData.forEach((item, index) => {
      const kategori = kategoriPendapatans.find((k) => k.id === item.kategoriId);
      worksheet.addRow({
        no: index + 1,
        tanggal: formatDate(item.tanggal),
        kategori: kategori?.nama || '-',
        keterangan: item.keterangan,
        jumlah: item.jumlah,
        sumberDana: item.sumberDana,
      });
    });

    worksheet.getColumn(5).numFmt = '#,##0';
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pemasukan_${tahunAktif}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export pemasukan berhasil.', {
      description: `${filteredData.length} baris diexport untuk tahun ${tahunAktif}.`,
    });
  };

  const getKategoriName = (id: string) => {
    return kategoriPendapatans.find((k) => k.id === id)?.nama || '-';
  };

  const emptyText = search.trim()
    ? 'Tidak ada pemasukan yang cocok dengan pencarian.'
    : `Belum ada data pemasukan untuk tahun ${tahunAktif}.`;

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300'>
            <ArrowUpCircle className='h-4 w-4' />
            Modul Penerimaan Kas
          </div>
          <h1 className='mt-1 text-2xl font-bold text-slate-900 dark:text-white'>Pemasukan</h1>
          <p className='text-slate-500 dark:text-slate-400'>Kelola penerimaan gereja Tahun {tahunAktif}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' onClick={exportToExcel} disabled={filteredData.length === 0}>
            <FileDown className='mr-2 h-4 w-4' /> Export Excel
          </Button>
          <Button disabled={!canInput || isYearLocked} onClick={() => { setForm(initialForm); setEditingId(null); setIsOpen(true); }}>
            <Plus className='mr-2 h-4 w-4' /> Tambah
          </Button>
        </div>
      </div>

      {isYearLocked && <YearLockedBanner tahun={tahunAktif} />}

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Total Pemasukan</p>
                <p className='mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(stats.total)}</p>
              </div>
              <ArrowUpCircle className='h-5 w-5 text-emerald-600' />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Bulan Berjalan</p>
                <p className='mt-2 text-xl font-bold text-slate-900 dark:text-white'>{formatCurrency(stats.bulanIniTotal)}</p>
              </div>
              <CalendarDays className='h-5 w-5 text-slate-500' />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Rata-rata Transaksi</p>
                <p className='mt-2 text-xl font-bold text-slate-900 dark:text-white'>{formatCurrency(stats.average)}</p>
              </div>
              <ListChecks className='h-5 w-5 text-slate-500' />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-sm text-slate-500 dark:text-slate-400'>Sumber Dana</p>
                <p className='mt-2 text-xl font-bold text-slate-900 dark:text-white'>{stats.sumberDanaCount}</p>
              </div>
              <Landmark className='h-5 w-5 text-slate-500' />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className='gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div>
            <CardTitle className='text-base'>Daftar Pemasukan</CardTitle>
            <p className='text-sm text-slate-500 dark:text-slate-400'>
              Menampilkan {filteredData.length} dari {tahunData.length} transaksi.
            </p>
          </div>
          <div className='relative w-full lg:max-w-md'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
            <Input
              placeholder='Cari keterangan, kategori, atau sumber dana...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='pl-10'
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700'>
            <table className='w-full min-w-[860px] text-sm'>
              <thead className='bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400'>
                <tr>
                  <th className='px-4 py-3'>No</th>
                  <th className='px-4 py-3'>Tanggal</th>
                  <th className='px-4 py-3'>Kategori</th>
                  <th className='px-4 py-3'>Keterangan</th>
                  <th className='px-4 py-3 text-right'>Jumlah</th>
                  <th className='px-4 py-3'>Sumber Dana</th>
                  <th className='px-4 py-3 text-right'>Aksi</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='px-4 py-12 text-center text-slate-500 dark:text-slate-400'>
                      {emptyText}
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item, index) => (
                    <tr key={item.id} className='bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/50'>
                      <td className='px-4 py-3 text-slate-500'>{index + 1}</td>
                      <td className='px-4 py-3 font-medium text-slate-700 dark:text-slate-200'>{formatDate(item.tanggal)}</td>
                      <td className='px-4 py-3 text-slate-700 dark:text-slate-200'>{getKategoriName(item.kategoriId)}</td>
                      <td className='px-4 py-3 text-slate-700 dark:text-slate-200'>{item.keterangan}</td>
                      <td className='px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-300'>
                        {formatCurrency(item.jumlah)}
                      </td>
                      <td className='px-4 py-3 text-slate-600 dark:text-slate-300'>{item.sumberDana}</td>
                      <td className='px-4 py-3 text-right'>
                        <div className='flex justify-end gap-1'>
                          <Button variant='ghost' size='icon' disabled={!canInput || isYearLocked} onClick={() => handleEdit(item)} title='Edit pemasukan'>
                            <Edit2 className='h-4 w-4' />
                          </Button>
                          <Button variant='ghost' size='icon' disabled={!canDelete || isYearLocked} onClick={() => handleDelete(item.id)} title='Hapus pemasukan'>
                            <Trash2 className='h-4 w-4 text-red-500' />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Pemasukan' : 'Tambah Pemasukan Baru'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <Input
              label='Tanggal'
              type='date'
              value={form.tanggal}
              onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
              required
            />
            <div>
              <label className='mb-2 block text-sm font-medium'>Kategori</label>
              <select
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
                value={form.kategoriId}
                onChange={(e) => setForm({ ...form, kategoriId: e.target.value })}
                required
              >
                <option value=''>Pilih Kategori</option>
                {kategoriPendapatans.map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </select>
            </div>
            <Input
              label='Keterangan'
              value={form.keterangan}
              onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
              placeholder='Masukkan keterangan'
              required
            />
            <Input
              label='Jumlah'
              type='number'
              min={1}
              value={form.jumlah}
              onChange={(e) => setForm({ ...form, jumlah: Number(e.target.value) })}
              placeholder='Masukkan jumlah'
              required
            />
            <Input
              label='Sumber Dana'
              value={form.sumberDana}
              onChange={(e) => setForm({ ...form, sumberDana: e.target.value })}
              placeholder='Contoh: Kas Gereja, Bank BCA'
              required
            />
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setIsOpen(false)}>
                Batal
              </Button>
              <Button type='submit'>
                {editingId ? 'Simpan' : 'Tambah'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
