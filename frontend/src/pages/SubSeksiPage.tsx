import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, ChevronRight, ChevronDown, Search, Download, Layers3, ArrowUpCircle, ArrowDownCircle, FileText } from 'lucide-react';
import { formatCurrency, getMonthName } from '@/lib/utils';
import { can } from '@/lib/permissions';
import type { KodeAnggaranItem, SubSeksi } from '@/types';
import { toast } from 'sonner';
import { ReportPrintButton, ReportPrintDocument } from '@/components/print/ReportPrint';

type SubSeksiLoadApi = {
  electronAPI?: {
    loadSubSeksiDb?: () => Promise<Array<Omit<SubSeksi, 'id'>>>;
    loadSubSeksi?: () => Promise<Array<Omit<SubSeksi, 'id'>>>;
    saveSubSeksi?: (items: Array<Omit<SubSeksi, 'id'>>) => Promise<{ success: boolean; error?: string }>;
    loadKodeAnggaran?: () => Promise<KodeAnggaranItem[]>;
  };
};

type NodeInfo = {
  nama: string;
  kode: string;
  anak: Array<{ kode: string; nama: string }>;
  parentKode?: string;
};

function getJenisKode(kode: string): 'pendapatan' | 'pengeluaran' {
  return kode === 'II' || kode.startsWith('II.') ? 'pengeluaran' : 'pendapatan';
}

function inferParentKode(kode: string, allCodes: Set<string>) {
  const parts = String(kode || '').split('.').filter(Boolean);
  for (let length = parts.length - 1; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join('.');
    if (allCodes.has(candidate)) return candidate;
  }
  return '';
}

function isSubSeksiJudul(item: KodeAnggaranItem) {
  return (item.jenisKode === 'judul' || item.aktifInput === false) && /\bsub\s*[- ]?\s*seksi\b/i.test(item.mataAnggaran);
}

function buildSubSeksiFromMasterKode(masterItems: KodeAnggaranItem[] = []) {
  const items = masterItems
    .map((item) => ({
      ...item,
      kodeAnggaran: String(item.kodeAnggaran || '').trim(),
      mataAnggaran: String(item.mataAnggaran || '').trim(),
    }))
    .filter((item) => item.kodeAnggaran && item.mataAnggaran);
  const masterByKode = new Map(items.map((item) => [item.kodeAnggaran, item]));
  const subSeksiJudulItems = items.filter(isSubSeksiJudul);
  const subSeksiKodeSet = new Set(subSeksiJudulItems.map((item) => item.kodeAnggaran));
  const isiBySubSeksiKode = new Map<string, KodeAnggaranItem[]>();

  items
    .filter((item) => (item.jenisKode || 'isi') === 'isi' && item.aktifInput !== false)
    .forEach((item) => {
      let parentKode = item.parentKode || inferParentKode(item.kodeAnggaran, new Set(masterByKode.keys()));
      while (parentKode) {
        if (subSeksiKodeSet.has(parentKode)) {
          const children = isiBySubSeksiKode.get(parentKode) || [];
          children.push(item);
          isiBySubSeksiKode.set(parentKode, children);
          return;
        }
        const parent = masterByKode.get(parentKode);
        parentKode = parent?.parentKode || inferParentKode(parentKode, new Set(masterByKode.keys()));
      }
    });

  return subSeksiJudulItems
    .map((item) => {
      const anak = (isiBySubSeksiKode.get(item.kodeAnggaran) || [])
        .map((child) => ({ kode: child.kodeAnggaran, nama: child.mataAnggaran }));
      return {
        nama: item.mataAnggaran,
        kode: item.kodeAnggaran,
        jenis: getJenisKode(item.kodeAnggaran),
        anak,
      } as Omit<SubSeksi, 'id'>;
    })
    .filter((item) => item.anak && item.anak.length > 0)
    .sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }));
}

