import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Calculator, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Download, Pencil, Plus, Search, Target, Trash2, WalletCards, X } from 'lucide-react';
import { applyBatangTubuhAnggaranForYear, useStore } from '@/stores';
import { generateId, formatCurrency } from '@/lib/utils';
import { can } from '@/lib/permissions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppStateMessage } from '@/components/AppStateMessage';
import { YearLockedBanner } from '@/components/YearLockedBanner';
import { toast } from 'sonner';
import type { BatangTubuhDetailRow, BatangTubuhItem, BatangTubuhProgram } from '@/types';

type DianggarkanElectronAPI = {
  loadBatangTubuh?: () => Promise<BatangTubuhItem[]>;
  exportDianggarkan?: (config: Record<string, unknown>) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }>;
};

function getElectronAPI() {
  return (window as unknown as { electronAPI?: DianggarkanElectronAPI }).electronAPI;
}

function isPengeluaranKode(kode: string) {
  return kode === 'II' || kode.startsWith('II.');
}

function sumPrograms(programs: BatangTubuhProgram[] = []) {
  return programs.reduce(
    (total, program) => total + (program.rincian || []).reduce((sum, rincian) => sum + Number(rincian.jumlah || 0), 0),
    0,
  );
}

function parseRupiahInput(value: string) {
  return Number(String(value || '').replace(/[^0-9]/g, '')) || 0;
}

function parseRupiahCalculationInput(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (raw.includes('=')) {
    const rightSide = raw.split('=').pop() || '';
    const amount = parseRupiahInput(rightSide);
    if (amount > 0) return amount;
  }
  const numberMatches = Array.from(raw.matchAll(/(?:Rp\.?\s*)?\d[\d.]*/gi));
  const numbers = numberMatches
    .map((match) => ({
      amount: parseRupiahInput(match[0]),
      digitLength: match[0].replace(/[^0-9]/g, '').length,
      index: match.index || 0,
      endIndex: (match.index || 0) + match[0].length,
    }))
    .filter((item) => item.amount > 0);

  if (numbers.length === 0) return 0;
  if (numbers.length > 1 && /[x*+:/-]/i.test(raw)) {
    return numbers.slice(1).reduce((total, item, index) => {
      const previous = numbers[index];
      const operatorText = raw.slice(previous.endIndex, item.index);
      if (operatorText.includes('+')) return total + item.amount;
      if (operatorText.includes('-')) return total - item.amount;
      if (operatorText.includes(':') || operatorText.includes('/')) return item.amount > 0 ? total / item.amount : total;
      return total * item.amount;
    }, numbers[0].amount);
  }
  if (numbers.length > 1 && numbers.some((item) => item.digitLength >= 4)) {
    return numbers.reduce((total, item) => total * item.amount, 1);
  }
  return numbers[0].amount;
}

function shouldCalculateAmountFromDescription(value: string) {
  const raw = String(value || '').trim();
  const numbers = raw.match(/(?:Rp\.?\s*)?\d[\d.]*/gi) || [];
  if (raw.includes('=')) return numbers.length > 0;
  return numbers.length > 1 && (/[x*+:/-]/i.test(raw) || numbers.some((item) => item.replace(/[^0-9]/g, '').length >= 4));
}

function shouldKeepJumlahFormulaDraft(value: string) {
  const raw = String(value || '').trim();
  const numbers = raw.match(/(?:Rp\.?\s*)?\d[\d.]*/gi) || [];
  const textWithoutCurrency = raw.replace(/Rp\.?/gi, '');
  return numbers.length > 1 || /[a-zA-Z*]/.test(textWithoutCurrency);
}

function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = 'auto';
  element.style.height = `${Math.max(40, element.scrollHeight)}px`;
}

function formatRupiahDescriptionInput(value: string) {
  const raw = String(value || '');
  if (!raw.trim()) return '';
  return raw.replace(/(?:Rp\.?\s*)?\d[\d.]*/gi, (match) => {
    const digits = match.replace(/[^0-9]/g, '');
    if (digits.length < 4) return match;
    const amount = Number(digits) || 0;
    return amount > 0 ? formatCurrency(amount) : match;
  });
}

