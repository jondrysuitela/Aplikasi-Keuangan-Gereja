import { useMemo, useState, useEffect, useCallback } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, ChevronRight, ChevronDown, Search, Download } from 'lucide-react';
import { formatCurrency, getMonthName } from '@/lib/utils';
import type { SubSeksi } from '@/types';

type SubSeksiLoadApi = {
  electronAPI?: {
    loadSubSeksiDb?: () => Promise<Array<Omit<SubSeksi, 'id'>>>;
    loadSubSeksi?: () => Promise<Array<Omit<SubSeksi, 'id'>>>;
  };
};

export function SubSeksiPage() {
  const { subSeksis, setSubSeksis, doorscrieftTransaksis, tahunAktif, addSubSeksi, updateSubSeksi } = useStore();

  // Load Sub Seksi from database on mount
  useEffect(() => {
    const anyWin = window as unknown as SubSeksiLoadApi;
    if (!anyWin?.electronAPI?.loadSubSeksiDb) return;
    anyWin.electronAPI
      .loadSubSeksiDb()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) setSubSeksis(items);
      })
      .catch(() => {
        if (anyWin?.electronAPI?.loadSubSeksi) {
          anyWin.electronAPI.loadSubSeksi().then((items) => {
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

  // Expanded Sub Seksi
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((kode: string) => {
    setExpandedSet(prev => {
      const next = new Set(prev);
      if (next.has(kode)) next.delete(kode);
      else next.add(kode);
      return next;
    });
  }, []);

  // Filters for detail panel
  const [activeKode, setActiveKode] = useState<string | null>(null);
  const [filterBulan, setFilterBulan] = useState<number | 'all'>('all');
  const [filterJenis, setFilterJenis] = useState<'semua' | 'pendapatan' | 'pengeluaran'>('semua');

  const getJenis = (kode: string): 'pendapatan' | 'pengeluaran' => {
    if (kode.startsWith('II.')) return 'pengeluaran';
    return 'pendapatan';
  };

  const filtered = useMemo(() => subSeksis.filter(
    (s) => getJenis(s.kode) === jenis && (s.nama.toLowerCase().includes(search.toLowerCase()) || s.kode.toLowerCase().includes(search.toLowerCase()))
  ), [subSeksis, jenis, search]);

  // Find active node info (Sub Seksi or anak)
  const activeNode = (() => {
    if (!activeKode) return null;
    for (const ss of filtered) {
      if (ss.kode === activeKode) return { nama: ss.nama, kode: ss.kode, anak: ss.anak || [] };
      for (const a of (ss.anak || [])) {
        if (a.kode === activeKode) return { nama: a.nama, kode: a.kode, anak: [] };
      }
    }
    return null;
  })();

  // Get codes for a node: parent = all anak codes, anak = just its own code
  const getNodeCodes = useCallback((kode: string): string[] => {
    const ss = filtered.find(s => s.kode === kode);
    if (ss && ss.anak && ss.anak.length > 0) {
      return ss.anak.map(a => a.kode);
    }
    return [kode];
  }, [filtered]);

  // Detail panel transactions
  const activeCodes = useMemo(() => activeKode ? getNodeCodes(activeKode) : [], [activeKode, getNodeCodes]);

  // Transactions per anak node (for individual anak rows in expanded section)
  const anakRowsMap = useMemo(() => {
    const map: Record<string, { tr: number; tk: number; count: number; rows: typeof doorscrieftTransaksis }> = {};
    for (const ss of filtered) {
      for (const a of (ss.anak || [])) {
        const rows = doorscrieftTransaksis.filter((r) => {
          if (new Date(r.tanggal).getFullYear() !== tahunAktif) return false;
          if (jenis === 'pendapatan' && Number(r.pengeluaran || 0) > 0) return false;
          if (jenis === 'pengeluaran' && Number(r.penerimaan || 0) > 0) return false;
          return String(r.kodeAnggaran || '').startsWith(a.kode);
        });
        map[a.kode] = {
          tr: rows.reduce((s, r) => s + Number(r.penerimaan || 0), 0),
          tk: rows.reduce((s, r) => s + Number(r.pengeluaran || 0), 0),
          count: rows.length,
          rows,
        };
      }
    }
    return map;
  }, [filtered, doorscrieftTransaksis, tahunAktif, jenis]);

  const rowsTahun = useMemo(() => {
    if (!activeKode || activeCodes.length === 0) return [];
    return doorscrieftTransaksis.filter((r) => {
      if (new Date(r.tanggal).getFullYear() !== tahunAktif) return false;
      if (filterBulan !== 'all' && new Date(r.tanggal).getMonth() + 1 !== filterBulan) return false;
      if (filterJenis !== 'semua') {
        const p = Number(r.penerimaan || 0);
        const q = Number(r.pengeluaran || 0);
        if (p !== 0 && filterJenis !== 'pendapatan') return false;
        if (q !== 0 && filterJenis !== 'pengeluaran') return false;
      }
      return activeCodes.some((k) => String(r.kodeAnggaran || '').startsWith(k));
    });
  }, [doorscrieftTransaksis, tahunAktif, activeKode, activeCodes, filterBulan, filterJenis]);

  const grand = useMemo(() => ({
    tr: rowsTahun.reduce((s, r) => s + Number(r.penerimaan || 0), 0),
    tk: rowsTahun.reduce((s, r) => s + Number(r.pengeluaran || 0), 0),
  }), [rowsTahun]);

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (editingId) updateSubSeksi(editingId, formMaster);
    else addSubSeksi(formMaster);
    setIsOpen(false); setEditingId(null); setFormMaster({ nama: '', kode: '' });
  };

  const handleExportExcel = async () => {
    const anyWin = window as unknown as {
      electronAPI?: {
        exportSubSeksiExcel?: (config: unknown) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }>;
      };
    };

    if (!anyWin?.electronAPI?.exportSubSeksiExcel) {
      alert('Export Excel SUB SEKSI hanya tersedia di aplikasi desktop.');
      return;
    }

    try {
      const result = await anyWin.electronAPI.exportSubSeksiExcel({
        tahun: tahunAktif,
        doorscrieftTransaksis,
      });

      if (result?.success) {
        alert(`Berhasil export ke:\n${result.path}`);
      } else if (!result?.canceled) {
        alert(`Gagal export: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Gagal export: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Stats per Sub Seksi (sum of anak) and per anak
  const statsMap = useMemo(() => {
    const stats: Record<string, { tr: number; tk: number; count: number }> = {};
    filtered.forEach(ss => {
      const anak = ss.anak || [];
      if (anak.length > 0) {
        // Parent stats = sum of all anak
        const sum = anak.reduce((acc, a) => {
          const ar = anakRowsMap[a.kode];
          return {
            tr: acc.tr + (ar ? ar.tr : 0),
            tk: acc.tk + (ar ? ar.tk : 0),
            count: acc.count + (ar ? ar.count : 0),
          };
        }, { tr: 0, tk: 0, count: 0 });
        stats[ss.kode] = sum;
      } else {
        // No anak, calculate from direct transactions
        const rows = doorscrieftTransaksis.filter((r) => {
          if (new Date(r.tanggal).getFullYear() !== tahunAktif) return false;
          return String(r.kodeAnggaran || '').startsWith(ss.kode);
        });
        stats[ss.kode] = {
          tr: rows.reduce((s, r) => s + Number(r.penerimaan || 0), 0),
          tk: rows.reduce((s, r) => s + Number(r.pengeluaran || 0), 0),
          count: rows.length,
        };
      }
      // Anak stats
      anak.forEach(a => {
        const ar = anakRowsMap[a.kode];
        stats[a.kode] = ar ? { tr: ar.tr, tk: ar.tk, count: ar.count } : { tr: 0, tk: 0, count: 0 };
      });
    });
    return stats;
  }, [filtered, anakRowsMap, doorscrieftTransaksis, tahunAktif]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sub Seksi</h1>
          <p className="text-slate-500 dark:text-slate-400">Klik untuk expand anak Sub Seksi</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" onClick={() => { setFormMaster({ nama: '', kode: '' }); setEditingId(null); setIsOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Tambah
          </Button>
        </div>
      </div>

      {/* Sub Seksi list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sub Seksi</CardTitle>
            <span className="text-sm text-slate-500">{filtered.length} item</span>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 items-center">
            <div className="flex gap-1">
              {(['pendapatan', 'pengeluaran'] as const).map((j) => (
                <Button
                  key={j}
                  size="sm"
                  variant={jenis === j ? 'default' : 'outline'}
                  onClick={() => { setJenis(j); setActiveKode(null); }}
                >
                  {j === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input className="pl-10" placeholder="Cari nama atau kode..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-center text-slate-500 dark:text-slate-400 py-12">
              {subSeksis.length === 0 ? 'Belum ada data. Tambah Sub Seksi manual untuk memulai.' : 'Tidak ditemukan.'}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((ss) => {
                const isExpanded = expandedSet.has(ss.kode);
                const anak = ss.anak || [];
                const st = statsMap[ss.kode];
                const isActive = activeKode === ss.kode;
                return (
                  <div key={ss.kode}>
                    {/* Sub Seksi parent */}
                    <button
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-md text-left transition-colors ${
                        isActive ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800' : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                      onClick={() => {
                        if (anak.length > 0) handleToggle(ss.kode);
                        setActiveKode(isActive ? null : ss.kode);
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {anak.length > 0 ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-blue-500 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                          )
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{ss.nama}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{ss.kode}</p>
                        </div>
                      </div>
                      {st && st.count > 0 && (
                        <div className="flex gap-2 items-center shrink-0 ml-2">
                          {jenis === 'pendapatan' ? (
                            <span className="text-green-600 dark:text-green-400 font-bold text-sm">{formatCurrency(st.tr)}</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400 font-bold text-sm">{formatCurrency(st.tk)}</span>
                          )}
                          <span className="text-slate-500 dark:text-slate-400 text-xs">{st.count} trx</span>
                        </div>
                      )}
                    </button>

                    {/* Children with transaction tables */}
                    {isExpanded && anak.length > 0 && (
                      <div className="ml-8 pl-4 border-l-2 border-blue-200 dark:border-slate-600 space-y-2 mt-1 mb-2">
                        {anak.map((a) => {
                          const ast = statsMap[a.kode];
                          const aActive = activeKode === a.kode;
                          const aRows = anakRowsMap[a.kode]?.rows || [];
                          const filteredARows = aRows.filter((r) => {
                            if (filterBulan !== 'all' && new Date(r.tanggal).getMonth() + 1 !== filterBulan) return false;
                            if (filterJenis !== 'semua') {
                              const p = Number(r.penerimaan || 0);
                              const q = Number(r.pengeluaran || 0);
                              if (p !== 0 && filterJenis !== 'pendapatan') return false;
                              if (q !== 0 && filterJenis !== 'pengeluaran') return false;
                            }
                            return true;
                          });
                          const aSum = filteredARows.reduce((acc, r) => ({
                            tr: acc.tr + Number(r.penerimaan || 0),
                            tk: acc.tk + Number(r.pengeluaran || 0),
                          }), { tr: 0, tk: 0 });
                          return (
                            <div key={a.kode} className="rounded-md border dark:border-slate-700 overflow-hidden">
                              {/* Anak header */}
                              <button
                                className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors text-sm ${
                                  aActive ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                                onClick={() => setActiveKode(aActive ? null : a.kode)}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{a.nama}</p>
                                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{a.kode}</p>
                                </div>
                                <div className="flex gap-3 items-center shrink-0 ml-2">
                                  {jenis !== 'pengeluaran' && (
                                    <span className="text-green-600 dark:text-green-400 font-bold text-xs">{formatCurrency(aSum.tr)}</span>
                                  )}
                                  {jenis !== 'pendapatan' && (
                                    <span className="text-red-600 dark:text-red-400 font-bold text-xs">{formatCurrency(aSum.tk)}</span>
                                  )}
                                  <span className="text-slate-500 dark:text-slate-400 text-xs">{ast?.count || 0} trx</span>
                                </div>
                              </button>

                              {/* Anak transaction table */}
                              {filteredARows.length > 0 && (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-left text-[10px] font-medium text-slate-500 uppercase">
                                        <th className="px-3 py-1.5">No</th>
                                        <th className="px-3 py-1.5">Tanggal</th>
                                        <th className="px-3 py-1.5">Uraian</th>
                                        <th className="px-3 py-1.5">Kode</th>
                                        <th className="px-3 py-1.5">Mata Anggaran</th>
                                        {jenis !== 'pengeluaran' && <th className="px-3 py-1.5 text-right">Penerimaan</th>}
                                        {jenis !== 'pendapatan' && <th className="px-3 py-1.5 text-right">Pengeluaran</th>}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filteredARows.map((r) => (
                                        <tr key={r.id} className="border-b dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800">
                                          <td className="px-3 py-1 font-mono">{r.no}</td>
                                          <td className="px-3 py-1 whitespace-nowrap dark:text-slate-200">{new Date(r.tanggal).toLocaleDateString('id-ID')}</td>
                                          <td className="px-3 py-1 dark:text-slate-200">{r.uraian}</td>
                                          <td className="px-3 py-1 font-mono dark:text-slate-200">{r.kodeAnggaran}</td>
                                          <td className="px-3 py-1 dark:text-slate-200">{r.mataAnggaran}</td>
                                          {jenis !== 'pengeluaran' && (
                                            <td className="px-3 py-1 text-right text-green-600 dark:text-green-400">
                                              {Number(r.penerimaan || 0) > 0 ? formatCurrency(Number(r.penerimaan)) : '-'}
                                            </td>
                                          )}
                                          {jenis !== 'pendapatan' && (
                                            <td className="px-3 py-1 text-right text-red-600 dark:text-red-400">
                                              {Number(r.pengeluaran || 0) > 0 ? formatCurrency(Number(r.pengeluaran)) : '-'}
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {filteredARows.length === 0 && (
                                <p className="px-3 py-2 text-center text-slate-400 text-xs">Tidak ada transaksi</p>
                              )}
                            </div>
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

      {/* Detail panel */}
      {activeNode && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-blue-700 dark:text-blue-400">{activeNode.nama}</CardTitle>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{activeNode.kode}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveKode(null)}>Tutup</Button>
            </div>
            <div className="flex flex-wrap gap-3 mt-3 items-center">
              <div className="flex gap-1">
                {(['semua', 'pendapatan', 'pengeluaran'] as const).map((j) => (
                  <Button key={j} size="sm" variant={filterJenis === j ? 'default' : 'outline'} onClick={() => setFilterJenis(j)}>
                    {j === 'semua' ? 'Semua' : j === 'pendapatan' ? 'Penerimaan' : 'Pengeluaran'}
                  </Button>
                ))}
              </div>
              <select
                className="h-8 rounded-md border border-input bg-white dark:bg-slate-800 dark:text-white px-3 text-sm"
                value={filterBulan}
                onChange={(e) => setFilterBulan(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">Semua Bulan</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{getMonthName(m)}</option>
                ))}
              </select>
              <span className="text-sm text-slate-500 dark:text-slate-400">{rowsTahun.length} transaksi</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3 mb-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-md border">
                <div className="text-xs text-slate-500 dark:text-slate-400">Penerimaan</div>
                <div className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(grand.tr)}</div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-md border">
                <div className="text-xs text-slate-500 dark:text-slate-400">Pengeluaran</div>
                <div className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(grand.tk)}</div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-md border">
                <div className="text-xs text-slate-500 dark:text-slate-400">Saldo</div>
                <div className={`text-lg font-bold ${grand.tr - grand.tk >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(grand.tr - grand.tk)}
                </div>
              </div>
            </div>
            {rowsTahun.length === 0 ? (
              <p className="text-center text-slate-500 dark:text-slate-400 py-8">Tidak ada data untuk filter ini</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-700 text-left text-xs font-medium text-slate-500 uppercase">
                      <th className="px-4 py-2">No</th>
                      <th className="px-4 py-2">Tanggal</th>
                      <th className="px-4 py-2">Uraian</th>
                      <th className="px-4 py-2">Kode</th>
                      <th className="px-4 py-2">Mata Anggaran</th>
                      <th className="px-4 py-2 text-right">Penerimaan</th>
                      <th className="px-4 py-2 text-right">Pengeluaran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsTahun.map((r) => (
                      <tr key={r.id} className="border-b dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700">
                        <td className="px-4 py-2 font-mono text-xs dark:text-slate-200">{r.no}</td>
                        <td className="px-4 py-2 whitespace-nowrap dark:text-slate-200">{new Date(r.tanggal).toLocaleDateString('id-ID')}</td>
                        <td className="px-4 py-2 dark:text-slate-200">{r.uraian}</td>
                        <td className="px-4 py-2 font-mono text-xs dark:text-slate-200">{r.kodeAnggaran}</td>
                        <td className="px-4 py-2 text-xs dark:text-slate-200">{r.mataAnggaran}</td>
                        <td className="px-4 py-2 text-right text-green-600 dark:text-green-400 font-medium">
                          {Number(r.penerimaan || 0) > 0 ? formatCurrency(Number(r.penerimaan)) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right text-red-600 dark:text-red-400 font-medium">
                          {Number(r.pengeluaran || 0) > 0 ? formatCurrency(Number(r.pengeluaran)) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Sub Seksi' : 'Tambah Sub Seksi'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Nama Sub Seksi" value={formMaster.nama} onChange={(e) => setFormMaster({ ...formMaster, nama: e.target.value })} required />
            <Input label="Kode" value={formMaster.kode} onChange={(e) => setFormMaster({ ...formMaster, kode: e.target.value })} required />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Batal</Button>
              <Button type="submit">{editingId ? 'Simpan' : 'Tambah'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
