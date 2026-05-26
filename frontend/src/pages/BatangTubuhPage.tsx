import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ChevronRight, ChevronDown, Pencil, Check, X, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { BatangTubuhItem } from '@/types';

export function BatangTubuhPage() {
  const { batangTubuhs, setBatangTubuhs, doorscrieftTransaksis, tahunAktif } = useStore();
  const [search, setSearch] = useState('');
  const [jenis, setJenis] = useState<'pendapatan' | 'pengeluaran'>('pendapatan');
  const [expandedKode, setExpandedKode] = useState<string | null>(null);
  const [showDianggarkan, setShowDianggarkan] = useState(true);
  const [showRealisasi, setShowRealisasi] = useState(true);

  // Load Batang Tubuh from database on mount
  useEffect(() => {
    const anyWin = window as unknown as { electronAPI?: { loadBatangTubuh?: () => Promise<any[]> } };
    if (!anyWin?.electronAPI?.loadBatangTubuh) return;
    anyWin.electronAPI.loadBatangTubuh()
      .then((items: any[]) => {
        if (Array.isArray(items) && items.length > 0) {
          setBatangTubuhs(items);
        }
      })
      .catch(() => {});
  }, [setBatangTubuhs]);

  // Edit state
  const [editingKode, setEditingKode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingKode && editInputRef.current) editInputRef.current.focus();
  }, [editingKode]);

  const handleSaveDianggarkan = async (kode: string) => {
    const val = Number(editValue) || 0;
    const updated = batangTubuhs.map((bt) => ({
      ...bt,
      detailRows: bt.detailRows.map((dr) =>
        dr.kode === kode ? { ...dr, dianggarkan: val } : dr
      ),
    }));
    setBatangTubuhs(updated);
    const anyWin = window as unknown as { electronAPI?: { saveBatangTubuh?: (items: BatangTubuhItem[]) => Promise<{ success: boolean }> } };
    if (anyWin?.electronAPI?.saveBatangTubuh) {
      await anyWin.electronAPI.saveBatangTubuh(updated);
    }
    setEditingKode(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingKode(null);
    setEditValue('');
  };

  const handleExport = async () => {
    const anyWin = window as unknown as { electronAPI?: { exportBatangTubuh?: (config: Record<string, unknown>) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }> } };
    if (!anyWin?.electronAPI?.exportBatangTubuh) {
      alert('Export Excel tidak tersedia. Pastikan aplikasi berjalan di desktop Electron.');
      return;
    }
    const result = await anyWin.electronAPI.exportBatangTubuh({
      namaGereja: 'GEREJA PROTESTAN MALUKU',
      klas: 'KLASIS PULAU AMBON TIMUR',
      jemaat: 'JEMAAT SULI',
      tahun: String(tahunAktif),
      doorscrieftTransaksis,
    });
    if (result?.success && result.path) {
      alert('Export berhasil!\nFile disimpan di: ' + result.path);
    } else if (!result?.canceled) {
      alert('Export gagal: ' + (result?.error || 'Error tidak diketahui'));
    }
  };

  const filtered = batangTubuhs.filter(
    (bt) => {
      const isPendapatan = !bt.kode.startsWith('II.');
      if (jenis === 'pendapatan' && !isPendapatan) return false;
      if (jenis === 'pengeluaran' && isPendapatan) return false;
      if (search) {
        const q = search.toLowerCase();
        return bt.nama.toLowerCase().includes(q) || bt.kode.toLowerCase().includes(q) || bt.subSeksiNama.toLowerCase().includes(q) ||
          bt.detailRows.some((r) => r.kode.toLowerCase().includes(q) || r.nama.toLowerCase().includes(q));
      }
      return true;
    }
  );

  // Hitung realisasi per detail row dari doorscrieftTransaksis (DOORSCRIEFT)
  const hitungRealisasi = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((bt) => {
      bt.detailRows.forEach((dr) => {
        const rows = doorscrieftTransaksis.filter((r) => {
          if (new Date(r.tanggal).getFullYear() !== tahunAktif) return false;
          return String(r.kodeAnggaran || '') === dr.kode;
        });
        map[dr.kode] = rows.reduce((s, r) => s + Number(r.penerimaan || 0) + Number(r.pengeluaran || 0), 0);
      });
    });
    return map;
  }, [filtered, doorscrieftTransaksis, tahunAktif]);

  // Grand totals — dianggarkan dari JSON, realisasi dari Doorscrieft
  const grandTotal = useMemo(() => {
    let dianggarkan = 0, realisasi = 0;
    filtered.forEach((bt) => {
      dianggarkan += bt.detailRows.reduce((s, d) => s + (Number(d.dianggarkan) || 0), 0);
      bt.detailRows.forEach((d) => { realisasi += Number(hitungRealisasi[d.kode] || 0); });
    });
    return { dianggarkan, realisasi, selisih: dianggarkan - realisasi };
  }, [filtered, hitungRealisasi]);

  // Per-Batang Tubuh totals
  const btTotals = useMemo(() => {
    const map: Record<string, { dianggarkan: number; realisasi: number; selisih: number }> = {};
    filtered.forEach((bt) => {
      const dianggarkan = bt.detailRows.reduce((s, d) => s + (Number(d.dianggarkan) || 0), 0);
      let realisasi = 0;
      bt.detailRows.forEach((d) => { realisasi += Number(hitungRealisasi[d.kode] || 0); });
      map[bt.kode] = { dianggarkan, realisasi, selisih: dianggarkan - realisasi };
    });
    return map;
  }, [filtered, hitungRealisasi]);

  if (batangTubuhs.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Batang Tubuh</h1>
          <p className="text-slate-500 dark:text-slate-400">Ringkasan data Batang Tubuh dari semua Sub Seksi</p>
        </div>
        <Card>
          <CardContent>
            <p className="text-center text-slate-500 dark:text-slate-400 py-12">Memuat data Batang Tubuh...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Batang Tubuh</h1>
          <p className="text-slate-500 dark:text-slate-400">Ringkasan data Batang Tubuh dari semua Sub Seksi</p>
        </div>
        <Button onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" /> Export Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-1">
              {(['pendapatan', 'pengeluaran'] as const).map((j) => (
                <Button
                  key={j}
                  size="sm"
                  variant={jenis === j ? 'default' : 'outline'}
                  onClick={() => setJenis(j)}
                >
                  {j === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'}
                </Button>
              ))}
            </div>
            <div className="flex gap-1 border-l border-slate-300 dark:border-slate-600 pl-3 items-center">
              <Button
                size="sm"
                variant={showDianggarkan ? 'default' : 'outline'}
                className={showDianggarkan ? 'bg-blue-600 hover:bg-blue-700' : 'text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-600'}
                onClick={() => setShowDianggarkan(!showDianggarkan)}
              >
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                Dianggarkan
              </Button>
              <Button
                size="sm"
                variant={showRealisasi ? 'default' : 'outline'}
                className={showRealisasi ? 'bg-green-600 hover:bg-green-700' : 'text-green-600 border-green-300 dark:text-green-400 dark:border-green-600'}
                onClick={() => setShowRealisasi(!showRealisasi)}
              >
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                Realisasi
              </Button>
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input className="pl-10" placeholder="Cari kode, nama, atau Sub Seksi..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Grand total */}
          <div className="grid gap-3 md:grid-cols-3 mb-4">
            {showDianggarkan && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-md border border-blue-200 dark:border-blue-800">
                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Dianggarkan</div>
                <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatCurrency(grandTotal.dianggarkan)}</div>
              </div>
            )}
            {showRealisasi && (
              <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-md border border-green-200 dark:border-green-800">
                <div className="text-xs text-green-600 dark:text-green-400 font-medium">Total Realisasi</div>
                <div className="text-lg font-bold text-green-700 dark:text-green-300">{formatCurrency(grandTotal.realisasi)}</div>
              </div>
            )}
            <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-md border">
              <div className="text-xs text-slate-500 dark:text-slate-400">Lebih / Kurang</div>
              <div className={`text-lg font-bold ${grandTotal.selisih >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(grandTotal.selisih)}
              </div>
            </div>
          </div>

          {/* Table with expandable Batang Tubuh rows */}
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-left text-xs font-medium text-slate-500 uppercase sticky top-0 z-10">
                  <th className="sticky top-0 z-10 px-4 py-2 w-8 bg-slate-50 dark:bg-slate-700"></th>
                  <th className="sticky top-0 z-10 px-4 py-2 bg-slate-50 dark:bg-slate-700">Kode Anggaran</th>
                  <th className="sticky top-0 z-10 px-4 py-2 bg-slate-50 dark:bg-slate-700">Mata Anggaran</th>
                  {showDianggarkan && <th className="sticky top-0 z-10 px-4 py-2 text-right text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 border-l border-blue-200 dark:border-blue-800">DIANGGARKAN</th>}
                  {showRealisasi && <th className="sticky top-0 z-10 px-4 py-2 text-right text-xs font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 border-l border-green-200 dark:border-green-800">REALISASI</th>}
                  {(showDianggarkan && showRealisasi) && <th className="sticky top-0 z-10 px-4 py-2 text-right text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700">LEBIH / KURANG</th>}
                  <th className="sticky top-0 z-10 px-4 py-2 w-12 bg-slate-50 dark:bg-slate-700"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((bt) => {
                  const isExpanded = expandedKode === bt.kode;
                  const t = btTotals[bt.kode];
                  return (
                    <React.Fragment key={bt.kode}>
                      {/* Parent row - Batang Tubuh header */}
                      <tr
                        key={bt.kode}
                        className="border-b dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                        onClick={() => setExpandedKode(isExpanded ? null : bt.kode)}
                      >
                        <td className="px-4 py-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{bt.kode}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{bt.nama}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">({bt.subSeksiNama})</span>
                        </td>
                        {showDianggarkan && (
                          <td className="px-4 py-2 text-right font-mono font-semibold text-blue-700 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-900/20 border-l border-blue-100 dark:border-blue-900">
                            {t.dianggarkan > 0 ? formatCurrency(t.dianggarkan) : '—'}
                          </td>
                        )}
                        {showRealisasi && (
                          <td className="px-4 py-2 text-right font-mono font-semibold text-green-700 dark:text-green-300 bg-green-50/80 dark:bg-green-900/20 border-l border-green-100 dark:border-green-900">
                            {t.realisasi > 0 ? formatCurrency(t.realisasi) : '—'}
                          </td>
                        )}
                        {showDianggarkan && showRealisasi && (
                          <td className={`px-4 py-2 text-right font-mono font-bold ${t.selisih >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                            {t.selisih !== 0 ? formatCurrency(t.selisih) : '—'}
                          </td>
                        )}
                        <td className="sticky right-0 z-10 px-4 py-2 bg-slate-50/50 dark:bg-slate-800/30"></td>
                      </tr>
                      {/* Child rows - detailRows */}
                      {isExpanded && bt.detailRows.map((dr) => {
                        const drRealisasi = Number(hitungRealisasi[dr.kode] || 0);
                        const drSelisih = (Number(dr.dianggarkan) || 0) - drRealisasi;
                        const isEditing = editingKode === dr.kode;
                        return (
                          <tr key={dr.kode} className="border-b border-slate-200 dark:border-slate-700/40 last:border-0 bg-slate-50/50 dark:bg-slate-800/30">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 pl-8 font-mono text-xs dark:text-slate-200">{dr.kode}</td>
                            <td className="px-4 py-2 text-sm dark:text-slate-200">{dr.nama}</td>
                            {showDianggarkan && (
                              <td className="px-4 py-2 text-right font-mono text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-900/20 border-l border-blue-100 dark:border-blue-900">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Input
                                      ref={editInputRef}
                                      type="number"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveDianggarkan(dr.kode);
                                        if (e.key === 'Escape') handleCancelEdit();
                                      }}
                                      className="h-7 w-32 text-right"
                                    />
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleSaveDianggarkan(dr.kode)}>
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCancelEdit}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="inline-block">{dr.dianggarkan > 0 ? formatCurrency(dr.dianggarkan) : '—'}</span>
                                )}
                              </td>
                            )}
                            {showRealisasi && (
                              <td className="px-4 py-2 text-right font-mono text-green-600 dark:text-green-400 bg-green-50/80 dark:bg-green-900/20 border-l border-green-100 dark:border-green-900">
                                {drRealisasi > 0 ? formatCurrency(drRealisasi) : '—'}
                              </td>
                            )}
                            {showDianggarkan && showRealisasi && (
                              <td className={`px-4 py-2 text-right font-mono ${drSelisih >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {drSelisih !== 0 ? formatCurrency(drSelisih) : '—'}
                              </td>
                            )}
                            <td className="sticky right-0 z-10 px-4 py-2 text-center bg-slate-50/50 dark:bg-slate-800/30">
                              {!isEditing && showDianggarkan && (
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingKode(dr.kode); setEditValue(String(dr.dianggarkan)); }}>
                                  <Pencil className="h-3 w-3 text-slate-400" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