export function DianggarkanPage() {
  const {
    user,
    tahunAktif,
    lockedYears,
    batangTubuhs,
    setBatangTubuhs,
    batangTubuhAnggaranByYear,
    batangTubuhProgramByYear,
    doorscrieftTransaksis,
    setBatangTubuhProgramsForKode,
  } = useStore();
  const canInput = can(user?.role, 'input');
  const isYearLocked = lockedYears.includes(tahunAktif);
  const [jenis, setJenis] = useState<'pendapatan' | 'pengeluaran'>('pendapatan');
  const [search, setSearch] = useState('');
  const [expandedKode, setExpandedKode] = useState<string | null>(null);
  const [expandedProgramKode, setExpandedProgramKode] = useState<string | null>(null);
  const [programDialogRow, setProgramDialogRow] = useState<BatangTubuhDetailRow | null>(null);
  const [programDraft, setProgramDraft] = useState<BatangTubuhProgram[]>([]);
  const [jumlahDraftByRincian, setJumlahDraftByRincian] = useState<Record<string, string>>({});

  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.loadBatangTubuh || batangTubuhs.length > 0) return;
    electronAPI.loadBatangTubuh()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) setBatangTubuhs(items);
      })
      .catch(() => {});
  }, [batangTubuhs.length, setBatangTubuhs]);

  const activeBatangTubuhs = useMemo(
    () => applyBatangTubuhAnggaranForYear(batangTubuhs, batangTubuhAnggaranByYear, tahunAktif, batangTubuhProgramByYear),
    [batangTubuhs, batangTubuhAnggaranByYear, batangTubuhProgramByYear, tahunAktif],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeBatangTubuhs.filter((group) => {
      const isPengeluaran = isPengeluaranKode(group.kode);
      if (jenis === 'pendapatan' && isPengeluaran) return false;
      if (jenis === 'pengeluaran' && !isPengeluaran) return false;
      if (!q) return true;
      return (
        group.kode.toLowerCase().includes(q) ||
        group.nama.toLowerCase().includes(q) ||
        String(group.subSeksiNama || '').toLowerCase().includes(q) ||
        (group.detailRows || []).some((row) => row.kode.toLowerCase().includes(q) || row.nama.toLowerCase().includes(q))
      );
    });
  }, [activeBatangTubuhs, jenis, search]);

  const summary = useMemo(() => {
    let detailRows = 0;
    let filledRows = 0;
    let total = 0;
    activeBatangTubuhs.forEach((group) => {
      const isPengeluaran = isPengeluaranKode(group.kode);
      if (jenis === 'pendapatan' && isPengeluaran) return;
      if (jenis === 'pengeluaran' && !isPengeluaran) return;
      (group.detailRows || []).forEach((row) => {
        detailRows += 1;
        const amount = Number(row.dianggarkan || 0);
        total += amount;
        if (amount > 0) filledRows += 1;
      });
    });
    const completionPct = detailRows > 0 ? Math.round((filledRows / detailRows) * 100) : 0;
    return { detailRows, filledRows, total, completionPct };
  }, [activeBatangTubuhs, jenis]);

  const getProgramsForKode = (kode: string) => batangTubuhProgramByYear[String(tahunAktif)]?.[kode] || [];

  const totalProgramDraft = useMemo(() => sumPrograms(programDraft), [programDraft]);

  const openProgramDialog = (row: BatangTubuhDetailRow) => {
    if (!canInput) return;
    if (isYearLocked) {
      toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk mengubah anggaran.`);
      return;
    }
    const existingPrograms = getProgramsForKode(row.kode);
    const initialPrograms = existingPrograms.length > 0
      ? existingPrograms
      : Number(row.dianggarkan || 0) > 0
        ? [{
            id: generateId(),
            namaProgram: 'Program Umum',
            rincian: [{ id: generateId(), keterangan: 'Anggaran awal', jumlah: Number(row.dianggarkan || 0) }],
          }]
        : [{ id: generateId(), namaProgram: '', rincian: [{ id: generateId(), keterangan: '', jumlah: 0 }] }];
    setProgramDialogRow(row);
    setProgramDraft(JSON.parse(JSON.stringify(initialPrograms)));
  };

  const closeProgramDialog = () => {
    setProgramDialogRow(null);
    setProgramDraft([]);
    setJumlahDraftByRincian({});
  };

  const addProgram = () => {
    const programId = generateId();
    const rincianId = generateId();
    setProgramDraft((prev) => [...prev, { id: programId, namaProgram: '', rincian: [{ id: rincianId, keterangan: '', jumlah: 0 }] }]);
  };

  const updateProgramName = (programId: string, namaProgram: string) => {
    setProgramDraft((prev) => prev.map((program) => program.id === programId ? { ...program, namaProgram } : program));
  };

  const removeProgram = (programId: string) => {
    setProgramDraft((prev) => prev.filter((program) => program.id !== programId));
  };

  const addRincian = (programId: string) => {
    const rincianId = generateId();
    setProgramDraft((prev) => prev.map((program) => (
      program.id === programId
        ? { ...program, rincian: [...(program.rincian || []), { id: rincianId, keterangan: '', jumlah: 0 }] }
        : program
    )));
  };

  const getDefaultProgramName = () => String(programDialogRow?.nama || 'Program Umum').trim() || 'Program Umum';

  const updateRincian = (programId: string, rincianId: string, data: { keterangan?: string; jumlah?: number }) => {
    setProgramDraft((prev) => prev.map((program) => (
      program.id === programId
        ? (() => {
            const nextRincian = (program.rincian || []).map((rincian) => (
              rincian.id === rincianId ? { ...rincian, ...data } : rincian
            ));
            const hasAmount = nextRincian.some((rincian) => Number(rincian.jumlah || 0) > 0);
            return {
              ...program,
              namaProgram: hasAmount && !String(program.namaProgram || '').trim() ? getDefaultProgramName() : program.namaProgram,
              rincian: nextRincian,
            };
          })()
        : program
    )));
  };

  const updateKeteranganRincian = (programId: string, rincianId: string, value: string) => {
    const keterangan = formatRupiahDescriptionInput(value);
    if (!shouldCalculateAmountFromDescription(keterangan)) {
      updateRincian(programId, rincianId, { keterangan });
      return;
    }
    const amount = parseRupiahCalculationInput(keterangan);
    setJumlahDraftByRincian((prev) => ({ ...prev, [rincianId]: amount > 0 ? formatCurrency(amount) : '' }));
    updateRincian(programId, rincianId, { keterangan, jumlah: amount });
  };

  const removeRincian = (programId: string, rincianId: string) => {
    setJumlahDraftByRincian((prev) => {
      const next = { ...prev };
      delete next[rincianId];
      return next;
    });
    setProgramDraft((prev) => prev.map((program) => (
      program.id === programId
        ? { ...program, rincian: (program.rincian || []).filter((rincian) => rincian.id !== rincianId) }
        : program
    )));
  };

  const updateJumlahRincian = (programId: string, rincianId: string, value: string) => {
    const amount = parseRupiahCalculationInput(value);
    setJumlahDraftByRincian((prev) => ({
      ...prev,
      [rincianId]: shouldKeepJumlahFormulaDraft(value) ? value : amount > 0 ? formatCurrency(amount) : '',
    }));
    updateRincian(programId, rincianId, { jumlah: amount });
  };

  const commitJumlahRincian = (rincianId: string) => {
    setJumlahDraftByRincian((prev) => {
      if (!(rincianId in prev)) return prev;
      const amount = parseRupiahCalculationInput(prev[rincianId]);
      const next = { ...prev };
      next[rincianId] = amount > 0 ? formatCurrency(amount) : '';
      return next;
    });
  };

  const handleProgramDialogKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, select')) return;
    event.preventDefault();
    saveProgramBudget();
  };

  const saveProgramBudget = () => {
    if (!programDialogRow || !canInput) return;
    if (isYearLocked) {
      toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk mengubah anggaran.`);
      return;
    }
    const normalizedProgramDraft = programDraft.map((program) => {
      const hasAmount = (program.rincian || []).some((rincian) => Number(rincian.jumlah || 0) > 0);
      return hasAmount && !String(program.namaProgram || '').trim()
        ? { ...program, namaProgram: getDefaultProgramName() }
        : program;
    });
    try {
      setBatangTubuhProgramsForKode(tahunAktif, programDialogRow.kode, normalizedProgramDraft);
      useStore.getState().addAuditLog('Ubah Dianggarkan', 'Batang Tubuh', `${programDialogRow.kode} - ${formatCurrency(totalProgramDraft)}`, programDialogRow.kode);
      toast.success('Data dianggarkan berhasil disimpan.', {
        description: `${programDialogRow.kode} - ${formatCurrency(totalProgramDraft)}`,
      });
      closeProgramDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan data dianggarkan.');
    }
  };

  const handleExportDianggarkan = async () => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.exportDianggarkan) {
      toast.error('Export RAPB hanya tersedia di aplikasi desktop.');
      return;
    }

    try {
      const result = await electronAPI.exportDianggarkan({
        namaGereja: 'GEREJA PROTESTAN MALUKU',
        klas: 'KLASIS PULAU AMBON TIMUR',
        jemaat: 'JEMAAT SULI',
        tahun: String(tahunAktif),
        batangTubuhs: activeBatangTubuhs,
        doorscrieftTransaksis,
        batangTubuhProgramByYear,
      });

      if (result?.canceled) return;
      if (result?.success) {
        toast.success('Rancangan anggaran berhasil diexport.', {
          description: result.path,
        });
        return;
      }
      toast.error(result?.error || 'Gagal export rancangan anggaran.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal export rancangan anggaran.');
    }
  };

  const renderProgramBudgetDialog = () => (
    <Dialog open={Boolean(programDialogRow)} onOpenChange={(open) => { if (!open) closeProgramDialog(); }} contentClassName="max-w-5xl" draggable placement="top">
      <DialogHeader draggable>
        <DialogTitle>Susun Dianggarkan</DialogTitle>
      </DialogHeader>
      <DialogContent>
        {programDialogRow && (
          <div className="space-y-4" onKeyDown={handleProgramDialogKeyDown}>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{programDialogRow.kode}</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">{programDialogRow.nama}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">Total Dianggarkan</p>
                  <p className="text-base font-bold text-blue-700 dark:text-blue-300">{formatCurrency(totalProgramDraft)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Jumlah Program</p>
                  <p className="text-base font-bold text-slate-900 dark:text-white">{programDraft.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Tahun</p>
                  <p className="text-base font-bold text-slate-900 dark:text-white">{tahunAktif}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {programDraft.length === 0 ? (
                <AppStateMessage tone="empty" title="Belum ada program" detail="Tambahkan program pertama untuk kode anggaran ini." actionLabel="Tambah Program" onAction={addProgram} compact />
              ) : programDraft.map((program, programIndex) => {
                const programTotal = sumPrograms([program]);
                return (
                  <div key={program.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Input
                        label={`Program ${programIndex + 1}`}
                        value={program.namaProgram}
                        onChange={(e) => updateProgramName(program.id, e.target.value)}
                        placeholder="Nama program"
                      />
                      <div className="flex items-center justify-between gap-2 sm:w-56">
                        <div>
                          <p className="text-xs text-slate-500">Total</p>
                          <p className="font-bold text-blue-700 dark:text-blue-300">{formatCurrency(programTotal)}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeProgram(program.id)} title="Hapus program">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-[minmax(0,1fr)_220px_48px] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500 dark:bg-slate-900">
                        <span>Keterangan Rincian</span>
                        <span className="text-right">Jumlah</span>
                        <span></span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {(program.rincian || []).map((rincian) => (
                          <div key={rincian.id} className="grid grid-cols-[minmax(0,1fr)_220px_48px] items-start gap-2 px-3 py-2">
                            <div className="space-y-1">
                              <textarea
                                value={rincian.keterangan}
                                onChange={(e) => {
                                  resizeTextarea(e.currentTarget);
                                  updateKeteranganRincian(program.id, rincian.id, e.target.value);
                                }}
                                onFocus={(e) => resizeTextarea(e.currentTarget)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.stopPropagation();
                                }}
                                className="min-h-10 w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm leading-5 ring-offset-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-400 dark:focus-visible:ring-offset-slate-800"
                                rows={2}
                                placeholder="Contoh: 32 minggu x 27 unit x Rp90.000"
                              />
                            </div>
                            <Input
                              value={jumlahDraftByRincian[rincian.id] ?? (Number(rincian.jumlah || 0) > 0 ? formatCurrency(Number(rincian.jumlah || 0)) : '')}
                              onChange={(e) => updateJumlahRincian(program.id, rincian.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Tab') commitJumlahRincian(rincian.id);
                              }}
                              className="text-right"
                              placeholder="Rp0 atau 3 hari x 17.000.000"
                            />
                            <Button variant="ghost" size="icon" onClick={() => removeRincian(program.id, rincian.id)} title="Hapus rincian">
                              <X className="h-4 w-4 text-slate-400" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button className="mt-3" variant="outline" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => addRincian(program.id)}>
                      <Plus className="mr-2 h-4 w-4" /> Tambah Rincian
                    </Button>
                  </div>
                );
              })}
            </div>

            <Button variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={addProgram}>
              <Plus className="mr-2 h-4 w-4" /> Tambah Program
            </Button>
          </div>
        )}
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={closeProgramDialog}>Batal</Button>
        <Button onClick={saveProgramBudget} disabled={!canInput || isYearLocked}>Simpan Dianggarkan</Button>
      </DialogFooter>
    </Dialog>
  );

  if (batangTubuhs.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
            <Calculator className="h-4 w-4" />
            Input Anggaran
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Dianggarkan</h1>
          <p className="text-slate-500 dark:text-slate-400">Isi program dan rincian anggaran yang tersinkron ke Batang Tubuh.</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <AppStateMessage
              title="Struktur Batang Tubuh belum tersedia"
              detail="Sinkronkan Master Kode Anggaran dari sidebar Batang Tubuh atau Pengaturan terlebih dahulu."
              actionLabel="Buka Batang Tubuh"
              onAction={() => { window.location.hash = '#/batang-tubuh'; }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
              <Calculator className="h-4 w-4" />
              Input Anggaran
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Dianggarkan</h1>
            <p className="text-slate-500 dark:text-slate-400">Kelola program dan rincian anggaran Tahun {tahunAktif}. Hasilnya langsung tampil di Batang Tubuh.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900/70 dark:bg-blue-950/25">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">Total {jenis === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'}</p>
                  <p className="mt-2 text-xl font-bold text-blue-950 dark:text-blue-100">{formatCurrency(summary.total)}</p>
                </div>
                <span className="rounded-md bg-white p-2 text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300">
                  <WalletCards className="h-4 w-4" />
                </span>
              </div>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-900/70 dark:bg-emerald-950/25">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">Kode {jenis === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'} Terisi</p>
                  <p className="mt-2 text-xl font-bold text-emerald-950 dark:text-emerald-100">{summary.filledRows}</p>
                </div>
                <span className="rounded-md bg-white p-2 text-emerald-700 shadow-sm dark:bg-slate-950 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white dark:bg-slate-900">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${summary.completionPct}%` }} />
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Total Kode {jenis === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'}</p>
                  <p className="mt-2 text-xl font-bold text-slate-950 dark:text-white">{summary.detailRows}</p>
                </div>
                <span className="rounded-md bg-slate-100 p-2 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <ClipboardList className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">{summary.completionPct}% kode sudah punya anggaran</p>
            </div>
          </div>
        </div>

        {isYearLocked && <YearLockedBanner tahun={tahunAktif} detail="Data dianggarkan hanya bisa dilihat. Buka kunci dari Pengaturan jika perlu revisi." />}

        <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-700">
          <CardHeader className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/70">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex w-fit rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                {(['pendapatan', 'pengeluaran'] as const).map((item) => (
                  <Button key={item} size="sm" variant={jenis === item ? 'default' : 'ghost'} onClick={() => setJenis(item)}>
                    {item === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'}
                  </Button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full lg:w-96">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-10" placeholder="Cari kode, mata anggaran, atau kelompok..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Button variant="outline" onClick={handleExportDianggarkan}>
                  <Download className="mr-2 h-4 w-4" /> Export RAPB
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-slate-200 bg-white text-left text-xs font-semibold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                    <th className="w-8 px-4 py-3"></th>
                    <th className="px-4 py-3">Kode</th>
                    <th className="px-4 py-3">Mata Anggaran</th>
                    <th className="px-4 py-3 text-right">Dianggarkan</th>
                    <th className="w-24 px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6">
                        <AppStateMessage tone="search" title="Tidak ada data dianggarkan" detail="Ubah filter atau kata kunci pencarian." compact />
                      </td>
                    </tr>
                  ) : filtered.map((group) => {
                    const isExpanded = expandedKode === group.kode;
                    const groupTotal = (group.detailRows || []).reduce((sum, row) => sum + Number(row.dianggarkan || 0), 0);
                    return (
                      <Fragment key={group.kode}>
                        <tr
                          className={`cursor-pointer border-b transition dark:border-slate-700 ${isExpanded ? 'bg-blue-50/70 dark:bg-blue-950/20' : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800'}`}
                          onClick={() => setExpandedKode(isExpanded ? null : group.kode)}
                        >
                          <td className="border-l-4 border-blue-500 px-4 py-3">{isExpanded ? <ChevronDown className="h-4 w-4 text-blue-700 dark:text-blue-300" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{group.kode}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900 dark:text-white">{group.nama}</p>
                            <p className="text-xs text-slate-500">{group.subSeksiNama}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex rounded-md bg-blue-100 px-2.5 py-1 font-mono font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                              {groupTotal > 0 ? formatCurrency(groupTotal) : '-'}
                            </span>
                          </td>
                          <td></td>
                        </tr>
                        {isExpanded && (group.detailRows || []).map((row) => {
                          const programs = getProgramsForKode(row.kode);
                          const hasBudget = Number(row.dianggarkan || 0) > 0;
                          const isProgramExpanded = expandedProgramKode === row.kode;
                          return (
                            <Fragment key={row.kode}>
                              <tr className="border-b bg-slate-50/80 transition hover:bg-white dark:border-slate-700/50 dark:bg-slate-800/40 dark:hover:bg-slate-800">
                                <td></td>
                                <td className="px-4 py-3 pl-8 font-mono text-xs text-slate-600 dark:text-slate-300">{row.kode}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-slate-800 dark:text-slate-100">{row.nama}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${programs.length > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                      {programs.length > 0 ? `${programs.length} program` : 'Belum ada program'}
                                    </span>
                                    {hasBudget && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                        <Target className="h-3 w-3" /> Terisi
                                      </span>
                                    )}
                                    {programs.length > 0 && (
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 underline-offset-2 hover:bg-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-900/70"
                                        onClick={() => setExpandedProgramKode(isProgramExpanded ? null : row.kode)}
                                      >
                                        {isProgramExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                        {isProgramExpanded ? 'Tutup detail' : 'Buka detail'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-semibold text-blue-700 dark:text-blue-300">
                                  {hasBudget ? formatCurrency(row.dianggarkan) : '-'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Button size="sm" variant="outline" disabled={!canInput || isYearLocked} onClick={() => openProgramDialog(row)}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" /> Susun
                                  </Button>
                                </td>
                              </tr>
                              {isProgramExpanded && (
                                <tr className="border-b border-sky-100 bg-sky-50/50 dark:border-sky-900/50 dark:bg-slate-950/40">
                                  <td></td>
                                  <td colSpan={4} className="px-4 py-3">
                                    <div className="ml-4 space-y-3 rounded-md border border-sky-200 bg-sky-50 p-3 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/20">
                                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                          <p className="text-xs font-semibold uppercase text-sky-700 dark:text-sky-300">Detail Keterangan Dianggarkan</p>
                                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{row.kode} - {row.nama}</p>
                                        </div>
                                        <p className="w-fit rounded-md bg-white px-2.5 py-1 font-mono text-sm font-bold text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300">
                                          {formatCurrency(row.dianggarkan || 0)}
                                        </p>
                                      </div>
                                      {programs.map((program) => {
                                        const totalProgram = sumPrograms([program]);
                                        return (
                                          <div key={program.id} className="overflow-hidden rounded-md border border-emerald-200 bg-white shadow-sm dark:border-emerald-900/60 dark:bg-slate-900">
                                            <div className="flex items-center justify-between gap-3 border-l-4 border-emerald-500 bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                                              <div>
                                                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Program</p>
                                                <p className="text-base font-extrabold text-emerald-950 dark:text-emerald-50">{program.namaProgram || 'Program Umum'}</p>
                                              </div>
                                              <div className="rounded-md bg-white px-3 py-1.5 text-right shadow-sm dark:bg-slate-950">
                                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Jumlah</p>
                                                <p className="font-mono text-base font-extrabold text-emerald-700 dark:text-emerald-300">{formatCurrency(totalProgram)}</p>
                                              </div>
                                            </div>
                                            <div className="divide-y divide-slate-100 px-3 py-1 text-sm dark:divide-slate-800">
                                              {(program.rincian || []).length === 0 ? (
                                                <div className="py-2 text-slate-500 dark:text-slate-400">Belum ada keterangan rincian.</div>
                                              ) : (program.rincian || []).map((rincian) => (
                                                <div key={rincian.id} className="flex items-center justify-between gap-3 py-1.5">
                                                  <span className="text-slate-700 dark:text-slate-200">{rincian.keterangan || '-'}</span>
                                                  <span className="rounded-md bg-slate-50 px-2 py-1 text-right font-mono font-bold text-slate-900 dark:bg-slate-950 dark:text-slate-100">{formatCurrency(rincian.jumlah || 0)}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      {renderProgramBudgetDialog()}
    </>
  );
}
