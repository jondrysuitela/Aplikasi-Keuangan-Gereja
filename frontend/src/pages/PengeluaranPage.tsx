import { useState, useMemo } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Plus, Search, Edit2, Trash2, FileDown } from 'lucide-react';
import type { Pengeluaran } from '@/types';
import ExcelJS from 'exceljs';

const initialForm = {
  tanggal: new Date().toISOString().split('T')[0],
  kategoriId: '',
  subKategoriId: '',
  keterangan: '',
  jumlah: 0,
  penanggungJawab: '',
};

export function PengeluaranPage() {
  const { pengeluarans, addPengeluaran, updatePengeluaran, deletePengeluaran, kategoriBelanjas, tahunAktif } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);

  const filteredData = useMemo(() => {
    return pengeluarans
      .filter((p) => new Date(p.tanggal).getFullYear() === tahunAktif)
      .filter((p) =>
        p.keterangan.toLowerCase().includes(search.toLowerCase()) ||
        p.penanggungJawab.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  }, [pengeluarans, search, tahunAktif]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updatePengeluaran(editingId, {
        tanggal: new Date(form.tanggal),
        kategoriId: form.kategoriId,
        subKategoriId: form.subKategoriId,
        keterangan: form.keterangan,
        jumlah: Number(form.jumlah),
        penanggungJawab: form.penanggungJawab,
      });
    } else {
      addPengeluaran({
        tanggal: new Date(form.tanggal),
        kategoriId: form.kategoriId,
        subKategoriId: form.subKategoriId,
        keterangan: form.keterangan,
        jumlah: Number(form.jumlah),
        penanggungJawab: form.penanggungJawab,
        createdBy: 'admin',
      });
    }
    setIsOpen(false);
    setEditingId(null);
    setForm(initialForm);
  };

  const handleEdit = (item: Pengeluaran) => {
    setEditingId(item.id);
    setForm({
      tanggal: new Date(item.tanggal).toISOString().split('T')[0],
      kategoriId: item.kategoriId,
      subKategoriId: item.subKategoriId,
      keterangan: item.keterangan,
      jumlah: item.jumlah,
      penanggungJawab: item.penanggungJawab,
    });
    setIsOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Yakin hapus data ini?')) {
      deletePengeluaran(id);
    }
  };

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pengeluaran');
    
    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Tanggal', key: 'tanggal', width: 15 },
      { header: 'Kategori', key: 'kategori', width: 20 },
      { header: 'Keterangan', key: 'keterangan', width: 30 },
      { header: 'Jumlah', key: 'jumlah', width: 15 },
      { header: 'Penanggung Jawab', key: 'penanggungJawab', width: 20 },
    ];

    filteredData.forEach((item, index) => {
      const kategori = kategoriBelanjas.find((k) => k.id === item.kategoriId);
      worksheet.addRow({
        no: index + 1,
        tanggal: formatDate(item.tanggal),
        kategori: kategori?.nama || '-',
        keterangan: item.keterangan,
        jumlah: item.jumlah,
        penanggungJawab: item.penanggungJawab,
      });
    });

    worksheet.getColumn(5).numFmt = '#,##0';
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pengeluaran_${tahunAktif}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getKategoriName = (id: string) => {
    return kategoriBelanjas.find((k) => k.id === id)?.nama || '-';
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900'>Pengeluaran</h1>
          <p className='text-slate-500'>Kelola data pengeluaran gereja</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' onClick={exportToExcel}>
            <FileDown className='mr-2 h-4 w-4' /> Export Excel
          </Button>
          <Button onClick={() => { setForm(initialForm); setEditingId(null); setIsOpen(true); }}>
            <Plus className='mr-2 h-4 w-4' /> Tambah
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className='flex items-center gap-4'>
            <div className='relative flex-1 max-w-md'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
              <Input
                placeholder='Cari keterangan atau penanggung jawab...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className='pl-10'
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead>
                <tr className='border-b text-left text-sm font-medium text-slate-500'>
                  <th className='pb-3 pr-4'>No</th>
                  <th className='pb-3 pr-4'>Tanggal</th>
                  <th className='pb-3 pr-4'>Kategori</th>
                  <th className='pb-3 pr-4'>Keterangan</th>
                  <th className='pb-3 pr-4 text-right'>Jumlah</th>
                  <th className='pb-3 pr-4'>Penanggung Jawab</th>
                  <th className='pb-3 text-right'>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='py-8 text-center text-slate-500'>
                      Belum ada data pengeluaran
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item, index) => (
                    <tr key={item.id} className='border-b last:border-0'>
                      <td className='py-3 pr-4'>{index + 1}</td>
                      <td className='py-3 pr-4'>{formatDate(item.tanggal)}</td>
                      <td className='py-3 pr-4'>{getKategoriName(item.kategoriId)}</td>
                      <td className='py-3 pr-4'>{item.keterangan}</td>
                      <td className='py-3 pr-4 text-right font-medium text-red-600'>
                        {formatCurrency(item.jumlah)}
                      </td>
                      <td className='py-3 pr-4'>{item.penanggungJawab}</td>
                      <td className='py-3 text-right'>
                        <div className='flex justify-end gap-2'>
                          <Button variant='ghost' size='icon' onClick={() => handleEdit(item)}>
                            <Edit2 className='h-4 w-4' />
                          </Button>
                          <Button variant='ghost' size='icon' onClick={() => handleDelete(item.id)}>
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
              {editingId ? 'Edit Pengeluaran' : 'Tambah Pengeluaran Baru'}
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
              <label className='text-sm font-medium mb-2 block'>Kategori</label>
              <select
                className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
                value={form.kategoriId}
                onChange={(e) => setForm({ ...form, kategoriId: e.target.value })}
                required
              >
                <option value=''>Pilih Kategori</option>
                {kategoriBelanjas.map((k) => (
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
              value={form.jumlah}
              onChange={(e) => setForm({ ...form, jumlah: Number(e.target.value) })}
              placeholder='Masukkan jumlah'
              required
            />
            <Input
              label='Penanggung Jawab'
              value={form.penanggungJawab}
              onChange={(e) => setForm({ ...form, penanggungJawab: e.target.value })}
              placeholder='Nama penanggung jawab'
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
