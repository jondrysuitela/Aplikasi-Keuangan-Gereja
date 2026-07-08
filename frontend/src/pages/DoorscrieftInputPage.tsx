import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { Search, Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight, Trash, Download, Upload, CalendarDays, Lock, Printer, Paperclip, Eye, FolderOpen } from 'lucide-react';
import type { KodeAnggaranItem, DoorscrieftRowInput, TransactionAttachment } from '@/types';
import { toast } from 'sonner';
import { createAutoBackup } from '@/lib/projectSnapshot';
import { getDoorscrieftValidationIssues, summarizeValidationForExport } from '@/lib/dataValidation';
import { can } from '@/lib/permissions';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getElectronAPI } from '@/lib/electron';
import { printWithPageSetup } from '@/lib/print';
import { YearLockedBanner } from '@/components/YearLockedBanner';
import { AppStateMessage } from '@/components/AppStateMessage';

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function toDateInputValue(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('en-CA');
  return date.toLocaleDateString('en-CA');
}

function formatIndonesianDate(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal belum valid';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function parseNominalInput(value: string | number | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  return Number(String(value || '').replace(/[.\s]/g, '').replace(/,/g, '') || 0);
}

function formatAttachmentSize(size?: number) {
  if (!size || size <= 0) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatNumberInput(val: string) {
  if (!val) return '';
  const digits = val.replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

const URAIAN_STOP_WORDS = new Set([
  'dan',
  'atau',
  'yang',
  'untuk',
  'dari',
  'dengan',
  'pada',
  'kepada',
  'oleh',
  'atas',
  'dalam',
  'bulan',
  'tanggal',
  'tgl',
  'rp',
]);

function tokenizeUraian(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !URAIAN_STOP_WORDS.has(word));
}

type DoorscrieftPreviewRow = Partial<DoorscrieftRowInput> & { tanggal?: string; lembarId?: string; bulan?: number };

type DoorscrieftImportPreview = {
  fileName: string;
  path: string;
  sheetCount: number;
  sheetNames: string[];
  detectedSheetName: string;
  detectedMonths: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  emptyRows: number;
  totalNominal: number;
  warnings: string[];
  errors: string[];
  rows: DoorscrieftPreviewRow[];
};

type UraianHistorySuggestion = {
  uraian: string;
  kodeAnggaran: string;
  mataAnggaran: string;
  count: number;
  lastTanggal: Date;
};

const initialForm = {
  tanggal: toDateInputValue(new Date()),
  no: '',
  uraian: '',
  kodeAnggaran: '',
  mataAnggaran: '',
  penerimaan: '',
  pengeluaran: '',
};

export function DoorscrieftInputPage() {
  const {
    user,
    tahunAktif,
    lockedYears,
    kodeAnggarans,
    setKodeAnggarans,
    doorscrieftTransaksis,
    addDoorscrieftTransaksi,
    updateDoorscrieftTransaksi,
    deleteDoorscrieftTransaksi,
    setDoorscrieftTransaksis,
    addAuditLog,
  } = useStore();
  const isYearLocked = lockedYears.includes(tahunAktif);
  const canInput = can(user?.role, 'input');
  const canImport = can(user?.role, 'import');
  const canDelete = can(user?.role, 'delete');
  const canAttachProof = can(user?.role, 'attachment');
  const confirm = useConfirm();

  const showLockedYearMessage = useCallback(() => {
    toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk mengubah data.`);
  }, [tahunAktif]);

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

  const handleUndo = useCallback(() => {
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    const snapshot = undoHistoryRef.current.pop();
    if (!snapshot) {
      toast.info('Tidak ada aksi yang bisa di-undo.');
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
    addAuditLog('Undo Doorscrieft', 'Doorscrieft', `${restored.length} baris dipulihkan`);
  }, [addAuditLog, isYearLocked, setDoorscrieftTransaksis, showLockedYearMessage]);

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
  }, [handleUndo]);


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

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 150);
  const [kodeSearch, setKodeSearch] = useState('');
  const debouncedKodeSearch = useDebouncedValue(kodeSearch, 150);
  const [hiddenSuggestionForUraian, setHiddenSuggestionForUraian] = useState('');
  const [uraianHistoryHighlightIdx, setUraianHistoryHighlightIdx] = useState(0);

  const kodeAnggaranMap = useMemo(() => {
    return new Map(kodeAnggarans.map((item) => [item.kodeAnggaran, item]));
  }, [kodeAnggarans]);
  const kodeAnggaranInputItems = useMemo(() => {
    return kodeAnggarans.filter((item) => item.aktifInput !== false && item.jenisKode !== 'judul');
  }, [kodeAnggarans]);

  // --- Input dialog state ---
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<DoorscrieftImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printSettings, setPrintSettings] = useState({
    paper: '',
    orientation: 'portrait',
    margin: 10,
    scale: 100,
  });
  const noInputRef = useRef<HTMLInputElement>(null);
  const uraianInputRef = useRef<HTMLInputElement>(null);
  const penerimaanInputRef = useRef<HTMLInputElement>(null);
  const pengeluaranInputRef = useRef<HTMLInputElement>(null);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const modalDragRef = useRef({ dragging: false, pointerId: -1, startX: 0, startY: 0, baseX: 0, baseY: 0 });

  const handleModalDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button,input,select,textarea,a')) return;

    modalDragRef.current = {
      dragging: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: modalOffset.x,
      baseY: modalOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleModalDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = modalDragRef.current;
    if (!drag.dragging || drag.pointerId !== event.pointerId) return;
    const maxX = Math.max(0, (window.innerWidth - 620) / 2 - 16);
    const maxY = Math.max(0, window.innerHeight - 180);
    const nextX = drag.baseX + event.clientX - drag.startX;
    const nextY = drag.baseY + event.clientY - drag.startY;
    setModalOffset({
      x: Math.max(-maxX, Math.min(maxX, nextX)),
      y: Math.max(0, Math.min(maxY, nextY)),
    });
  };

  const handleModalDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = modalDragRef.current;
    if (drag.pointerId === event.pointerId) {
      modalDragRef.current = { ...drag, dragging: false, pointerId: -1 };
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // Lembar aktif (index unique lembarId groups)
  const [activeLembar, setActiveLembar] = useState(0);
  const [jumpLembarValue, setJumpLembarValue] = useState('1');
  // Per-lembar labels (editable)
  const [lembarLabels, setLembarLabels] = useState<Record<string, string>>({});
  // Track lembarId targeted by the currently open input dialog.
  const inputLembarIdRef = useRef<string | null>(null);
  // Backward-compatible alias for pending new lembar state used by close/reset logic.
  const pendingNewLembarIdRef = useRef<string | null>(null);
  const defaultedYearRef = useRef<number | null>(null);

  // All rows filtered by tahunAktif. Keep store/import order so imported Excel
  // worksheet blocks stay aligned with the original Doorscrieft lembar order.
  const allRows = useMemo(() => {
    return doorscrieftTransaksis
      .filter((r: DoorscrieftRowInput) => new Date(r.tanggal).getFullYear() === tahunAktif);
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
    if (dateGroups.length === 0) {
      defaultedYearRef.current = null;
      setActiveLembar(0);
      return;
    }
    if (defaultedYearRef.current !== tahunAktif) {
      defaultedYearRef.current = tahunAktif;
      setActiveLembar(dateGroups.length - 1);
      return;
    }
    if (activeLembar >= dateGroups.length) {
      setActiveLembar(dateGroups.length - 1);
    }
  }, [dateGroups.length, activeLembar, tahunAktif]);

  useEffect(() => {
    setJumpLembarValue(String(activeLembar + 1));
  }, [activeLembar]);

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

  // Per-lembar totals: first lembar starts from zero, subsequent lembar continues
  // from previous lembar total. No automatic previous-year balance.
  const lembarTotals = useMemo(() => {
    const totals: { harianP: number; harianQ: number; sDP: number; sDQ: number; totalP: number; totalQ: number }[] = [];

    for (let i = 0; i < dateGroups.length; i++) {
      const [, rows] = dateGroups[i];
      const harianP = rows.reduce((s, r) => s + Number(r.penerimaan || 0), 0);
      const harianQ = rows.reduce((s, r) => s + Number(r.pengeluaran || 0), 0);

      const sDP = i === 0 ? 0 : totals[i - 1].totalP;
      const sDQ = i === 0 ? 0 : totals[i - 1].totalQ;

      totals.push({ harianP, harianQ, sDP, sDQ, totalP: sDP + harianP, totalQ: sDQ + harianQ });
    }

    return totals;
  }, [dateGroups]);

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

  const getInputDateForLembarIndex = useCallback((lembarIndex: number) => {
    const rows = dateGroups[lembarIndex]?.[1] || [];
    if (rows.length > 0) {
      const latest = rows.reduce((max, row) => {
        const time = new Date(row.tanggal).getTime();
        return Number.isFinite(time) && time > max ? time : max;
      }, -Infinity);

      if (Number.isFinite(latest)) {
        return toDateInputValue(new Date(latest));
      }
    }

    return toDateInputValue(new Date(tahunAktif, 0, 1));
  }, [dateGroups, tahunAktif]);

  const activeLembarInputDate = useMemo(() => {
    return getInputDateForLembarIndex(activeLembar);
  }, [activeLembar, getInputDateForLembarIndex]);

  const selectedDateLabel = useMemo(() => {
    return formatIndonesianDate(form.tanggal);
  }, [form.tanggal]);

  // Kode anggaran master search
  const filteredMaster = useMemo(() => {
    const q = debouncedKodeSearch.trim().toLowerCase();
    if (!q) return kodeAnggaranInputItems;
    return kodeAnggaranInputItems.filter((k) => {
      return (
        (k.kodeAnggaran || '').toLowerCase().includes(q) ||
        (k.mataAnggaran || '').toLowerCase().includes(q)
      );
    });
  }, [kodeAnggaranInputItems, debouncedKodeSearch]);

  // Arrow key navigation state for Kode Anggaran dropdown
  const [kodeDropdownOpen, setKodeDropdownOpen] = useState(false);
  const [kodeHighlightIdx, setKodeHighlightIdx] = useState(-1);
  const displayedMaster = filteredMaster.slice(0, 30);
  const dropdownScrollRef = useRef<HTMLDivElement>(null);

  const applyKodeAnggaran = (item: KodeAnggaranItem) => {
    setForm((prev) => ({ ...prev, kodeAnggaran: item.kodeAnggaran, mataAnggaran: item.mataAnggaran }));
    setKodeSearch(item.kodeAnggaran);
    setKodeDropdownOpen(false);
    setKodeHighlightIdx(-1);
  };

  const handleKodeAnggaranInputChange = (value: string) => {
    const kode = value.trim();
    const master = kodeAnggaranMap.get(kode);
    setForm((prev) => ({
      ...prev,
      kodeAnggaran: value,
      mataAnggaran: master?.mataAnggaran || '',
    }));
    setKodeSearch(value);
    setKodeDropdownOpen(true);
    setKodeHighlightIdx(0);
  };

  const uraianHistorySuggestions = useMemo<UraianHistorySuggestion[]>(() => {
    const query = form.uraian.trim().toLowerCase();
    if (query.length < 2) return [];

    const tokens = tokenizeUraian(form.uraian);
    const history = new Map<string, UraianHistorySuggestion & { score: number }>();

    doorscrieftTransaksis.forEach((row) => {
      const kode = String(row.kodeAnggaran || '').trim();
      const uraian = String(row.uraian || '').trim();
      if (!kode || !uraian) return;

      const normalizedUraian = uraian.toLowerCase();
      const master = kodeAnggaranMap.get(kode);
      const mataAnggaran = master?.mataAnggaran || String(row.mataAnggaran || '').trim();
      if (!mataAnggaran) return;

      let score = 0;
      if (normalizedUraian === query) score += 60;
      else if (normalizedUraian.startsWith(query)) score += 40;
      else if (normalizedUraian.includes(query)) score += 24;

      tokens.forEach((token) => {
        if (normalizedUraian.includes(token)) score += 4;
      });

      if (score <= 0) return;

      const tanggal = new Date(row.tanggal);
      const lastTanggal = Number.isNaN(tanggal.getTime()) ? new Date(0) : tanggal;
      const key = `${normalizedUraian}|||${kode}`;
      const current = history.get(key);
      if (!current) {
        history.set(key, {
          uraian,
          kodeAnggaran: kode,
          mataAnggaran,
          count: 1,
          lastTanggal,
          score,
        });
        return;
      }
      current.count += 1;
      current.score += score;
      if (lastTanggal.getTime() > current.lastTanggal.getTime()) current.lastTanggal = lastTanggal;
    });

    return Array.from(history.values())
      .sort((a, b) => b.score - a.score || b.count - a.count || b.lastTanggal.getTime() - a.lastTanggal.getTime())
      .slice(0, 6)
      .map(({ score: _score, ...item }) => item);
  }, [doorscrieftTransaksis, form.uraian, kodeAnggaranMap]);

  const showUraianHistorySuggestions = uraianHistorySuggestions.length > 0 && hiddenSuggestionForUraian !== form.uraian;

  const focusNominalForKode = (kode: string) => {
    window.requestAnimationFrame(() => {
      if (kode.startsWith('I.')) {
        penerimaanInputRef.current?.focus();
        penerimaanInputRef.current?.select();
        return;
      }
      if (kode.startsWith('II.')) {
        pengeluaranInputRef.current?.focus();
        pengeluaranInputRef.current?.select();
        return;
      }
      penerimaanInputRef.current?.focus();
      penerimaanInputRef.current?.select();
    });
  };

  const applyUraianHistorySuggestion = (item: UraianHistorySuggestion) => {
    setForm((prev) => ({
      ...prev,
      uraian: item.uraian,
      kodeAnggaran: item.kodeAnggaran,
      mataAnggaran: item.mataAnggaran,
      penerimaan: item.kodeAnggaran.startsWith('II.') ? '' : prev.penerimaan,
      pengeluaran: item.kodeAnggaran.startsWith('I.') ? '' : prev.pengeluaran,
    }));
    setKodeSearch(item.kodeAnggaran);
    setKodeDropdownOpen(false);
    setKodeHighlightIdx(-1);
    setHiddenSuggestionForUraian(item.uraian);
    focusNominalForKode(item.kodeAnggaran);
  };

  const handleUraianHistorySelect = () => {
    if (!showUraianHistorySuggestions) return false;
    const selected = uraianHistorySuggestions[Math.max(0, Math.min(uraianHistoryHighlightIdx, uraianHistorySuggestions.length - 1))];
    if (!selected) return false;
    applyUraianHistorySuggestion(selected);
    return true;
  };

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
      applyKodeAnggaran(selected);
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
    const hit = kodeAnggaranMap.get(kode);
    if (!hit) {
      toast.error('Kode anggaran tidak valid (tidak ada di DATA BASE2).');
      return null;
    }
    if (hit.jenisKode === 'judul' || hit.aktifInput === false) {
      toast.error('Kode anggaran ini adalah Judul.', {
        description: 'Pilih kode Isi untuk input uang.',
      });
      return null;
    }
    return hit;
  };

  const submitDoorscrieftForm = (
    formData = form,
    targetLembarIdOverride?: string | null,
    resetLocalForm = true,
  ): boolean => {
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin input data.');
      return false;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return false;
    }

    const tanggal = new Date(formData.tanggal);
    const no = String(formData.no || '').trim();
    const uraian = String(formData.uraian || '').trim();
    const kode = String(formData.kodeAnggaran || '').trim();
    const penerimaan = parseNominalInput(formData.penerimaan);
    const pengeluaran = parseNominalInput(formData.pengeluaran);

    if (Number.isNaN(tanggal.getTime())) {
      toast.error('Tanggal transaksi belum valid.');
      return false;
    }
    if (tanggal.getFullYear() !== tahunAktif) {
      toast.error(`Tanggal harus berada pada tahun aktif ${tahunAktif}.`);
      return false;
    }
    if (!no || !uraian) {
      toast.error('No dan uraian wajib diisi.');
      return false;
    }
    if (penerimaan <= 0 && pengeluaran <= 0) {
      toast.error('Isi nominal penerimaan atau pengeluaran.');
      return false;
    }
    if (penerimaan > 0 && pengeluaran > 0) {
      toast.error('Satu baris Doorscrieft hanya boleh berisi penerimaan atau pengeluaran.');
      return false;
    }
    if (penerimaan < 0 || pengeluaran < 0) {
      toast.error('Nominal tidak boleh bernilai negatif.');
      return false;
    }

    const mata = validateKodeAnggaran(kode);
    if (!mata) return false;

    // Determine which lembar this row belongs to. Keep the dialog target stable
    // so consecutive inputs after creating a new lembar stay in that new lembar.
    const currentLembarId = activeLembarId || '';
    const targetLembarId = targetLembarIdOverride || inputLembarIdRef.current || currentLembarId || 'default';
    inputLembarIdRef.current = targetLembarId;

    const payload = {
      no,
      tanggal,
      uraian,
      kodeAnggaran: kode,
      mataAnggaran: mata.mataAnggaran,
      penerimaan,
      pengeluaran,
      updatedAt: new Date(),
      createdBy: user?.username || 'system',
      lembarId: targetLembarId,
    } as Omit<DoorscrieftRowInput, 'id' | 'createdAt'>;

    if (editingId) {
      pushUndoSnapshot();
      updateDoorscrieftTransaksi(editingId, payload);
    } else {
      // Nomor berikutnya = nomor yang baru diinput + 1
      const lastNo = Number(formData.no) || 0;
      const newNo = String(lastNo + 1);

      pushUndoSnapshot();
      addDoorscrieftTransaksi(payload);

      setEditingId(null);
      setKodeSearch('');
      if (resetLocalForm) {
        // Reset form tapi tetap buka dialog untuk input berikutnya
        setForm({
          tanggal: formData.tanggal,
          no: newNo,
          uraian: '',
          kodeAnggaran: '',
          mataAnggaran: '',
          penerimaan: '',
          pengeluaran: '',
        });
      }
    }

    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const snapshot = { ...form };
    const wasEditing = Boolean(editingId);
    const nextNoAfterSave = String((Number(snapshot.no) || 0) + 1);

    setIsSubmitting(true);
    window.setTimeout(() => {
      try {
        const saved = submitDoorscrieftForm(snapshot, undefined, false);
        if (saved) {
          setKodeDropdownOpen(false);
          setKodeHighlightIdx(-1);
          setKodeSearch('');

          if (wasEditing) {
            setIsOpen(false);
            setEditingId(null);
            toast.success('Data Doorscrieft diperbarui.');
          } else {
            setForm({
              tanggal: snapshot.tanggal,
              no: nextNoAfterSave,
              uraian: '',
              kodeAnggaran: '',
              mataAnggaran: '',
              penerimaan: '',
              pengeluaran: '',
            });
            toast.success('Data Doorscrieft disimpan.');
            window.requestAnimationFrame(() => {
              noInputRef.current?.focus();
              noInputRef.current?.select();
            });
          }
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Data Doorscrieft gagal disimpan.');
      } finally {
        setIsSubmitting(false);
      }
    }, 0);
  };

  const handleEdit = (item: DoorscrieftRowInput) => {
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin edit data.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    setEditingId(item.id);
    inputLembarIdRef.current = item.lembarId || null;
    pendingNewLembarIdRef.current = null;
    setForm({
      tanggal: toDateInputValue(item.tanggal),
      no: String(item.no || ''),
      uraian: item.uraian || '',
      kodeAnggaran: item.kodeAnggaran || '',
      mataAnggaran: item.mataAnggaran || '',
      penerimaan: item.penerimaan ? String(item.penerimaan).replace(/[.\s]/g, '').replace(/,/g, '') : '',
      pengeluaran: item.pengeluaran ? String(item.pengeluaran).replace(/[.\s]/g, '').replace(/,/g, '') : '',
    });
    setKodeSearch(item.kodeAnggaran || '');
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      noInputRef.current?.focus();
      noInputRef.current?.select();
    });
  };

  const closeInputPanel = () => {
    setIsOpen(false);
    setEditingId(null);
    setIsSubmitting(false);
    setForm({ ...initialForm, tanggal: activeLembarInputDate, no: nextNomor });
    setKodeSearch('');
    setKodeDropdownOpen(false);
    setKodeHighlightIdx(-1);
    inputLembarIdRef.current = null;
    pendingNewLembarIdRef.current = null;
  };

  const handleStartInputCurrentLembar = () => {
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin input data.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    let targetLembarId = activeLembarId;
    if (!targetLembarId) {
      targetLembarId = generateId();
      setLembarLabels((prev) => ({ ...prev, [targetLembarId]: 'Lembar 1' }));
      pendingNewLembarIdRef.current = targetLembarId;
    } else {
      pendingNewLembarIdRef.current = null;
    }

    inputLembarIdRef.current = targetLembarId;
    setEditingId(null);
    setForm({ ...initialForm, tanggal: activeLembarInputDate, no: nextNomor });
    setKodeSearch('');
    setKodeDropdownOpen(false);
    setKodeHighlightIdx(-1);
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      noInputRef.current?.focus();
      noInputRef.current?.select();
    });
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) {
      toast.error('Role Anda tidak memiliki izin menghapus data.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    const lanjut = await confirm({
      title: 'Hapus baris Doorscrieft?',
      description: 'Baris yang dihapus masih bisa dipulihkan lewat Undo selama sesi ini.',
      confirmText: 'Hapus Baris',
      tone: 'danger',
    });
    if (!lanjut) return;
    pushUndoSnapshot();
    deleteDoorscrieftTransaksi(id);
    addAuditLog('Hapus Baris Doorscrieft', 'Doorscrieft', id, id);
    toast.success('Baris Doorscrieft dihapus.');
  };

  const handleAddAttachment = async (row: DoorscrieftRowInput) => {
    if (!canAttachProof) {
      toast.error('Role Anda tidak memiliki izin menambah bukti.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    const electronAPI = getElectronAPI();
    if (!electronAPI?.addTransactionAttachment) {
      toast.error('Lampiran bukti hanya tersedia di aplikasi desktop Electron.');
      return;
    }
    const result = await electronAPI.addTransactionAttachment();
    if (!result.success) {
      if (!result.canceled) toast.error(result.error || 'Gagal menambahkan bukti transaksi.');
      return;
    }
    if (!result.attachment) {
      toast.error('File bukti tidak terbaca.');
      return;
    }

    const attachment: TransactionAttachment = {
      ...result.attachment,
      createdAt: new Date(result.attachment.createdAt),
      createdBy: user?.username || 'system',
    };
    pushUndoSnapshot();
    updateDoorscrieftTransaksi(row.id, {
      attachments: [...(row.attachments || []), attachment],
    });
    addAuditLog('Tambah Bukti Transaksi', 'Doorscrieft', `${row.no || row.id} - ${attachment.fileName}`, row.id);
    toast.success('Bukti transaksi ditambahkan.', {
      description: attachment.fileName,
    });
  };

  const handleOpenAttachment = async (attachment: TransactionAttachment) => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.openAttachment) {
      toast.error('Buka lampiran hanya tersedia di aplikasi desktop Electron.');
      return;
    }
    const result = await electronAPI.openAttachment(attachment.storedPath);
    if (!result.success) toast.error(result.error || 'File lampiran tidak bisa dibuka.');
  };

  const handleShowAttachmentInFolder = async (attachment: TransactionAttachment) => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.showAttachmentInFolder) {
      toast.error('Buka folder lampiran hanya tersedia di aplikasi desktop Electron.');
      return;
    }
    const result = await electronAPI.showAttachmentInFolder(attachment.storedPath);
    if (!result.success) toast.error(result.error || 'Folder lampiran tidak bisa dibuka.');
  };

  const handleRemoveAttachment = async (row: DoorscrieftRowInput, attachment: TransactionAttachment) => {
    if (!canAttachProof) {
      toast.error('Role Anda tidak memiliki izin menghapus bukti.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    const lanjut = await confirm({
      title: 'Hapus lampiran bukti?',
      description: `Lampiran "${attachment.fileName}" akan dilepas dari transaksi ini. File fisiknya tetap tersimpan di folder lampiran.`,
      confirmText: 'Hapus Lampiran',
      tone: 'danger',
    });
    if (!lanjut) return;
    pushUndoSnapshot();
    updateDoorscrieftTransaksi(row.id, {
      attachments: (row.attachments || []).filter((item) => item.id !== attachment.id),
    });
    addAuditLog('Hapus Bukti Transaksi', 'Doorscrieft', `${row.no || row.id} - ${attachment.fileName}`, row.id);
    toast.success('Lampiran bukti dilepas dari transaksi.');
  };

  // --- Export to Excel (all lembar, separated per lembar) ---
  const handleExportExcel = async () => {
    const electronAPI = getElectronAPI();
    const validation = summarizeValidationForExport(
      getDoorscrieftValidationIssues(doorscrieftTransaksis, kodeAnggarans, tahunAktif),
    );

    if (validation.errors > 0) {
      const lanjut = await confirm({
        title: 'Export dengan data bermasalah?',
        description: `Ditemukan ${validation.errors} error data dan ${validation.warnings} peringatan. Pilih Batal untuk membuka halaman Cek Data.`,
        confirmText: 'Tetap Export',
        tone: 'warning',
      });
      if (!lanjut) {
        window.location.hash = '#/cek-data';
        return;
      }
    }

    // Build lembar data using the same logic as sidebar (lembarTotals)
    const lembars = dateGroups.map(([lembarId, rows], idx) => {
      const harianP = rows.reduce((s, r) => s + Number(r.penerimaan || 0), 0);
      const harianQ = rows.reduce((s, r) => s + Number(r.pengeluaran || 0), 0);

      // Use lembarTotals for correct per-lembar total chaining
      const sDP = lembarTotals[idx]?.sDP ?? 0;
      const sDQ = lembarTotals[idx]?.sDQ ?? 0;
      const totalP = lembarTotals[idx]?.totalP ?? (sDP + harianP);
      const totalQ = lembarTotals[idx]?.totalQ ?? (sDQ + harianQ);

      return {
        dateKey: lembarId,
        bulan: rows[0] ? new Date(rows[0].tanggal).getMonth() : undefined,
        monthName: rows[0]
          ? new Date(rows[0].tanggal).toLocaleDateString('id-ID', { month: 'long' }).toUpperCase()
          : 'BULAN',
        rows: rows.map((r: DoorscrieftRowInput) => ({
          no: r.no,
          tanggal: toDateInputValue(r.tanggal),
          uraian: r.uraian,
          kodeAnggaran: r.kodeAnggaran,
          mataAnggaran: r.mataAnggaran,
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
      kodeAnggarans,
      tahun: tahunAktif,
      monthName: sheetLabel || 'BULAN',
      fileName: `Doorscrieft_${tahunAktif}.xlsx`,
    };

    if (electronAPI?.exportDoorscrieftToExcel) {
      electronAPI.exportDoorscrieftToExcel(exportData).then((result) => {
        if (result.success) {
          addAuditLog('Export Doorscrieft', 'Excel', result.path || exportData.fileName, result.path || exportData.fileName);
          toast.success('Doorscrieft berhasil diexport.', { description: result.path || exportData.fileName });
        } else {
          toast.error(`Gagal export: ${result.error || 'Unknown error'}`);
        }
      }).catch(() => {
        exportFallbackCSV(exportData);
      });
    } else {
      exportFallbackCSV(exportData);
    }
  };

  const handlePrintActiveLembar = () => {
    if (dateGroups.length === 0) {
      toast.error('Tidak ada lembar Doorscrieft untuk diprint.');
      return;
    }

    setIsPrintDialogOpen(false);
    printWithPageSetup({
      title: `Doorscrieft_Lembar_${activeLembar + 1}_${tahunAktif}`,
      paper: printSettings.paper,
      orientation: printSettings.orientation as 'portrait' | 'landscape',
      marginMm: Number(printSettings.margin) || 10,
      scale: (Number(printSettings.scale) || 100) / 100,
      styleId: 'doorscrieft-print-settings',
    });
  };

  const handleImportExcel = async () => {
    if (!canImport) {
      toast.error('Role Anda tidak memiliki izin import Excel.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    const electronAPI = getElectronAPI();

    if (!electronAPI?.previewDoorscrieftImport) {
      toast.error('Import Excel tidak tersedia. Pastikan aplikasi berjalan di desktop Electron.');
      return;
    }

    setIsImporting(true);
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const result = await electronAPI.previewDoorscrieftImport({
        year: tahunAktif,
        validCodes: kodeAnggaranInputItems.map((item) => item.kodeAnggaran),
      });
      if (!result?.success) {
        if (!result?.canceled) toast.error(`Import gagal: ${result?.error || 'Error tidak diketahui'}`);
        return;
      }

      setPreviewResult(result as unknown as DoorscrieftImportPreview);
      setIsPreviewOpen(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Gagal membaca file Excel.';
      setPreviewError(message);
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!canImport) {
      toast.error('Role Anda tidak memiliki izin import Excel.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    if (!previewResult || previewResult.rows.length === 0) {
      toast.error('Tidak ada data valid untuk diimpor.');
      return;
    }

    await createAutoBackup('sebelum-import-doorscrieft');
    pushUndoSnapshot();
    const now = new Date();
    const skippedRows: number[] = [];
    const rows = previewResult.rows.flatMap((row, index) => {
      const kode = String(row.kodeAnggaran || '').trim();
      const master = kodeAnggaranMap.get(kode);
      const tanggal = row.tanggal ? new Date(row.tanggal) : new Date(tahunAktif, Number(row.bulan || 0), 1);
      const penerimaan = Number(row.penerimaan || 0);
      const pengeluaran = Number(row.pengeluaran || 0);

      if (!master || master.jenisKode === 'judul' || master.aktifInput === false || Number.isNaN(tanggal.getTime()) || tanggal.getFullYear() !== tahunAktif || (penerimaan <= 0 && pengeluaran <= 0) || (penerimaan > 0 && pengeluaran > 0)) {
        skippedRows.push(index + 1);
        return [];
      }

      return [{
        id: generateId(),
        no: String(row.no || ''),
        tanggal,
        uraian: String(row.uraian || ''),
        kodeAnggaran: kode,
        mataAnggaran: master.mataAnggaran || String(row.mataAnggaran || ''),
        penerimaan,
        pengeluaran,
        lembarId: row.lembarId || generateId(),
        bulan: typeof row.bulan === 'number' ? row.bulan : undefined,
        createdBy: user?.username || 'system',
        createdAt: now,
        updatedAt: now,
      } as DoorscrieftRowInput];
    });

    if (rows.length === 0) {
      toast.error('Tidak ada baris valid yang bisa diimpor.');
      return;
    }

    setDoorscrieftTransaksis([...doorscrieftTransaksis, ...rows]);
    addAuditLog('Import Doorscrieft', 'Excel', `${rows.length} baris dari ${previewResult.fileName || 'file Excel'}`, previewResult.path || previewResult.fileName || '');
    setIsPreviewOpen(false);
    setPreviewResult(null);
    toast.success(`Import berhasil: ${rows.length} baris Doorscrieft ditambahkan.`, {
      description: skippedRows.length > 0 ? `${skippedRows.length} baris dilewati karena tidak valid.` : undefined,
    });
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
    addAuditLog('Export Doorscrieft CSV', 'CSV', a.download, a.download);
  };

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
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin edit data.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    const [lembarId] = dateGroups[idx] || [];
    if (!lembarId) return;
    setEditingId(null);
    setActiveLembar(idx);
    inputLembarIdRef.current = lembarId;
    pendingNewLembarIdRef.current = null;
    setForm({
      ...initialForm,
      tanggal: getInputDateForLembarIndex(idx),
      no: nextNomor,
    });
    setKodeSearch('');
    setIsOpen(true);
    setContextMenu(null);
  };

  const handleDeleteLembar = async (idx: number) => {
    if (!canDelete) {
      toast.error('Role Anda tidak memiliki izin menghapus data.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    const [lembarId] = dateGroups[idx] || [];
    if (!lembarId) return;
    const label = lembarLabels[lembarId] || `Lembar ${idx + 1}`;
    const lanjut = await confirm({
      title: `Hapus semua data di ${label}?`,
      description: 'Semua baris pada lembar ini akan dihapus. Data masih bisa dipulihkan lewat Undo selama sesi ini.',
      confirmText: 'Hapus Lembar',
      tone: 'danger',
    });
    if (!lanjut) return;
    pushUndoSnapshot();
    const idsToDelete = dateGroups[idx][1].map((r: DoorscrieftRowInput) => r.id);
    idsToDelete.forEach((id: string) => deleteDoorscrieftTransaksi(id));
    // Navigate to previous lembar if current is deleted
    if (activeLembar >= dateGroups.length - 1) {
      setActiveLembar(Math.max(0, dateGroups.length - 2));
    }
    setContextMenu(null);
    toast.success(`${label} dihapus.`);
  };

  const handleHapusSemua = async () => {
    if (!canDelete) {
      toast.error('Role Anda tidak memiliki izin menghapus data.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
    const lanjut = await confirm({
      title: 'Hapus semua data Doorscrieft?',
      description: 'Auto-backup akan dibuat sebelum semua data Doorscrieft dihapus.',
      confirmText: 'Hapus Semua',
      tone: 'danger',
    });
    if (!lanjut) return;
    await createAutoBackup('sebelum-hapus-semua-doorscrieft');
    pushUndoSnapshot();
    setDoorscrieftTransaksis([]);
    addAuditLog('Hapus Semua Doorscrieft', 'Doorscrieft', `Tahun ${tahunAktif}`, String(tahunAktif));
    toast.success('Semua data Doorscrieft dihapus.');
  };

  const goPrev = () => setActiveLembar((l) => Math.max(0, l - 1));
  const goNext = () => setActiveLembar((l) => Math.min(dateGroups.length - 1, l + 1));
  const goFirst = () => setActiveLembar(0);
  const goLast = () => setActiveLembar(Math.max(0, dateGroups.length - 1));
  const handleJumpLembar = (value: string) => {
    setJumpLembarValue(value);
    const trimmed = value.trim();
    if (!trimmed) return;
    const next = Number(trimmed);
    if (!Number.isFinite(next)) return;
    setActiveLembar(Math.max(0, Math.min(dateGroups.length - 1, next - 1)));
  };

  const compactLembarIndexes = useMemo(() => {
    const total = dateGroups.length;
    if (total <= 9) return Array.from({ length: total }, (_, index) => index);

    const indexes = new Set<number>([0, total - 1]);
    for (let index = activeLembar - 2; index <= activeLembar + 2; index += 1) {
      if (index >= 0 && index < total) indexes.add(index);
    }
    return Array.from(indexes).sort((a, b) => a - b);
  }, [activeLembar, dateGroups.length]);

  const handleAddLembarLanjutan = () => {
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin input data.');
      return;
    }
    if (isYearLocked) {
      showLockedYearMessage();
      return;
    }
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

    // Open input panel using the active lembar month, not the system month.
    setEditingId(null);
    setForm({
      ...initialForm,
      tanggal: activeLembarInputDate,
      no: newNo,
    });
    setKodeSearch('');
    setKodeDropdownOpen(false);
    setKodeHighlightIdx(-1);
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      noInputRef.current?.focus();
      noInputRef.current?.select();
    });
  };

  // Format date display
  const formatDateDisplay = (value: Date | string | number) => {
    const d = value instanceof Date ? value : new Date(value);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  return (
    <div className='space-y-3'>
      {/* Title bar */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <h1 className='text-xl font-bold text-slate-900 dark:text-white'>Doorscrieft</h1>
          {isYearLocked && (
            <span className='inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300'>
              <Lock className='h-3.5 w-3.5' />
              Tahun {tahunAktif} terkunci
            </span>
          )}
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
          {doorscrieftTransaksis.length > 0 && !isYearLocked && canDelete && (
            <Button variant='destructive' size='sm' onClick={handleHapusSemua}>
              <Trash className='mr-1 h-3.5 w-3.5' /> Hapus Semua
            </Button>
          )}
        </div>
      </div>

      {isYearLocked && <YearLockedBanner tahun={tahunAktif} />}

      {/* Search + Lembar nav — sticky on scroll */}
      <div className='sticky top-0 z-20 bg-gray-50 dark:bg-slate-900 pt-1 -mx-1 px-1 space-y-2'>
        {/* Search + Tambah Lembar */}
        <div className='flex flex-wrap items-center gap-2'>
          <div className='relative min-w-[260px] flex-1'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
            <Input
              placeholder='Cari No, Uraian, atau Kode Anggaran...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='pl-10'
            />
          </div>
          <Button variant='outline' size='sm' onClick={handleAddLembarLanjutan} disabled={isYearLocked || !canInput}>
            <Plus className='mr-1 h-3.5 w-3.5' /> Lembar
          </Button>
          <Button size='sm' onClick={handleStartInputCurrentLembar} disabled={isYearLocked || !canInput}>
            <Plus className='mr-1 h-3.5 w-3.5' /> Tambah Data
          </Button>
          <Button variant='outline' size='sm' onClick={handleImportExcel} disabled={isImporting || isYearLocked || !canImport}>
            <Upload className='mr-1 h-3.5 w-3.5' /> {isImporting ? 'Menganalisis...' : 'Import Excel'}
          </Button>
        </div>

        {/* Lembar navigation */}
        {dateGroups.length > 0 && (
          <div className='space-y-2 rounded-lg border bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-sm font-semibold text-slate-700 dark:text-slate-200'>
                Tahun {tahunAktif}
              </span>
              <Button variant='outline' size='sm' onClick={goFirst} disabled={activeLembar === 0}>
                Awal
              </Button>
              <Button variant='ghost' size='icon' onClick={goPrev} disabled={activeLembar === 0}>
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <Button variant='ghost' size='icon' onClick={goNext} disabled={activeLembar >= dateGroups.length - 1}>
                <ChevronRight className='h-4 w-4' />
              </Button>
              <Button variant='outline' size='sm' onClick={goLast} disabled={activeLembar >= dateGroups.length - 1}>
                Akhir
              </Button>
              <label className='ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400'>
                Lembar ke
                <input
                  type='number'
                  min={1}
                  max={dateGroups.length}
                  value={jumpLembarValue}
                  onChange={(event) => handleJumpLembar(event.target.value)}
                  className='h-8 w-20 rounded-md border border-slate-300 bg-white px-2 text-center text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                />
              </label>
              <span className='text-xs text-slate-500 dark:text-slate-400'>dari {dateGroups.length}</span>
              <Button variant='outline' size='sm' onClick={handleExportExcel}>
                <Download className='mr-1 h-3.5 w-3.5' /> Export Excel
              </Button>
              <Button variant='outline' size='sm' onClick={() => setIsPrintDialogOpen(true)}>
                <Printer className='mr-1 h-3.5 w-3.5' /> Print
              </Button>
            </div>

            <div className='flex flex-wrap items-center gap-1'>
              {compactLembarIndexes.map((idx, position) => {
                const [lembarId] = dateGroups[idx];
                const label = lembarLabels[lembarId] || `Lembar ${idx + 1}`;
                const previous = compactLembarIndexes[position - 1];
                const showGap = previous !== undefined && idx - previous > 1;
                return (
                  <div key={lembarId} className='flex items-center gap-1'>
                    {showGap && <span className='px-1 text-xs text-slate-400'>...</span>}
                    <button
                      className={`h-8 min-w-10 rounded-md px-2 text-sm font-medium transition-colors ${
                        idx === activeLembar ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                      onClick={() => setActiveLembar(idx)}
                      onContextMenu={(e) => handleLembarRightClick(e, idx)}
                      title={`${label}. Klik kanan untuk opsi.`}
                    >
                      {idx + 1}
                    </button>
                  </div>
                );
              })}
            </div>
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

      {isImporting && (
        <div className='fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 px-4'>
          <div className='w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-800'>
            <div className='mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400' />
            <h2 className='mt-4 text-base font-semibold text-slate-900 dark:text-white'>Menganalisis Sheet DOORSCRIEFT</h2>
            <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
              Aplikasi sedang membaca blok lembar kerja, kolom kode anggaran, dan nominal transaksi.
            </p>
          </div>
        </div>
      )}

      <Dialog open={isPreviewOpen} onOpenChange={(open) => {
        if (!open) {
          setIsPreviewOpen(false);
          setPreviewResult(null);
          setPreviewError(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preview Import Excel DOORSCRIEFT</DialogTitle>
          </DialogHeader>

          {previewError ? (
            <div className='rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700'>
              {previewError}
            </div>
          ) : previewResult ? (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900'>
                <div className='font-semibold text-slate-700 dark:text-slate-100'>File</div>
                <div className='text-slate-600 dark:text-slate-300'>{previewResult.fileName}</div>
                <div className='font-semibold text-slate-700 dark:text-slate-100'>Sheet terdeteksi</div>
                <div className='text-slate-600 dark:text-slate-300'>{previewResult.sheetNames.join(', ')}</div>
                <div className='font-semibold text-slate-700 dark:text-slate-100'>Sheet dipakai</div>
                <div className='text-slate-600 dark:text-slate-300'>{previewResult.detectedSheetName}</div>
                <div className='font-semibold text-slate-700 dark:text-slate-100'>Periode</div>
                <div className='text-slate-600 dark:text-slate-300'>{previewResult.detectedMonths.length > 0 ? previewResult.detectedMonths.join(', ') : `Tahun ${tahunAktif}`}</div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800'>
                  <div className='text-slate-500'>Total baris</div>
                  <div className='mt-1 text-lg font-semibold text-slate-900 dark:text-white'>{previewResult.totalRows}</div>
                </div>
                <div className='rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800'>
                  <div className='text-slate-500'>Baris valid</div>
                  <div className='mt-1 text-lg font-semibold text-slate-900 dark:text-white'>{previewResult.validRows}</div>
                </div>
                <div className='rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800'>
                  <div className='text-slate-500'>Baris bermasalah</div>
                  <div className='mt-1 text-lg font-semibold text-slate-900 dark:text-white'>{previewResult.invalidRows}</div>
                </div>
                <div className='rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800'>
                  <div className='text-slate-500'>Total nominal</div>
                  <div className='mt-1 text-lg font-semibold text-slate-900 dark:text-white'>{formatCurrency(previewResult.totalNominal)}</div>
                </div>
              </div>

              {previewResult.errors.length > 0 && (
                <div className='rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700'>
                  <div className='font-semibold'>Error template / data:</div>
                  <ul className='mt-2 list-disc space-y-1 pl-5'>
                    {previewResult.errors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {previewResult.warnings.length > 0 && (
                <div className='rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900'>
                  <div className='font-semibold'>Peringatan:</div>
                  <ul className='mt-2 list-disc space-y-1 pl-5'>
                    {previewResult.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className='rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800'>
                <div className='mb-3 font-semibold text-slate-700 dark:text-slate-100'>Contoh data yang akan diimpor</div>
                <div className='overflow-x-auto'>
                  <table className='min-w-full border-collapse text-sm'>
                    <thead>
                      <tr className='border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400'>
                        <th className='py-2 pr-3'>No</th>
                        <th className='py-2 pr-3'>Tanggal</th>
                        <th className='py-2 pr-3'>Kode</th>
                        <th className='py-2 pr-3'>Uraian</th>
                        <th className='py-2 pr-3 text-right'>Penerimaan</th>
                        <th className='py-2 pr-3 text-right'>Pengeluaran</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewResult.rows.slice(0, 8).map((row, idx) => (
                        <tr key={`${row.no}-${idx}`} className='border-b border-slate-100 dark:border-slate-700'>
                          <td className='py-2 pr-3'>{row.no || '-'}</td>
                          <td className='py-2 pr-3'>{row.tanggal || '-'}</td>
                          <td className='py-2 pr-3'>{row.kodeAnggaran || '-'}</td>
                          <td className='py-2 pr-3'>{row.uraian || '-'}</td>
                          <td className='py-2 pr-3 text-right'>{row.penerimaan != null ? formatCurrency(Number(row.penerimaan)) : '-'}</td>
                          <td className='py-2 pr-3 text-right'>{row.pengeluaran != null ? formatCurrency(Number(row.pengeluaran)) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewResult.rows.length > 8 && (
                  <p className='mt-2 text-xs text-slate-500 dark:text-slate-400'>Menampilkan 8 baris pertama dari {previewResult.rows.length} baris valid.</p>
                )}
              </div>
            </div>
          ) : (
            <div className='rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'>
              Menunggu file Excel dipilih dan dianalisis.
            </div>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={() => setIsPreviewOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={!previewResult || previewResult.rows.length === 0}
            >
              Konfirmasi Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setting Print Doorscrieft</DialogTitle>
          </DialogHeader>

          <div className='space-y-4'>
            <div className='rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300'>
              Print hanya mencetak lembar aktif: <strong>Lembar {activeLembar + 1}</strong>
              {sheetLabel ? ` - ${sheetLabel}` : ''}.
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='space-y-1 text-sm'>
                <span className='font-medium text-slate-700 dark:text-slate-200'>Ukuran Kertas</span>
                <select
                  className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                  value={printSettings.paper}
                  onChange={(event) => setPrintSettings((prev) => ({ ...prev, paper: event.target.value }))}
                >
                  <option value=''>Ikuti printer</option>
                  <option value='A4'>A4</option>
                  <option value='F4'>F4</option>
                  <option value='Letter'>Letter</option>
                  <option value='Legal'>Legal</option>
                </select>
              </label>

              <label className='space-y-1 text-sm'>
                <span className='font-medium text-slate-700 dark:text-slate-200'>Orientasi</span>
                <select
                  className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                  value={printSettings.orientation}
                  onChange={(event) => setPrintSettings((prev) => ({ ...prev, orientation: event.target.value }))}
                >
                  <option value='portrait'>Portrait</option>
                  <option value='landscape'>Landscape</option>
                </select>
              </label>

              <label className='space-y-1 text-sm'>
                <span className='font-medium text-slate-700 dark:text-slate-200'>Margin (mm)</span>
                <Input
                  type='number'
                  min={0}
                  max={30}
                  value={printSettings.margin}
                  onChange={(event) => setPrintSettings((prev) => ({ ...prev, margin: Number(event.target.value) }))}
                />
              </label>

              <label className='space-y-1 text-sm'>
                <span className='font-medium text-slate-700 dark:text-slate-200'>Skala (%)</span>
                <Input
                  type='number'
                  min={60}
                  max={120}
                  value={printSettings.scale}
                  onChange={(event) => setPrintSettings((prev) => ({ ...prev, scale: Number(event.target.value) }))}
                />
              </label>
            </div>

            <div className='rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'>
              Kolom aksi otomatis disembunyikan saat print. Jika hasil terlalu lebar, turunkan skala atau gunakan landscape.
            </div>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setIsPrintDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handlePrintActiveLembar}>
              <Printer className='mr-2 h-4 w-4' /> Print Lembar Ini
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <th className='px-3 py-2 border border-slate-300 dark:border-slate-600 text-center font-semibold text-xs w-36 print-hidden dark:text-white'>Bukti</th>
                  <th className='px-3 py-2 border border-slate-300 dark:border-slate-600 text-left font-semibold text-xs w-20 print-hidden dark:text-white'>Aksi</th>
                </tr>
              </thead>
              <tbody className='dark:text-slate-200'>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className='py-4'>
                      <AppStateMessage
                        tone={doorscrieftTransaksis.filter((r) => new Date(r.tanggal).getFullYear() === tahunAktif).length === 0 ? 'empty' : 'search'}
                        title={doorscrieftTransaksis.filter((r) => new Date(r.tanggal).getFullYear() === tahunAktif).length === 0 ? `Belum ada data tahun ${tahunAktif}` : 'Tidak ada transaksi pada tanggal ini'}
                        detail={doorscrieftTransaksis.filter((r) => new Date(r.tanggal).getFullYear() === tahunAktif).length === 0 ? 'Klik Tambah atau Lembar untuk mulai input transaksi Doorscrieft.' : 'Pilih lembar lain atau tambah transaksi baru untuk tanggal aktif.'}
                        actionLabel={canInput && !isYearLocked ? 'Tambah Transaksi' : undefined}
                        onAction={canInput && !isYearLocked ? handleStartInputCurrentLembar : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  <>
                    {filteredRows.map((r, idx) => (
                      <tr key={r.id} className='border-b hover:bg-slate-50 dark:hover:bg-slate-700 dark:border-slate-700'>
                        <td className='px-3 py-2 border-r dark:border-slate-600 font-mono text-xs text-slate-500 dark:text-slate-400 w-16 text-center'>{r.no || idx + 1}</td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 whitespace-nowrap w-36 text-xs text-center'>
                          {formatDateDisplay(r.tanggal)}
                        </td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 text-xs'>{r.uraian}</td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 text-xs text-center'>{r.kodeAnggaran}</td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 text-right text-green-600 dark:text-green-400 font-medium text-xs w-28'>
                          {Number(r.penerimaan || 0) > 0 ? formatCurrency(Number(r.penerimaan)) : ''}
                        </td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 text-right text-red-600 dark:text-red-400 font-medium text-xs w-28'>
                          {Number(r.pengeluaran || 0) > 0 ? formatCurrency(Number(r.pengeluaran)) : ''}
                        </td>
                        <td className='px-3 py-2 border-r dark:border-slate-600 print-hidden'>
                          <div className='flex flex-col gap-1'>
                            {(r.attachments || []).length === 0 ? (
                              <Button
                                variant='outline'
                                size='sm'
                                className='h-7 justify-center text-xs'
                                disabled={!canAttachProof || isYearLocked}
                                onClick={() => handleAddAttachment(r)}
                              >
                                <Paperclip className='mr-1 h-3.5 w-3.5' /> Tambah
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant='outline'
                                  size='sm'
                                  className='h-7 justify-center text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40'
                                  disabled={!canAttachProof || isYearLocked}
                                  onClick={() => handleAddAttachment(r)}
                                  title='Tambah bukti lain'
                                >
                                  <Paperclip className='mr-1 h-3.5 w-3.5' /> {r.attachments?.length} bukti
                                </Button>
                                <div className='space-y-1'>
                                  {(r.attachments || []).map((attachment) => (
                                    <div key={attachment.id} className='flex items-center justify-between gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 dark:border-slate-700 dark:bg-slate-800' title={`${attachment.fileName}${attachment.size ? ` (${formatAttachmentSize(attachment.size)})` : ''}`}>
                                      <span className='min-w-0 truncate text-[10px] text-slate-600 dark:text-slate-300'>{attachment.fileName}</span>
                                      <span className='flex shrink-0 items-center gap-0.5'>
                                        <button type='button' className='rounded p-0.5 text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/50' onClick={() => handleOpenAttachment(attachment)} title='Buka bukti'>
                                          <Eye className='h-3 w-3' />
                                        </button>
                                        <button type='button' className='rounded p-0.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700' onClick={() => handleShowAttachmentInFolder(attachment)} title='Buka folder'>
                                          <FolderOpen className='h-3 w-3' />
                                        </button>
                                        {canAttachProof && !isYearLocked && (
                                          <button type='button' className='rounded p-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50' onClick={() => handleRemoveAttachment(r, attachment)} title='Hapus lampiran'>
                                            <X className='h-3 w-3' />
                                          </button>
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className='px-3 py-2 text-right w-20 print-hidden'>
                          <div className='flex justify-end gap-1'>
                            <Button variant='ghost' size='icon' className='h-6 w-6' disabled={!canInput} onClick={() => handleEdit(r)}>
                              <Edit2 className='h-3.5 w-3.5' />
                            </Button>
                            <Button variant='ghost' size='icon' className='h-6 w-6' disabled={!canDelete} onClick={() => handleDelete(r.id)}>
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
                      <td className='px-3 py-1.5 print-hidden'></td>
                    </tr>
                    <tr className='bg-slate-50 dark:bg-slate-700 dark:text-white'>
                      <td colSpan={4} className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-xs'>
                        JUMLAH S/D TANGGAL{' '}
                        <span className='font-normal text-slate-400 dark:text-slate-500 text-[10px]' title='Cumulative total for this lembar'>
                          {activeLembar > 0 ? `=E${dateGroups.slice(0, activeLembar).reduce((acc, [, rows], _i) => acc + rows.length + 4, 1)}` : '=E2'}
                        </span>
                      </td>
                      <td className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-green-700 dark:text-green-400 text-xs'>
                        {formatCurrency(summary.sD.p)}
                      </td>
                      <td className='px-3 py-1.5 border-r dark:border-slate-600 text-right font-bold text-red-700 dark:text-red-400 text-xs'>
                        {formatCurrency(summary.sD.q)}
                      </td>
                      <td className='px-3 py-1.5 print-hidden'></td>
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

      {/* Input Panel */}
      {isOpen && (
        <div
          className='fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-black/5 p-4 sm:p-6'
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
            }
          }}
        >
          <div
            className='mt-4 w-full max-w-xl overflow-hidden rounded-lg border border-blue-200 bg-blue-50/95 shadow-2xl animate-[doorscrieftPanelIn_.38s_cubic-bezier(.2,.85,.25,1)] dark:border-blue-900/60 dark:bg-slate-800'
            onMouseDown={(event) => event.stopPropagation()}
            style={{ transform: `translate(${modalOffset.x}px, ${modalOffset.y}px)` }}
          >
            <div className='h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500' />
            <div
              className='sticky top-0 z-10 flex cursor-move touch-none select-none items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/95 px-4 py-3 dark:border-slate-700 dark:bg-slate-800'
              onPointerDown={handleModalDragStart}
              onPointerMove={handleModalDragMove}
              onPointerUp={handleModalDragEnd}
              onPointerCancel={handleModalDragEnd}
            >
              <div>
                <h2 className='text-lg font-semibold dark:text-white'>{editingId ? 'Edit Doorscrieft' : 'Tambah Doorscrieft'}</h2>
                <div
                  key={form.tanggal}
                  className='mt-1 inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold capitalize text-blue-700 animate-[doorscrieftDateChipIn_.22s_ease-out] dark:border-blue-900 dark:bg-slate-800 dark:text-blue-300'
                >
                  <CalendarDays className='h-3.5 w-3.5' />
                  {selectedDateLabel}
                </div>
              </div>
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
                <Button
                  variant='ghost'
                  size='icon'
                  className='h-6 w-6'
                  onClick={closeInputPanel}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className='max-h-[calc(100vh-9rem)] space-y-3 overflow-y-auto p-5'>
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
                lang='id-ID'
                value={form.tanggal}
                onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                required
              />
            </div>

            <Input
              label='Uraian'
              ref={uraianInputRef}
              value={form.uraian}
              onChange={(e) => {
                setHiddenSuggestionForUraian('');
                setForm({ ...form, uraian: e.target.value });
                setUraianHistoryHighlightIdx(0);
              }}
              onKeyDown={(e) => {
                if (showUraianHistorySuggestions && e.key === 'ArrowDown') {
                  e.preventDefault();
                  setUraianHistoryHighlightIdx((prev) => Math.min(prev + 1, uraianHistorySuggestions.length - 1));
                  return;
                }
                if (showUraianHistorySuggestions && e.key === 'ArrowUp') {
                  e.preventDefault();
                  setUraianHistoryHighlightIdx((prev) => Math.max(prev - 1, 0));
                  return;
                }
                if (showUraianHistorySuggestions && e.key === 'Enter') {
                  e.preventDefault();
                  handleUraianHistorySelect();
                  return;
                }
                if (e.key === 'Tab') {
                  setHiddenSuggestionForUraian(form.uraian);
                  return;
                }
                if (e.key === 'Escape') {
                  setHiddenSuggestionForUraian(form.uraian);
                }
              }}
              placeholder='Masukkan uraian'
              required
            />

            {showUraianHistorySuggestions && (
              <div className='rounded-lg border border-blue-200 bg-white p-3 shadow-sm dark:border-blue-900 dark:bg-slate-800'>
                <div className='mb-2 flex items-center justify-between gap-3'>
                  <p className='text-xs font-semibold text-blue-700 dark:text-blue-300'>
                    Riwayat uraian
                  </p>
                  <span className='text-[11px] text-slate-400'>
                    Enter untuk pakai
                  </span>
                </div>
                <div className='space-y-1.5'>
                  {uraianHistorySuggestions.map((item, idx) => (
                    <button
                      key={`${item.uraian}-${item.kodeAnggaran}`}
                      type='button'
                      onClick={() => applyUraianHistorySuggestion(item)}
                      onMouseEnter={() => setUraianHistoryHighlightIdx(idx)}
                      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                        idx === uraianHistoryHighlightIdx
                          ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/30'
                          : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <div className='truncate text-sm font-semibold text-slate-900 dark:text-white'>
                            {item.uraian}
                          </div>
                          <div className='mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300'>
                            <span className='font-mono font-semibold'>{item.kodeAnggaran}</span>
                            <span className='truncate'>{item.mataAnggaran}</span>
                          </div>
                        </div>
                        <span className='shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-300'>
                          {item.count}x
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className='space-y-2'>
              <div className='relative'>
                <Input
                  label='Kode Anggaran'
                  value={form.kodeAnggaran}
                  placeholder='Ketik kode anggaran...'
                  onChange={(e) => {
                    handleKodeAnggaranInputChange(e.target.value);
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
                              applyKodeAnggaran(m);
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
                ref={penerimaanInputRef}
                type='text'
                value={form.penerimaan ? formatNumberInput(form.penerimaan) : ""}
                disabled={form.kodeAnggaran.startsWith('II.')}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  setForm({ ...form, penerimaan: raw });
                }}
                onBlur={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '');
                  if (cleaned) {
                    setForm({ ...form, penerimaan: cleaned });
                  }
                }}
                className={form.kodeAnggaran.startsWith('II.') ? 'opacity-50' : ''}
              />
              <Input
                label='Pengeluaran'
                ref={pengeluaranInputRef}
                type='text'
                value={form.pengeluaran ? formatNumberInput(form.pengeluaran) : ""}
                disabled={form.kodeAnggaran.startsWith('I.')}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  setForm({ ...form, pengeluaran: raw });
                }}
                onBlur={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '');
                  if (cleaned) {
                    setForm({ ...form, pengeluaran: cleaned });
                  }
                }}
                className={form.kodeAnggaran.startsWith('I.') ? 'opacity-50' : ''}
              />
            </div>

            <div className='mt-4 flex justify-end gap-2'>
              <Button type='submit' disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan...' : editingId ? 'Simpan' : 'Tambah'}
              </Button>
            </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