export function SubSeksiPage() {
  const { user, subSeksis, setSubSeksis, doorscrieftTransaksis, tahunAktif, addSubSeksi, updateSubSeksi, kodeAnggarans, setKodeAnggarans } = useStore();
  const canInput = can(user?.role, 'input');

  useEffect(() => {
    const anyWin = window as unknown as SubSeksiLoadApi;
    if (!anyWin?.electronAPI?.loadSubSeksi && !anyWin?.electronAPI?.loadSubSeksiDb) return;
    anyWin.electronAPI
      .loadSubSeksi?.()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) setSubSeksis(items);
        else if (anyWin?.electronAPI?.loadSubSeksiDb) {
          anyWin.electronAPI.loadSubSeksiDb().then((dbItems) => {
            if (Array.isArray(dbItems) && dbItems.length > 0) setSubSeksis(dbItems);
          }).catch(() => {});
        }
      })
      .catch(() => {
        if (anyWin?.electronAPI?.loadSubSeksiDb) {
          anyWin.electronAPI.loadSubSeksiDb().then((items) => {
            if (Array.isArray(items) && items.length > 0) setSubSeksis(items);
          }).catch(() => {});
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formMaster, setFormMaster] = useState({ nama: '', kode: '' });
  const [search, setSearch] = useState('');
  const [jenis, setJenis] = useState<'pendapatan' | 'pengeluaran'>('pendapatan');
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [activeKode, setActiveKode] = useState<string | null>(null);
  const [filterBulan, setFilterBulan] = useState<number | 'all'>('all');

  const getJenis = (kode: string): 'pendapatan' | 'pengeluaran' => (
    getJenisKode(kode)
  );

  const handleSyncFromMasterKode = async () => {
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin mengubah Sub Seksi.');
      return;
    }
    const anyWin = window as unknown as SubSeksiLoadApi;
    let masterItems = kodeAnggarans;
    try {
      if (anyWin?.electronAPI?.loadKodeAnggaran) {
        const loaded = await anyWin.electronAPI.loadKodeAnggaran();
        if (Array.isArray(loaded)) {
          masterItems = loaded;
          setKodeAnggarans(loaded);
        }
      }
      if (!masterItems.length) {
        toast.error('Master Kode Anggaran masih kosong.', {
          description: 'Import atau tambah kode anggaran dulu di Pengaturan.',
        });
        return;
      }
      const nextSubSeksis = buildSubSeksiFromMasterKode(masterItems);
      if (nextSubSeksis.length === 0) {
        toast.error('Tidak ada kode Judul yang bisa dijadikan Sub Seksi.', {
          description: 'Pastikan Master Kode Anggaran memiliki kode Judul dan anaknya.',
        });
        return;
      }
      setSubSeksis(nextSubSeksis);
      if (anyWin?.electronAPI?.saveSubSeksi) {
        const result = await anyWin.electronAPI.saveSubSeksi(nextSubSeksis);
        if (!result?.success) {
          toast.error('Sub Seksi masuk memori, tapi gagal disimpan.', {
            description: result?.error || 'Error tidak diketahui.',
          });
          return;
        }
      }
      useStore.getState().addAuditLog('Sinkron Sub Seksi', 'Master Kode Anggaran', `${nextSubSeksis.length} node`, 'sub-seksi');
      toast.success('Sub Seksi berhasil disinkronkan dari Master Kode Anggaran.', {
        description: `${nextSubSeksis.length} kelompok struktur siap dipakai.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal sinkronisasi Sub Seksi.');
    }
  };

  const handleToggle = useCallback((kode: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(kode)) next.delete(kode);
      else next.add(kode);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subSeksis.filter((s) => {
      if (getJenis(s.kode) !== jenis) return false;
      if (!q) return true;
      return (
        s.nama.toLowerCase().includes(q) ||
        s.kode.toLowerCase().includes(q) ||
        (s.anak || []).some((a) => a.nama.toLowerCase().includes(q) || a.kode.toLowerCase().includes(q))
      );
    });
  }, [subSeksis, jenis, search]);

  const activeNode = useMemo<NodeInfo | null>(() => {
    if (!activeKode) return null;
    for (const ss of subSeksis) {
      if (ss.kode === activeKode) return { nama: ss.nama, kode: ss.kode, anak: ss.anak || [] };
      for (const a of (ss.anak || [])) {
        if (a.kode === activeKode) return { nama: a.nama, kode: a.kode, anak: [], parentKode: ss.kode };
      }
    }
    return null;
  }, [activeKode, subSeksis]);

  const getNodeCodes = useCallback((kode: string): string[] => {
    const ss = subSeksis.find((s) => s.kode === kode);
    if (ss && ss.anak && ss.anak.length > 0) return ss.anak.map((a) => a.kode);
    return [kode];
  }, [subSeksis]);

  const activeCodes = useMemo(() => activeKode ? getNodeCodes(activeKode) : [], [activeKode, getNodeCodes]);

  const rowsTahun = useMemo(() => {
    if (!activeKode || activeCodes.length === 0) return [];
    return doorscrieftTransaksis
      .filter((r) => {
        const date = new Date(r.tanggal);
        if (Number.isNaN(date.getTime()) || date.getFullYear() !== tahunAktif) return false;
        if (filterBulan !== 'all' && date.getMonth() + 1 !== filterBulan) return false;
        if (jenis === 'pendapatan' && Number(r.penerimaan || 0) <= 0) return false;
        if (jenis === 'pengeluaran' && Number(r.pengeluaran || 0) <= 0) return false;
        return activeCodes.some((k) => String(r.kodeAnggaran || '').startsWith(k));
      })
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  }, [doorscrieftTransaksis, tahunAktif, activeKode, activeCodes, filterBulan, jenis]);

  const statsMap = useMemo(() => {
    const stats: Record<string, { tr: number; tk: number; count: number }> = {};
    const calcForCodes = (codes: string[]) => {
      const rows = doorscrieftTransaksis.filter((r) => {
        const date = new Date(r.tanggal);
        if (Number.isNaN(date.getTime()) || date.getFullYear() !== tahunAktif) return false;
        return codes.some((code) => String(r.kodeAnggaran || '').startsWith(code));
      });
      return {
        tr: rows.reduce((s, r) => s + Number(r.penerimaan || 0), 0),
        tk: rows.reduce((s, r) => s + Number(r.pengeluaran || 0), 0),
        count: rows.length,
      };
    };

    subSeksis.forEach((ss) => {
      const anak = ss.anak || [];
      stats[ss.kode] = calcForCodes(anak.length > 0 ? anak.map((a) => a.kode) : [ss.kode]);
      anak.forEach((a) => {
        stats[a.kode] = calcForCodes([a.kode]);
      });
    });
    return stats;
  }, [subSeksis, doorscrieftTransaksis, tahunAktif]);

  const summary = useMemo(() => {
    const visibleCodes = new Set<string>();
    filtered.forEach((ss) => {
      visibleCodes.add(ss.kode);
      (ss.anak || []).forEach((a) => visibleCodes.add(a.kode));
    });
    let tr = 0;
    let tk = 0;
    let count = 0;
    filtered.forEach((ss) => {
      const st = statsMap[ss.kode];
      tr += st?.tr || 0;
      tk += st?.tk || 0;
      count += st?.count || 0;
    });
    return { tr, tk, count, nodeCount: visibleCodes.size };
  }, [filtered, statsMap]);

  const grand = useMemo(() => ({
    tr: rowsTahun.reduce((s, r) => s + Number(r.penerimaan || 0), 0),
    tk: rowsTahun.reduce((s, r) => s + Number(r.pengeluaran || 0), 0),
  }), [rowsTahun]);

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin input data.');
      return;
    }
    if (!formMaster.nama.trim() || !formMaster.kode.trim()) {
      toast.error('Nama dan kode Sub Seksi wajib diisi.');
      return;
    }

    if (editingId) {
      updateSubSeksi(editingId, { nama: formMaster.nama.trim(), kode: formMaster.kode.trim() });
      toast.success('Sub Seksi diperbarui.');
    } else {
      addSubSeksi({ nama: formMaster.nama.trim(), kode: formMaster.kode.trim() });
      toast.success('Sub Seksi ditambahkan.');
    }
    setIsOpen(false);
    setEditingId(null);
    setFormMaster({ nama: '', kode: '' });
  };

  const handleExportExcel = async () => {
    const anyWin = window as unknown as {
      electronAPI?: {
        exportSubSeksiExcel?: (config: unknown) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }>;
      };
    };

    if (!anyWin?.electronAPI?.exportSubSeksiExcel) {
      toast.error('Export Excel SUB SEKSI hanya tersedia di aplikasi desktop.');
      return;
    }

    try {
      const result = await anyWin.electronAPI.exportSubSeksiExcel({
        tahun: tahunAktif,
        doorscrieftTransaksis,
      });

      if (result?.success) {
        toast.success('Export Sub Seksi berhasil.', { description: result.path });
      } else if (!result?.canceled) {
        toast.error('Gagal export Sub Seksi.', { description: result?.error || 'Unknown error' });
      }
    } catch (error) {
      toast.error('Gagal export Sub Seksi.', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300'>
            <Layers3 className='h-4 w-4' />
            Struktur Sub Seksi
          </div>
          <h1 className='mt-1 text-2xl font-bold text-slate-900 dark:text-white'>Sub Seksi</h1>
          <p className='text-slate-500 dark:text-slate-400'>Pantau transaksi berdasarkan kelompok Sub Seksi Tahun {tahunAktif}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <ReportPrintButton title={`Sub_Seksi_${jenis}_${tahunAktif}`} />
          <Button variant='outline' disabled={!canInput} onClick={handleSyncFromMasterKode}>
            <Layers3 className='mr-2 h-4 w-4' /> Sinkron Master
          </Button>
          <Button variant='outline' onClick={handleExportExcel}>
            <Download className='mr-2 h-4 w-4' /> Export Excel
          </Button>
          <Button disabled={!canInput} onClick={() => { setFormMaster({ nama: '', kode: '' }); setEditingId(null); setIsOpen(true); }}>
            <Plus className='mr-2 h-4 w-4' /> Tambah
          </Button>
        </div>
      </div>

      <ReportPrintDocument
        title='SUB SEKSI'
        subtitle={`${jenis === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'} - Tahun Anggaran ${tahunAktif}`}
        meta={[
          { label: 'Jenis', value: jenis === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran' },
          { label: 'Tahun', value: tahunAktif },
          { label: 'Transaksi', value: summary.count },
          { label: 'Node Struktur', value: summary.nodeCount },
        ]}
      >
        <table>
          <thead>
            <tr>
              <th className='text-center'>No</th>
              <th>Kode</th>
              <th>Nama Sub Seksi</th>
              <th className='text-center'>Transaksi</th>
              <th className='text-right'>Penerimaan</th>
              <th className='text-right'>Pengeluaran</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className='text-center'>Tidak ada data Sub Seksi.</td></tr>
            ) : filtered.map((item, index) => {
              const st = statsMap[item.kode] || { tr: 0, tk: 0, count: 0 };
              return (
                <tr key={item.kode}>
                  <td className='text-center'>{index + 1}</td>
                  <td>{item.kode}</td>
                  <td>{item.nama}</td>
                  <td className='text-center'>{st.count}</td>
                  <td className='text-right'>{formatCurrency(st.tr)}</td>
                  <td className='text-right'>{formatCurrency(st.tk)}</td>
                </tr>
              );
            })}
            <tr className='font-bold'>
              <td colSpan={4}>TOTAL</td>
              <td className='text-right'>{formatCurrency(summary.tr)}</td>
              <td className='text-right'>{formatCurrency(summary.tk)}</td>
            </tr>
          </tbody>
        </table>
      </ReportPrintDocument>

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Total Penerimaan</p>
            <p className='mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(summary.tr)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Total Pengeluaran</p>
            <p className='mt-2 text-xl font-bold text-rose-700 dark:text-rose-300'>{formatCurrency(summary.tk)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Transaksi</p>
            <p className='mt-2 text-xl font-bold text-slate-900 dark:text-white'>{summary.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='p-4'>
            <p className='text-sm text-slate-500 dark:text-slate-400'>Node Struktur</p>
            <p className='mt-2 text-xl font-bold text-slate-900 dark:text-white'>{summary.nodeCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className='grid min-h-0 gap-4 xl:grid-cols-[440px_minmax(0,1fr)]'>
        <Card className='flex max-h-[calc(100vh-13rem)] min-h-[620px] flex-col overflow-hidden'>
          <CardHeader>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <CardTitle className='text-base'>Daftar Sub Seksi</CardTitle>
                <p className='text-sm text-slate-500 dark:text-slate-400'>{filtered.length} kelompok ditampilkan</p>
              </div>
              <div className='flex gap-1'>
                {(['pendapatan', 'pengeluaran'] as const).map((j) => (
                  <Button
                    key={j}
                    size='sm'
                    variant={jenis === j ? 'default' : 'outline'}
                    onClick={() => { setJenis(j); setActiveKode(null); }}
                  >
                    {j === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'}
                  </Button>
                ))}
              </div>
            </div>
            <div className='relative mt-3'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
              <Input className='pl-10' placeholder='Cari nama, kode, atau anak Sub Seksi...' value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className='min-h-0 flex-1 overflow-y-auto pr-2'>
            {filtered.length === 0 ? (
              <div className='flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500 dark:text-slate-400'>
                <FileText className='h-8 w-8' />
                <p>{subSeksis.length === 0 ? 'Belum ada data Sub Seksi.' : 'Tidak ditemukan.'}</p>
              </div>
            ) : (
              <div className='space-y-2'>
                {filtered.map((ss) => {
                  const isExpanded = expandedSet.has(ss.kode);
                  const anak = ss.anak || [];
                  const st = statsMap[ss.kode];
                  const isActive = activeKode === ss.kode;
                  return (
                    <div key={ss.kode} className='rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'>
                      <button
                        className={`w-full px-3 py-3 text-left transition ${isActive ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                        onClick={() => {
                          if (anak.length > 0) handleToggle(ss.kode);
                          setActiveKode(isActive ? null : ss.kode);
                        }}
                      >
                        <div className='flex items-start justify-between gap-3'>
                          <div className='flex min-w-0 gap-2'>
                            {anak.length > 0 ? (
                              isExpanded ? <ChevronDown className='mt-1 h-4 w-4 shrink-0 text-sky-500' /> : <ChevronRight className='mt-1 h-4 w-4 shrink-0 text-slate-400' />
                            ) : (
                              <span className='w-4 shrink-0' />
                            )}
                            <div className='min-w-0'>
                              <p className='truncate text-sm font-semibold text-slate-800 dark:text-slate-100'>{ss.nama}</p>
                              <p className='font-mono text-xs text-slate-500 dark:text-slate-400'>{ss.kode}</p>
                            </div>
                          </div>
                          <div className='shrink-0 text-right text-xs'>
                            <p className={jenis === 'pendapatan' ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'font-bold text-rose-700 dark:text-rose-300'}>
                              {formatCurrency(jenis === 'pendapatan' ? st?.tr || 0 : st?.tk || 0)}
                            </p>
                            <p className='text-slate-500 dark:text-slate-400'>{st?.count || 0} trx</p>
                          </div>
                        </div>
                      </button>

                      {isExpanded && anak.length > 0 && (
                        <div className='space-y-1 border-t border-slate-100 p-2 dark:border-slate-700'>
                          {anak.map((a) => {
                            const ast = statsMap[a.kode];
                            const active = activeKode === a.kode;
                            return (
                              <button
                                key={a.kode}
                                className={`w-full rounded px-3 py-2 text-left transition ${active ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                                onClick={() => setActiveKode(active ? null : a.kode)}
                              >
                                <div className='flex items-start justify-between gap-3'>
                                  <div className='min-w-0'>
                                    <p className='truncate text-sm font-medium text-slate-700 dark:text-slate-200'>{a.nama}</p>
                                    <p className='font-mono text-xs text-slate-400 dark:text-slate-500'>{a.kode}</p>
                                  </div>
                                  <div className='shrink-0 text-right text-xs'>
                                    <p className={jenis === 'pendapatan' ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'font-bold text-rose-700 dark:text-rose-300'}>
                                      {formatCurrency(jenis === 'pendapatan' ? ast?.tr || 0 : ast?.tk || 0)}
                                    </p>
                                    <p className='text-slate-500 dark:text-slate-400'>{ast?.count || 0} trx</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className='flex max-h-[calc(100vh-13rem)] min-h-[620px] flex-col overflow-hidden'>
          <CardHeader>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
              <div>
                <CardTitle className='text-base'>{activeNode ? activeNode.nama : 'Detail Sub Seksi'}</CardTitle>
                <p className='mt-1 font-mono text-sm text-slate-500 dark:text-slate-400'>{activeNode ? activeNode.kode : 'Pilih Sub Seksi di panel kiri.'}</p>
              </div>
              {activeNode && <Button variant='ghost' size='sm' onClick={() => setActiveKode(null)}>Tutup</Button>}
            </div>
            <div className='flex flex-wrap gap-2 pt-2'>
              <select
                className='h-8 rounded-md border border-input bg-white px-3 text-sm dark:bg-slate-800 dark:text-white'
                value={filterBulan}
                disabled={!activeNode}
                onChange={(e) => setFilterBulan(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value='all'>Semua Bulan</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{getMonthName(m)}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className='flex min-h-0 flex-1 flex-col'>
            {!activeNode ? (
              <div className='flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500 dark:text-slate-400'>
                <Layers3 className='h-8 w-8' />
                <p>Pilih Sub Seksi atau anak Sub Seksi untuk melihat transaksi.</p>
              </div>
            ) : (
              <>
                <div className='mb-4 grid gap-3 md:grid-cols-3'>
                  <div className='rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700/50'>
                    <div className='flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400'>
                      <ArrowUpCircle className='h-3.5 w-3.5' /> Penerimaan
                    </div>
                    <div className='mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-300'>{formatCurrency(grand.tr)}</div>
                  </div>
                  <div className='rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700/50'>
                    <div className='flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400'>
                      <ArrowDownCircle className='h-3.5 w-3.5' /> Pengeluaran
                    </div>
                    <div className='mt-1 text-lg font-bold text-rose-700 dark:text-rose-300'>{formatCurrency(grand.tk)}</div>
                  </div>
                  <div className='rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700/50'>
                    <div className='text-xs text-slate-500 dark:text-slate-400'>Transaksi</div>
                    <div className='mt-1 text-lg font-bold text-slate-900 dark:text-white'>{rowsTahun.length}</div>
                  </div>
                </div>

                {rowsTahun.length === 0 ? (
                  <div className='flex flex-1 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400'>
                    Tidak ada data untuk filter ini.
                  </div>
                ) : (
                  <div className='min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 dark:border-slate-700'>
                    <table className='w-full min-w-[900px] text-sm'>
                      <thead className='bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400'>
                        <tr>
                          <th className='px-4 py-3'>No</th>
                          <th className='px-4 py-3'>Tanggal</th>
                          <th className='px-4 py-3'>Uraian</th>
                          <th className='px-4 py-3'>Kode</th>
                          <th className='px-4 py-3'>Mata Anggaran</th>
                          <th className='px-4 py-3 text-right'>Penerimaan</th>
                          <th className='px-4 py-3 text-right'>Pengeluaran</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
                        {rowsTahun.map((r) => (
                          <tr key={r.id} className='hover:bg-slate-50 dark:hover:bg-slate-700/50'>
                            <td className='px-4 py-3 font-mono text-xs text-slate-500'>{r.no}</td>
                            <td className='whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-200'>{new Date(r.tanggal).toLocaleDateString('id-ID')}</td>
                            <td className='px-4 py-3 text-slate-700 dark:text-slate-200'>{r.uraian}</td>
                            <td className='px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200'>{r.kodeAnggaran}</td>
                            <td className='px-4 py-3 text-xs text-slate-600 dark:text-slate-300'>{r.mataAnggaran}</td>
                            <td className='px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-300'>
                              {Number(r.penerimaan || 0) > 0 ? formatCurrency(Number(r.penerimaan)) : '-'}
                            </td>
                            <td className='px-4 py-3 text-right font-semibold text-rose-700 dark:text-rose-300'>
                              {Number(r.pengeluaran || 0) > 0 ? formatCurrency(Number(r.pengeluaran)) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Sub Seksi' : 'Tambah Sub Seksi'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <Input label='Nama Sub Seksi' value={formMaster.nama} onChange={(e) => setFormMaster({ ...formMaster, nama: e.target.value })} required />
            <Input label='Kode' value={formMaster.kode} onChange={(e) => setFormMaster({ ...formMaster, kode: e.target.value })} required />
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setIsOpen(false)}>Batal</Button>
              <Button type='submit'>{editingId ? 'Simpan' : 'Tambah'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
