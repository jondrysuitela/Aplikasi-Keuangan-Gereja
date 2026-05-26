import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';
import { Search, Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight, Trash, Download, ExternalLink } from 'lucide-react';
import type { KodeAnggaranItem, DoorscrieftRowInput } from '@/types';

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

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
  penerimaan: '',
  pengeluaran: '',
};

export function DoorscrieftInputPage() {
  const {
    tahunAktif,
    kodeAnggarans,
    setKodeAnggarans,
    doorscrieftTransaksis,
    addDoorscrieftTransaksi,
    updateDoorscrieftTransaksi,
    deleteDoorscrieftTransaksi,
    setDoorscrieftTransaksis,
  } = useStore();

  // --- Undo history: snapshot-based, max 50 steps ---
  const undoHistoryRef = useRef<DoorscrieftRowInput[][]>([]);
  const [undoCount, setUndoCount] = useState(0);

  const pushUndoSnapshot = () => {
    undoHistoryRef.current = [
      ...undoHistoryRef.current.slice(-49),
      JSON.parse(JSON.stringify(doorscrieftTransaksis)),
    ];
    setUndoCount(undoHistoryRef.current.length);
  };

  const handleUndo = () => {
    const snapshot = undoHistoryRef.current.pop();
    if (!snapshot) {
      alert('Tidak ada aksi yang bisa di-undo.');
      return;
    }
    setUndoCount(undoHistoryRef.current.length);
    // Re-hydrate Date fields
    const restored = snapshot.map((t) => ({
      ...t,
      tanggal: new Date(t.tanggal),
      createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
      updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined,
    }));
    setDoorscrieftTransaksis(restored);
  };

  // Ctrl+Z listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });


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

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 150);
  const [kodeSearch, setKodeSearch] = useState('');
  const debouncedKodeSearch = useDebouncedValue(kodeSearch, 150);

  // --- Input dialog state ---
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const noInputRef = useRef<HTMLInputElement>(null);

  // Lembar aktif (index unique lembarId groups)
  const [activeLembar, setActiveLembar] = useState(0);
  // Per-lembar labels (editable)
  const [lembarLabels, setLembarLabels] = useState<Record<string, string>>({});
  // Track lembarId targeted by the currently open input dialog.
  const inputLembarIdRef = useRef<string | null>(null);
  // Backward-compatible alias for pending new lembar state used by close/reset logic.
  const pendingNewLembarIdRef = useRef<string | null>(null);

  // All rows filtered by tahunAktif, sorted by tanggal then no
  const allRows = useMemo(() => {
    return doorscrieftTransaksis
      .filter((r: DoorscrieftRowInput) => new Date(r.tanggal).getFullYear() === tahunAktif)
      .sort((a: DoorscrieftRowInput, b: DoorscrieftRowInput) => {
        const da = new Date(a.tanggal).getTime();
        const db = new Date(b.tanggal).getTime();
        if (da !== db) return da - db;
        const na = Number(a.no) || 0;
        const nb = Number(b.no) || 0;
        return na - nb;
      });
  }, [doorscrieftTransaksis, tahunAktif]);

  // Group by lembarId instead of date — each lembar is independent
  const dateGroups = useMemo(() => {
    // Preserve creation order: first seen lembarId = first group
    const groups: Record<string, DoorscrieftRowInput[]> = {};
    const order: string[] = [];
    allRows.forEach((r) => {
      const key = r.lembarId || 'default';
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(r);
    });
    return order.map((key) => [key, groups[key]] as [string, DoorscrieftRowInput[]]);
  }, [allRows]);

  const activeLembarId = dateGroups[activeLembar]?.[0] ?? '';

  useEffect(() => {
    if (!isOpen || editingId) return;
    const targetLembarId = inputLembarIdRef.current;
    if (!targetLembarId) return;
    const targetIndex = dateGroups.findIndex(([lembarId]) => lembarId === targetLembarId);
    if (targetIndex >= 0 && targetIndex !== activeLembar) {
      setActiveLembar(targetIndex);
    }
  }, [dateGroups, activeLembar, isOpen, editingId]);

  // Auto-generate next nomor berdasarkan nomor terakhir
  const nextNomor = useMemo(() => {
    if (doorscrieftTransaksis.length === 0) return '1';
    const maxNo = doorscrieftTransaksis.reduce((max: number, r) => {
      const n = Number(r.no) || 0;
      return n > max ? n : max;
    }, 0);
    return String(maxNo + 1);
  }, [doorscrieftTransaksis]);

  // Filtered rows for active date + search
  const filteredRows = useMemo(() => {
    if (!dateGroups.length) return [];
    const rows = dateGroups[activeLembar][1];
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        String(r.no).includes(q) ||
        (r.uraian || '').toLowerCase().includes(q) ||
        (r.kodeAnggaran || '').toLowerCase().includes(q) ||
        (r.mataAnggaran || '').toLowerCase().includes(q)
      );
    });
  }, [dateGroups, activeLembar, debouncedSearch]);

  // Sisa Saldo Tahun Lalu: read I.1.1.01 from first lembar only
  const sisaTahunLalu = useMemo(() => {
    const firstLembarRows = dateGroups[0]?.[1] || [];
    const i101Rows = firstLembarRows.filter(
      (r: DoorscrieftRowInput) => r.kodeAnggaran === 'I.1.1.01'
    );
    return {
      p: i101Rows.reduce((s, r) => s + Number(r.penerimaan || 0), 0),
      q: i101Rows.reduce((s, r) => s + Number(r.pengeluaran || 0), 0),
    };
  }, [dateGroups]);

  // Per-lembar totals: first lembar excludes I.1.1.01 from daily sum, uses it as S/D
  // Subsequent lembar: daily = all rows, S/D = previous lembar total
  const lembarTotals = useMemo(() => {
    const totals: { harianP: number; harianQ: number; sDP: number; sDQ: number; totalP: number; totalQ: number }[] = [];

    for (let i = 0; i < dateGroups.length; i++) {
      const [, rows] = dateGroups[i];
      // First lembar: exclude I.1.1.01 from daily sum
      const harianP = i === 0
        ? rows.filter(r => r.kodeAnggaran !== 'I.1.1.01').reduce((s, r) => s + Number(r.penerimaan || 0), 0)
        : rows.reduce((s, r) => s + Number(r.penerimaan || 0), 0);
      const harianQ = i === 0
        ? rows.filter(r => r.kodeAnggaran !== 'I.1.1.01').reduce((s, r) => s + Number(r.pengeluaran || 0), 0)
        : rows.reduce((s, r) => s + Number(r.pengeluaran || 0), 0);

      const sDP = i === 0 ? sisaTahunLalu.p : totals[i - 1].totalP;
      const sDQ = i === 0 ? sisaTahunLalu.q : totals[i - 1].totalQ;

      totals.push({ harianP, harianQ, sDP, sDQ, totalP: sDP + harianP, totalQ: sDQ + harianQ });
    }

    return totals;
  }, [dateGroups, sisaTahunLalu]);

  // Summary for active lembar — uses pre-computed lembarTotals
  const summary = useMemo(() => {
    if (!dateGroups.length) return { harian: { p: 0, q: 0 }, sD: { p: 0, q: 0 }, total: { p: 0, q: 0 } };

    const lt = lembarTotals[activeLembar];
    if (!lt) return { harian: { p: 0, q: 0 }, sD: { p: 0, q: 0 }, total: { p: 0, q: 0 } };

    return {
      harian: { p: lt.harianP, q: lt.harianQ },
      sD: { p: lt.sDP, q: lt.sDQ },
      total: { p: lt.totalP, q: lt.totalQ },
    };
  }, [dateGroups, activeLembar, lembarTotals]);

  const sisa = summary.total.p - summary.total.q;

  // Sheet label: use custom label or auto-generate from earliest date in lembar
  const sheetLabel = useMemo(() => {
    const rows = dateGroups[activeLembar]?.[1] || [];
    if (rows.length === 0) return '';
    const earliest = rows.reduce((min, r) => {
      const t = new Date(r.tanggal).getTime();
      return t < min ? t : min;
    }, Infinity);
    const d = new Date(earliest);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${months[d.getMonth()]} ${tahunAktif}`;
  }, [dateGroups, activeLembar, tahunAktif]);

  // Kode anggaran master search
  const filteredMaster = useMemo(() => {
    const q = debouncedKodeSearch.trim().toLowerCase();
    if (!q) return kodeAnggarans;
    return kodeAnggarans.filter((k) => {
      return (
        (k.kodeAnggaran || '').toLowerCase().includes(q) ||
        (k.mataAnggaran || '').toLowerCase().includes(q)
      );
    });
  }, [kodeAnggarans, debouncedKodeSearch]);

  // Arrow key navigation state for Kode Anggaran dropdown
  const [kodeDropdownOpen, setKodeDropdownOpen] = useState(false);
  const [kodeHighlightIdx, setKodeHighlightIdx] = useState(-1);
  const displayedMaster = filteredMaster.slice(0, 30);
  const dropdownScrollRef = useRef<HTMLDivElement>(null);

  const handleKodeArrowDown = () => {
    if (!kodeDropdownOpen) {
      setKodeDropdownOpen(true);
      setKodeHighlightIdx(0);
    } else {
      setKodeHighlightIdx((prev) => Math.min(prev + 1, displayedMaster.length - 1));
    }
  };

  const handleKodeArrowUp = () => {
    if (kodeDropdownOpen) {
      setKodeHighlightIdx((prev) => Math.max(prev - 1, 0));
    }
  };

  const handleKodeSelect = () => {
    if (kodeDropdownOpen && kodeHighlightIdx >= 0 && kodeHighlightIdx < displayedMaster.length) {
      const selected = displayedMaster[kodeHighlightIdx];
      setForm((prev) => ({ ...prev, kodeAnggaran: selected.kodeAnggaran, mataAnggaran: selected.mataAnggaran }));
      setKodeSearch(selected.kodeAnggaran);
      setKodeDropdownOpen(false);
      setKodeHighlightIdx(-1);
    }
  };

  const handleKodeClose = () => {
    setKodeDropdownOpen(false);
    setKodeHighlightIdx(-1);
  };

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (kodeHighlightIdx >= 0 && dropdownScrollRef.current) {
      const container = dropdownScrollRef.current;
      const item = container.children[kodeHighlightIdx] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [kodeHighlightIdx]);

  const validateKodeAnggaran = (kode: string) => {
    const hit = kodeAnggarans.find((k: KodeAnggaranItem) => k.kodeAnggaran === kode);
    if (!hit) {
      alert('Kode anggaran tidak valid (tidak ada di DATA BASE2).');
      return null;
    }
    return hit;
  };

  const submitDoorscrieftForm = (
    formData = form,
    targetLembarIdOverride?: string | null,
    resetLocalForm = true,
  ) => {
    const mata = validateKodeAnggaran(formData.kodeAnggaran);
    if (!mata) return;

    // Determine which lembar this row belongs to. Keep the dialog target stable
    // so consecutive inputs after creating a new lembar stay in that new lembar.
    const currentLembarId = activeLembarId || '';
    const targetLembarId = targetLembarIdOverride || inputLembarIdRef.current || currentLembarId || 'default';
    inputLembarIdRef.current = targetLembarId;

    const payload = {
      no: String(formData.no || '').trim(),
      tanggal: new Date(formData.tanggal),
      uraian: String(formData.uraian || '').trim(),
      kodeAnggaran: formData.kodeAnggaran,
      mataAnggaran: mata.mataAnggaran,
      penerimaan: Number(String(formData.penerimaan).replace(/[.\s]/g, '').replace(/,/g, '') || 0),
      pengeluaran: Number(String(formData.pengeluaran).replace(/[.\s]/g, '').replace(/,/g, '') || 0),
      updatedAt: new Date(),
      createdBy: 'admin',
      lembarId: targetLembarId,
    } as Omit<DoorscrieftRowInput, 'id' | 'createdAt'>;

    if (editingId) {
      pushUndoSnapshot();
      updateDoorscrieftTransaksi(editingId, payload as any);
    } else {
      // Nomor berikutnya = nomor yang baru diinput + 1
      const lastNo = Number(formData.no) || 0;
      const newNo = String(lastNo + 1);

      pushUndoSnapshot();
      addDoorscrieftTransaksi(payload as any);

      setEditingId(null);
      setKodeSearch('');
      if (resetLocalForm) {
        // Reset form tapi tetap buka dialog untuk input berikutnya
        setForm({
          tanggal: formData.tanggal,
          no: '',
          uraian: '',
          kodeAnggaran: '',
          mataAnggaran: '',
          penerimaan: '',
          pengeluaran: '',
        });
        // Auto-fill nomor berikutnya untuk input selanjutnya
        setTimeout(() => {
          setForm((prev) => ({ ...prev, no: newNo }));
          noInputRef.current?.focus();
        }, 120);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitDoorscrieftForm();
  };

  const handleEdit = (item: DoorscrieftRowInput) => {
    setEditingId(item.id);
    inputLembarIdRef.current = item.lembarId || null;
    pendingNewLembarIdRef.current = null;
    setForm({
      tanggal: new Date(item.tanggal).toISOString().split('T')[0],
      no: String(item.no || ''),
      uraian: item.uraian || '',
      kodeAnggaran: item.kodeAnggaran || '',
      mataAnggaran: item.mataAnggaran || '',
      penerimaan: item.penerimaan ? String(item.penerimaan).replace(/[.\s]/g, '').replace(/,/g, '') : '',
      pengeluaran: item.pengeluaran ? String(item.pengeluaran).replace(/[.\s]/g, '').replace(/,/g, '') : '',
    });
    setKodeSearch(item.kodeAnggaran || '');
    setIsOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Yakin hapus baris ini?')) return;
    pushUndoSnapshot();
    deleteDoorscrieftTransaksi(id);
  };

  // --- Export to Excel (all lembar, separated per lembar) ---
  const handleExportExcel = () => {
    const anyWin = window as unknown as { electronAPI?: { exportDoorscrieftToExcel?: (data: unknown) => Promise<{ success: boolean; path?: string; error?: string }> } };

    // Build lembar data using the same logic as sidebar (lembarTotals)
    const lembars = dateGroups.map(([lembarId, rows], idx) => {
      const harianP = rows.reduce((s, r) => s + Number(r.penerimaan || 0), 0);
      const harianQ = rows.reduce((s, r) => s + Number(r.pengeluaran || 0), 0);

      // Use lembarTotals for correct opening balance chaining
      const sDP = lembarTotals[idx]?.sDP ?? 0;
      const sDQ = lembarTotals[idx]?.sDQ ?? 0;
      const totalP = lembarTotals[idx]?.totalP ?? (sDP + harianP);
      const totalQ = lembarTotals[idx]?.totalQ ?? (sDQ + harianQ);

      return {
        dateKey: lembarId,
        rows: rows.map((r: DoorscrieftRowInput) => ({
          no: r.no,
          tanggal: new Date(r.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
          uraian: r.uraian,
          kodeAnggaran: r.kodeAnggaran,
          penerimaan: r.penerimaan || 0,
          pengeluaran: r.pengeluaran || 0,
        })),
        harianP,
        harianQ,
        sDP,
        sDQ,
        totalP,
        totalQ,
        sisa: totalP - totalQ,
      };
    });

    const exportData = {
      lembars,
      monthName: sheetLabel || 'BULAN',
      fileName: `Doorscrieft_${namaJemaat.replace(/\s+/g, '_')}_${tahunAktif}.xlsx`,
    };

    if (anyWin?.electronAPI?.exportDoorscrieftToExcel) {
      anyWin.electronAPI.exportDoorscrieftToExcel(exportData).then((result) => {
        if (result.success) {
          alert(`Berhasil export ke:\n${result.path}`);
        } else {
          alert(`Gagal export: ${result.error || 'Unknown error'}`);
        }
      }).catch(() => {
        exportFallbackCSV(exportData);
      });
    } else {
      exportFallbackCSV(exportData);
    }
  };

  const exportFallbackCSV = (data: { lembars: { dateKey: string; rows: { no: string; tanggal: string; uraian: string; kodeAnggaran: string; penerimaan: number; pengeluaran: number }[]; harianP: number; harianQ: number; sDP: number; sDQ: number; totalP: number; totalQ: number; sisa: number }[]; monthName: string; fileName: string }) => {
    const colHeader = data.monthName.toUpperCase();
    const csvRows: string[] = [];

    const fmt = (n: number) => n.toLocaleString('id-ID');

    // Title block
    csvRows.push(`LAPORAN KEUANGAN GEREJA - DOORSCRIEFT`);
    csvRows.push(`Periode: ${data.monthName} | ${data.fileName}`);
    csvRows.push('');

    // Each lembar section
    data.lembars.forEach((lb, li) => {
      const dateLabel = new Date(lb.dateKey).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

      csvRows.push('═'.repeat(90));
      csvRows.push(`LEMBAR ${li + 1} — ${dateLabel.toUpperCase()}`);
      csvRows.push('═'.repeat(90));

      // Header
      csvRows.push(`NO;${colHeader};URAIAN;KODE ANGGARAN;PENERIMAAN;PENGELUARAN`);

      // Data rows
      lb.rows.forEach((r) => {
        const uraian = r.uraian.replace(/"/g, '""');
        const pStr = r.penerimaan > 0 ? fmt(r.penerimaan) : '-';
        const qStr = r.pengeluaran > 0 ? fmt(r.pengeluaran) : '-';
        csvRows.push(`${r.no};${r.tanggal};"${uraian}";${r.kodeAnggaran};${pStr};${qStr}`);
      });

      // Summary rows (same as sidebar)
      csvRows.push('─'.repeat(90));
      csvRows.push(`;JUMLAH TANGGAL HARI INI;;;${fmt(lb.harianP)};${fmt(lb.harianQ)}`);
      csvRows.push(`;JUMLAH S/D TANGGAL;;;${fmt(lb.sDP)};${fmt(lb.sDQ)}`);
      csvRows.push(`;TOTAL;;;${fmt(lb.totalP)};${fmt(lb.totalQ)}`);
      csvRows.push(`;SISA;;;${fmt(lb.sisa)};`);
      csvRows.push('');
    });

    // BOM for UTF-8 Excel compatibility
    const BOM = '﻿';
    const csvContent = BOM + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.fileName.replace('.xlsx', '.csv');
    a.click();
    URL.revokeObjectURL(url);
  };

  const namaJemaat = useStore.getState().namaJemaat || 'Gereja';

  // Context menu for lembar right-click
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; idx: number } | null>(null);

  const handleLembarRightClick = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, idx });
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleEditLembar = (idx: number) => {
    const [lembarId] = dateGroups[idx] || [];
    if (!lembarId) return;
    setEditingId(null);
    setActiveLembar(idx);
    inputLembarIdRef.current = lembarId;
    pendingNewLembarIdRef.current = null;
    setForm({
      ...initialForm,
      no: nextNomor,
    });
    setKodeSearch('');
    setIsOpen(true);
    setContextMenu(null);
  };

  const handleDeleteLembar = (idx: number) => {
    const [lembarId] = dateGroups[idx] || [];
    if (!lembarId) return;
    const label = lembarLabels[lembarId] || `Lembar ${idx + 1}`;
    if (!confirm(`Hapus semua data di ${label}?`)) return;
    pushUndoSnapshot();
    const idsToDelete = dateGroups[idx][1].map((r: DoorscrieftRowInput) => r.id);
    idsToDelete.forEach((id: string) => deleteDoorscrieftTransaksi(id));
    // Navigate to previous lembar if current is deleted
    if (activeLembar >= dateGroups.length - 1) {
      setActiveLembar(Math.max(0, dateGroups.length - 2));
    }
    setContextMenu(null);
  };

  const handleHapusSemua = () => {
    if (!confirm('Hapus SEMUA data Doorscrieft? Tindakan ini tidak bisa dibatalkan.')) return;
    pushUndoSnapshot();
    setDoorscrieftTransaksis([]);
  };

  const goPrev = () => setActiveLembar((l) => Math.max(0, l - 1));
  const goNext = () => setActiveLembar((l) => Math.min(dateGroups.length - 1, l + 1));

  const handleAddLembarLanjutan = () => {
    // Create a new lembar with its own ID
    const newLembarId = generateId();
    const newLabel = `Lembar ${dateGroups.length + 1}`;

    // Compute new number from existing data
    const currentMax = doorscrieftTransaksis.reduce((max: number, r) => {
      const n = Number(r.no) || 0;
      return n > max ? n : max;
    }, 0);
    const newNo = String(currentMax + 1);

    // Pre-set label and store lembarId ref for form submission
    setLembarLabels((prev) => ({ ...prev, [newLembarId]: newLabel }));
    inputLembarIdRef.current = newLembarId;
    pendingNewLembarIdRef.current = newLembarId;

    // Open input dialog with today's date (user can change freely)
    setEditingId(null);
    setForm({
      ...initialForm,
      no: newNo,
    });
    setKodeSearch('');
    setIsOpen(true);
  };

  const openExternalInputWindow = async (createNewLembar = false, seedForm = form) => {
    const anyWin = window as unknown as {
      electronAPI?: {
        openDoorscrieftInputWindow?: (data: unknown) => Promise<{ success: boolean; error?: string }>;
      };
    };

    if (!anyWin?.electronAPI?.openDoorscrieftInputWindow) {
      setEditingId(null);
      setForm({ ...initialForm, no: nextNomor });
      setIsOpen(true);
      return;
    }

    let targetLembarId = inputLembarIdRef.current || activeLembarId || 'default';
    let nextLabelCount = dateGroups.length;
    if (createNewLembar || !targetLembarId) {
      targetLembarId = generateId();
      nextLabelCount = dateGroups.length + 1;
      setLembarLabels((prev) => ({ ...prev, [targetLembarId]: `Lembar ${nextLabelCount}` }));
    }
    inputLembarIdRef.current = targetLembarId;
    pendingNewLembarIdRef.current = createNewLembar ? targetLembarId : null;

    const initialNo = seedForm.no || nextNomor;
    const result = await anyWin.electronAPI.openDoorscrieftInputWindow({
      targetLembarId,
      kodeAnggarans,
      form: {
        ...initialForm,
        ...seedForm,
        no: initialNo,
      },
    });
    if (!result?.success) {
      alert(result?.error || 'Gagal membuka window input.');
    }
  };

  const moveCurrentDialogToExternalWindow = async () => {
    await openExternalInputWindow(false, form);
    setIsOpen(false);
  };

  useEffect(() => {
    const anyWin = window as unknown as {
      electronAPI?: {
        onDoorscrieftExternalSubmit?: (cb: (payload: { form: typeof form; targetLembarId?: string | null }) => void) => (() => void) | undefined;
      };
    };
    if (!anyWin?.electronAPI?.onDoorscrieftExternalSubmit) return;

    const cleanup = anyWin.electronAPI.onDoorscrieftExternalSubmit((payload) => {
      if (!payload?.form) return;
      submitDoorscrieftForm(payload.form, payload.targetLembarId, false);
    });
    return () => cleanup?.();
  }, [kodeAnggarans, activeLembarId, editingId, doorscrieftTransaksis, form]);

  // Format date display
  const formatDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  return (
    <div className='space-y-3'>
      {/* Title bar */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <h1 className='text-xl font-bold text-slate-900 dark:text-white'>Doorscrieft</h1>
          {undoCount > 0 && (
            <span className='text-xs text-slate-400 dark:text-slate-500 select-none' title='Undo (Ctrl+Z)'>Ctrl+Z untuk undo</span>
          )}
        </div>
        <div className='flex gap-2'>
          {undoCount > 0 && (
            <Button variant='outline' size='sm' onClick={handleUndo} title='Undo (Ctrl+Z)'>
              Undo
            </Button>
          )}
          {doorscrieftTransaksis.length > 0 && (
            <Button variant='destructive' size='sm' onClick={handleHapusSemua}>
              <Trash className='mr-1 h-3.5 w-3.5' /> Hapus Semua
            </Button>
          )}
        </div>
      </div>

      {/* Search + Lembar nav — sticky on scroll */}
      <div className='sticky top-0 z-20 bg-gray-50 dark:bg-slate-900 pt-1 -mx-1 px-1 space-y-2'>
        {/* Search + Tambah Lembar */}
        <div className='flex items-center gap-2 max-w-lg'>
          <div className='relative flex-1'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
            <Input
              placeholder='Cari No, Uraian, atau Kode Anggaran...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='pl-10'
            />
          </div>
          <Button variant='outline' size='sm' onClick={handleAddLembarLanjutan}>
            <Plus className='mr-1 h-3.5 w-3.5' /> Lembar
          </Button>
          <Button variant='outline' size='sm' onClick={() => openExternalInputWindow(false)} title='Buka input di window luar'>
            <ExternalLink className='mr-1 h-3.5 w-3.5' /> Window
          </Button>
        </div>

        {/* Lembar navigation */}
        {dateGroups.length > 0 && (
          <div className='flex items-center gap-3 bg-white dark:bg-slate-800 dark:border-slate-700 rounded-lg border px-4 py-2'>
          <span className='text-sm font-semibold text-slate-700 dark:text-slate-200'>
            Tahun {tahunAktif}
          </span>
          <Button variant='ghost' size='icon' onClick={goPrev} disabled={activeLembar === 0}>
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <div className='flex gap-1 overflow-x-auto flex-1'>
            {dateGroups.map(([lembarId], idx) => {
              const label = lembarLabels[lembarId] || `Lembar ${idx + 1}`;
              return (
                <button
                  key={lembarId}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    idx === activeLembar ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  onClick={() => setActiveLembar(idx)}
                  onContextMenu={(e) => handleLembarRightClick(e, idx)}
                  title={`Klik kanan untuk opsi (klik kanan)`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Button variant='ghost' size='icon' onClick={goNext} disabled={activeLembar >= dateGroups.length - 1}>
            <ChevronRight className='h-4 w-4' />
          </Button>
          <span className='ml-auto text-xs text-slate-500'>{dateGroups.length} lembar</span>
          <Button variant='outline' size='sm' onClick={handleExportExcel}>
            <Download className='mr-1 h-3.5 w-3.5' /> Export Excel
          </Button>
        </div>
      )}
      </div>

      {/* Context menu for lembar */}
      {contextMenu && (
        <div
          className='fixed z-[100] rounded-lg border bg-white dark:bg-slate-800 dark:border-slate-700 shadow-lg py-1 min-w-[160px]'
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className='w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-200 flex items-center gap-2'
            onClick={() => handleEditLembar(contextMenu.idx)}
          >
            <Edit2 className='h-3.5 w-3.5' /> Edit Lembar {contextMenu.idx + 1}
          </button>
          <button
            className='w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center gap-2'
            onClick={() => handleDeleteLembar(contextMenu.idx)}
          >
            <Trash2 className='h-3.5 w-3.5' /> Hapus Lembar {contextMenu.idx + 1}
          </button>
        </div>
      )}

      {/* Ledger sheet - per tanggal (per lembar) */}
      <div className='print-target'>
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-blue-700'>
            {sheetLabel || `Belum ada data untuk tahun ${tahunAktif}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm border-collapse'>
              <thead>
                <tr className='border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700'>
                  <th className='px-3 py-2 border border-slate-300 dark:border-slate-600 text-center font-semibold text-xs w-16 dark:text-white'>No</th>
                  <th className='px-3 py-2 border border-slate-300 dark:border-slate-600 text-center font-semibold text-xs w-36 dark:text-white'>Tanggal</th>
                  <th className='px-3 py-2 border border-slate-300 dark:border-slate-600 text-left font-semibold text-xs dark:text-white'>Uraian</th>
                  <th className='px-3 py-2 border border-slate-300 dark:border-slate-600 text-center font-semibold text-xs w-32 dark:text-white'>Kode Anggaran</th>
                  <th className='px-3 py-2 border border-slate-300 dark:border-slate-600 text-right font-semibold text-xs w-28 dark:text-white'>Penerimaan</th>
                  <th className='px-3 py-2 border border-slate-300 dark:border-slate-600 text-right font-semibold text-xs w-28 dark:text-white'>Pengeluaran</th>
                  <th className='px-3 py-2 border border-slate-300 dark:border-slate-600 text-left font-semibold text-xs w-20 print-hidden dark:text-white'>Aksi</th>
                </tr>
              </thead>
              <tbody className='dark:text-slate-200'>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className='py-12 text-center text-slate-400'>
                      {doorscrieftTransaksis.filter((r) => new Date(r.tanggal).getFullYear() === tahunAktif).length === 0
                        ? `Belum ada data untuk tahun ${tahunAktif}. Klik "Tambah" atau "Lembar" untuk mulai input.`
                        : 'Tidak ada transaksi pada tanggal ini.'}
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredRows.map((r, idx) => (
                      <tr key={r.id} className='border-b hover:bg-slate-50 dark:hover:bg-slate-700 dark:border-slate-700'>
                        <td className='px-3 py-2 border-r dark:border-slate-600 font-mono text-xs text-slate-500 dark:text-slate-400 w-16 text-center'>{r.no || idx + 1}</td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 whitespace-nowrap w-36 text-xs text-center'>
                          {formatDateDisplay(new Date(r.tanggal).toISOString().split('T')[0])}
                        </td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 text-xs'>{r.uraian}</td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 text-xs text-center'>{r.kodeAnggaran}</td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 text-right text-green-600 dark:text-green-400 font-medium text-xs w-28'>
                          {Number(r.penerimaan || 0) > 0 ? formatCurrency(Number(r.penerimaan)) : ''}
                        </td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 text-right text-red-600 dark:text-red-400 font-medium text-xs w-28'>
                          {Number(r.pengeluaran || 0) > 0 ? formatCurrency(Number(r.pengeluaran)) : ''}
                        </td>
                        <td className='px-3 py-2 text-right w-20 print-hidden'>
                          <div className='flex justify-end gap-1'>
                            <Button variant='ghost' size='icon' className='h-6 w-6' onClick={() => handleEdit(r)}>
                              <Edit2 className='h-3.5 w-3.5' />
                            </Button>
                            <Button variant='ghost' size='icon' className='h-6 w-6' onClick={() => handleDelete(r.id)}>
                              <Trash2 className='h-3.5 w-3.5 text-red-500' />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* Summary rows - matching Excel formula pattern */}
                    <tr className='bg-slate-50 dark:bg-slate-700 dark:text-white'>
                      <td colSpan={4} className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-xs'>
                        JUMLAH TANGGAL HARI INI{' '}
                        <span className='font-normal text-slate-400 dark:text-slate-500 text-[10px]' title='SUM of data rows'>=SUM(...)</span>
                      </td>
                      <td className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-green-700 dark:text-green-400 text-xs'>
                        {formatCurrency(summary.harian.p)}
                      </td>
                      <td className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-red-700 dark:text-red-400 text-xs'>
                        {formatCurrency(summary.harian.q)}
                      </td>
                      <td className='px-3 py-1.5 print-hidden'></td>
                    </tr>
                    <tr className='bg-slate-50 dark:bg-slate-700 dark:text-white'>
                      <td colSpan={4} className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-xs'>
                        JUMLAH S/D TANGGAL{' '}
                        <span className='font-normal text-slate-400 dark:text-slate-500 text-[10px]' title='Cumulative total for this lembar'>
                          {activeLembar > 0 ? `=E${dateGroups.slice(0, activeLembar).reduce((acc, [, rows], i) => acc + rows.length + 4, 1)}` : '=E2'}
                        </span>
                      </td>
                      <td className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-green-700 dark:text-green-400 text-xs'>
                        {formatCurrency(summary.sD.p)}
                      </td>
                      <td className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-red-700 dark:text-red-400 text-xs'>
                        {formatCurrency(summary.sD.q)}
                      </td>
                      <td className='px-3 py-1.5 print-hidden'></td>
                    </tr>
                    <tr className='bg-slate-50 dark:bg-slate-700 dark:text-white border-b-2 border-slate-400 dark:border-slate-500'>
                      <td colSpan={4} className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-xs'>
                        TOTAL{' '}
                        <span className='font-normal text-slate-400 dark:text-slate-500 text-[10px]' title='JUMLAH S/D + JUMLAH HARI INI'>=S/D+HARI INI</span>
                      </td>
                      <td className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-green-700 dark:text-green-400 text-xs'>
                        {formatCurrency(summary.total.p)}
                      </td>
                      <td className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-red-700 dark:text-red-400 text-xs'>
                        {formatCurrency(summary.total.q)}
                      </td>
                      <td className='px-3 py-1.5 print-hidden'></td>
                    </tr>
                    <tr className='border-b-2 border-slate-400 dark:border-slate-500'>
                      <td colSpan={4} className='px-3 py-2 border-r dark:border-slate-600 text-right font-bold text-xs'>
                        SISA
                      </td>
                      <td className='px-3 py-2 border-r dark:border-slate-600' colSpan={2}>
                        <span className={`font-bold text-sm ${sisa >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'}`}>
                          {formatCurrency(sisa)}
                        </span>
                      </td>
                      <td className='px-3 py-2 print-hidden'></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Input Dialog - bisa di-drag dan ada toggle lembar baru */}
      <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setEditingId(null);
          setForm({ ...initialForm, no: nextNomor });
          setKodeSearch('');
          inputLembarIdRef.current = null;
          pendingNewLembarIdRef.current = null;
        }
      }} draggable>
        <DialogContent>
          <DialogHeader>
            <div className='flex items-center justify-between'>
              <DialogTitle>{editingId ? 'Edit Doorscrieft' : 'Tambah Doorscrieft'}</DialogTitle>
              <div className='flex items-center gap-1'>
                {!editingId && dateGroups.length > 0 && (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-6 text-xs'
                    onClick={handleAddLembarLanjutan}
                    title='Tambah lembar baru'
                  >
                    <Plus className='mr-1 h-3.5 w-3.5' /> Lembar
                  </Button>
                )}
                {!editingId && (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-6 text-xs'
                    onClick={moveCurrentDialogToExternalWindow}
                    title='Pindahkan input ke window luar'
                  >
                    <ExternalLink className='mr-1 h-3.5 w-3.5' /> Window
                  </Button>
                )}
                <Button variant='ghost' size='icon' className='h-6 w-6' onClick={() => setIsOpen(false)}>
                  <X className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className='space-y-3'>
            <div className='grid grid-cols-2 gap-3'>
              <Input
                label='No'
                value={form.no}
                onChange={(e) => setForm({ ...form, no: e.target.value })}
                placeholder='Contoh: 1'
                required
                ref={noInputRef}
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

            <div className='space-y-2'>
              <div className='relative'>
                <Input
                  label='Kode Anggaran'
                  value={form.kodeAnggaran}
                  placeholder='Ketik kode anggaran...'
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((prev) => ({ ...prev, kodeAnggaran: v }));
                    setKodeSearch(v);
                    setKodeDropdownOpen(true);
                    setKodeHighlightIdx(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); handleKodeArrowDown(); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); handleKodeArrowUp(); }
                    else if (e.key === 'Enter') { e.preventDefault(); handleKodeSelect(); }
                    else if (e.key === 'Escape') { e.preventDefault(); handleKodeClose(); }
                  }}
                  onFocus={() => {
                    if (form.kodeAnggaran.trim().length > 0 && displayedMaster.length > 0) {
                      setKodeDropdownOpen(true);
                      setKodeHighlightIdx(0);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setKodeDropdownOpen(false), 150);
                  }}
                  required
                  className='font-mono text-xs'
                />

                {kodeDropdownOpen && form.kodeAnggaran.trim().length > 0 && (
                  <div className='absolute z-50 mt-1 w-full rounded-lg border bg-white dark:bg-slate-800 dark:border-slate-700 shadow-lg overflow-hidden'>
                    <div className='p-2 border-b dark:border-slate-700'>
                      <div className='text-xs text-slate-500 dark:text-slate-400'>Pencarian otomatis</div>
                    </div>
                    <div ref={dropdownScrollRef} className='max-h-56 overflow-y-auto'>
                      {displayedMaster.length === 0 ? (
                        <div className='p-3 text-sm text-slate-500 dark:text-slate-400'>Tidak ada hasil</div>
                      ) : (
                        displayedMaster.map((m, idx) => (
                          <button
                            key={m.kodeAnggaran}
                            type='button'
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              idx === kodeHighlightIdx ? 'bg-blue-100 dark:bg-blue-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                            onClick={() => {
                              setKodeHighlightIdx(idx);
                              handleKodeSelect();
                            }}
                            onMouseEnter={() => setKodeHighlightIdx(idx)}
                          >
                            <div className='font-mono text-xs dark:text-slate-200'>{m.kodeAnggaran}</div>
                            <div className='text-xs text-slate-600 dark:text-slate-400 truncate'>{m.mataAnggaran}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className='space-y-1'>
                <label className='text-sm font-medium leading-none text-gray-700 dark:text-slate-200'>Mata Anggaran</label>
                <div className='h-10 flex items-center rounded-md border border-gray-300 bg-slate-50 px-3 text-sm text-slate-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'>
                  {form.mataAnggaran || '-'}
                </div>
              </div>
            </div>

            {/* Badge: jenis anggaran */}
            {form.kodeAnggaran.startsWith('I.') && (
              <div className='flex items-center gap-2'>
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'>
                  Pendapatan
                </span>
                <span className='text-xs text-slate-400'>— hanya kolom Penerimaan aktif</span>
              </div>
            )}
            {form.kodeAnggaran.startsWith('II.') && (
              <div className='flex items-center gap-2'>
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'>
                  Pengeluaran
                </span>
                <span className='text-xs text-slate-400'>— hanya kolom Pengeluaran aktif</span>
              </div>
            )}

            <div className='grid grid-cols-2 gap-3'>
              <Input
                label='Penerimaan'
                type='text'
                value={form.penerimaan}
                disabled={form.kodeAnggaran.startsWith('II.')}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d,.-]/g, '');
                  setForm({ ...form, penerimaan: raw });
                }}
                onBlur={(e) => {
                  const cleaned = e.target.value.replace(/[.\s]/g, '').replace(/,/g, '');
                  if (cleaned) {
                    setForm({ ...form, penerimaan: cleaned });
                  }
                }}
                className={form.kodeAnggaran.startsWith('II.') ? 'opacity-50' : ''}
              />
              <Input
                label='Pengeluaran'
                type='text'
                value={form.pengeluaran}
                disabled={form.kodeAnggaran.startsWith('I.')}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d,.-]/g, '');
                  setForm({ ...form, pengeluaran: raw });
                }}
                onBlur={(e) => {
                  const cleaned = e.target.value.replace(/[.\s]/g, '').replace(/,/g, '');
                  if (cleaned) {
                    setForm({ ...form, pengeluaran: cleaned });
                  }
                }}
                className={form.kodeAnggaran.startsWith('I.') ? 'opacity-50' : ''}
              />
            </div>

            <DialogFooter>
              <Button type='submit'>{editingId ? 'Simpan' : 'Tambah'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
