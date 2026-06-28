import React, { useEffect, useMemo, useState } from 'react';
import { generateId } from '@/lib/utils';
import { applyBatangTubuhAnggaranForYear, useStore } from '@/stores';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Search, ChevronRight, ChevronDown, Download, Upload, FileSpreadsheet, RotateCcw, Layers3, Target, Activity, Scale } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { can } from '@/lib/permissions';
import type { BatangTubuhDetailRow, BatangTubuhItem, BatangTubuhProgram, KodeAnggaranItem } from '@/types';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAdminConfirm } from '@/components/ui/admin-confirm-dialog';
import { ReportPrintButton, ReportPrintDocument } from '@/components/print/ReportPrint';
import { YearLockedBanner } from '@/components/YearLockedBanner';
import { AppStateMessage } from '@/components/AppStateMessage';

type BatangTubuhImportRow = { kode: string; nama: string; program?: string; keterangan?: string; jumlah?: number; dianggarkan: number; raw?: unknown };
type BatangTubuhValidationReport = {
  total?: number;
  errors?: unknown[];
};
type BatangTubuhImportResult = {
  success?: boolean;
  canceled?: boolean;
  error?: string;
  items?: BatangTubuhImportRow[];
  total?: number;
};
type BatangTubuhPreviewResult = BatangTubuhImportResult & {
  path?: string;
  rows?: BatangTubuhImportRow[];
  columns?: string[];
};
type SheetJsonRow = Record<string, string | number | boolean | null | undefined>;
type XlsxModule = {
  read: (data: string | ArrayBuffer, options: Record<string, unknown>) => {
    Sheets: Record<string, unknown>;
    SheetNames: string[];
  };
  utils: {
    sheet_to_json: (sheet: unknown, options?: Record<string, unknown>) => SheetJsonRow[];
  };
};
type BatangTubuhElectronAPI = {
  importBatangTubuhPreview?: (opts?: Record<string, unknown>) => Promise<BatangTubuhPreviewResult>;
  importBatangTubuh?: (opts?: Record<string, unknown>) => Promise<BatangTubuhImportResult>;
  loadBatangTubuh?: () => Promise<BatangTubuhItem[]>;
  loadKodeAnggaran?: () => Promise<KodeAnggaranItem[]>;
  saveBatangTubuh?: (items: BatangTubuhItem[]) => Promise<{ success: boolean; error?: string }>;
  downloadBatangTubuhTemplate?: (opts?: { format?: 'csv' | 'xlsx' | 'txt' | 'json'; tahun?: number; batangTubuhProgramByYear?: Record<string, unknown> }) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }>;
  exportBatangTubuh?: (config: Record<string, unknown>) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }>;
};

function getBatangTubuhElectronAPI() {
  return (window as unknown as { electronAPI?: BatangTubuhElectronAPI }).electronAPI;
}

function isPendapatanKode(kode: string) {
  return kode === 'I' || kode.startsWith('I.');
}

function isPengeluaranKode(kode: string) {
  return kode === 'II' || kode.startsWith('II.');
}

function formatTargetVariance(value: number) {
  if (value > 0) return `+${formatCurrency(value)}`;
  return formatCurrency(value);
}

function inferParentKodeFromMaster(kode: string, masterByKode: Map<string, KodeAnggaranItem>) {
  const parts = String(kode || '').split('.').filter(Boolean);
  for (let length = parts.length - 1; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join('.');
    if (masterByKode.has(candidate)) return candidate;
  }
  return '';
}

function findClosestJudulKode(kode: string, masterByKode: Map<string, KodeAnggaranItem>) {
  let current = masterByKode.get(kode)?.parentKode || inferParentKodeFromMaster(kode, masterByKode);
  while (current) {
    const item = masterByKode.get(current);
    if (item && (item.jenisKode === 'judul' || item.aktifInput === false)) return current;
    current = item?.parentKode || inferParentKodeFromMaster(current, masterByKode);
  }
  return isPengeluaranKode(kode) ? 'II' : 'I';
}

function collectExistingDetailRows(items: BatangTubuhItem[] = []) {
  const map = new Map<string, BatangTubuhDetailRow>();
  items.forEach((group) => {
    (group.detailRows || []).forEach((row) => {
      if (row.kode) map.set(row.kode, row);
    });
    (group.batangTubuh || []).forEach((bt) => {
      (bt.detailRows || []).forEach((row) => {
        if (row.kode) map.set(row.kode, row);
      });
    });
  });
  return map;
}

function buildBatangTubuhFromMasterKode(masterItems: KodeAnggaranItem[] = [], existingItems: BatangTubuhItem[] = []) {
  const normalized = masterItems
    .map((item) => ({
      ...item,
      kodeAnggaran: String(item.kodeAnggaran || '').trim(),
      mataAnggaran: String(item.mataAnggaran || '').trim(),
    }))
    .filter((item) => item.kodeAnggaran && item.mataAnggaran && (isPendapatanKode(item.kodeAnggaran) || isPengeluaranKode(item.kodeAnggaran)));
  const masterByKode = new Map(normalized.map((item) => [item.kodeAnggaran, item]));
  const existingByKode = collectExistingDetailRows(existingItems);
  const groupMap = new Map<string, BatangTubuhItem>();

  const ensureGroup = (kode: string) => {
    const master = masterByKode.get(kode);
    const groupKode = master?.kodeAnggaran || kode;
    const group = groupMap.get(groupKode);
    if (group) return group;
    const parentKode = master?.parentKode || inferParentKodeFromMaster(groupKode, masterByKode);
    const parent = parentKode ? masterByKode.get(parentKode) : undefined;
    const nextGroup: BatangTubuhItem = {
      kode: groupKode,
      nama: master?.mataAnggaran || (isPengeluaranKode(groupKode) ? 'Pengeluaran' : 'Pendapatan'),
      subSeksiKode: parent?.kodeAnggaran || (isPengeluaranKode(groupKode) ? 'II' : 'I'),
      subSeksiNama: parent?.mataAnggaran || (isPengeluaranKode(groupKode) ? 'Pengeluaran' : 'Pendapatan'),
      detailRows: [],
      batangTubuh: [],
    };
    groupMap.set(groupKode, nextGroup);
    return nextGroup;
  };

  normalized
    .filter((item) => item.jenisKode === 'judul' || item.aktifInput === false)
    .forEach((item) => ensureGroup(item.kodeAnggaran));

  normalized
    .filter((item) => (item.jenisKode || 'isi') === 'isi' && item.aktifInput !== false)
    .forEach((item) => {
      const groupKode = findClosestJudulKode(item.kodeAnggaran, masterByKode);
      const group = ensureGroup(groupKode);
      const existing = existingByKode.get(item.kodeAnggaran);
      group.detailRows = [
        ...(group.detailRows || []),
        {
          ...existing,
          kode: item.kodeAnggaran,
          nama: item.mataAnggaran,
          MataAnggaran: item.mataAnggaran,
          dianggarkan: Number(existing?.dianggarkan || 0),
          realisasi: Number(existing?.realisasi || 0),
        },
      ];
    });

  return Array.from(groupMap.values())
    .filter((group) => (group.detailRows || []).length > 0)
    .sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }))
    .map((group) => ({
      ...group,
      detailRows: [...(group.detailRows || [])].sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true })),
    }));
}

export function BatangTubuhPage() {
  const {
    batangTubuhs,
    setBatangTubuhs,
    kodeAnggarans,
    setKodeAnggarans,
    batangTubuhAnggaranByYear,
    batangTubuhProgramByYear,
    setBatangTubuhProgramsForKode,
    doorscrieftTransaksis,
    tahunAktif,
    lockedYears,
    user,
  } = useStore();
  const canInput = can(user?.role, 'input');
  const isYearLocked = lockedYears.includes(tahunAktif);
  const confirm = useConfirm();
  const adminConfirm = useAdminConfirm();
  const [search, setSearch] = useState('');
  const [jenis, setJenis] = useState<'pendapatan' | 'pengeluaran'>('pendapatan');
  const [expandedKode, setExpandedKode] = useState<string | null>(null);
  const [expandedProgramKode, setExpandedProgramKode] = useState<string | null>(null);
  const [showDianggarkan, setShowDianggarkan] = useState(true);
  const [showRealisasi, setShowRealisasi] = useState(true);
  // Template preview modal state
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);
  const [templatePreviewFormat, setTemplatePreviewFormat] = useState<'csv'|'xlsx'|'txt'|'json'>('csv');
  const [templatePreviewText, setTemplatePreviewText] = useState('');

  const buildTemplateRows = (source = batangTubuhs) => {
    const rows: Array<Array<string | number>> = [
      ['KODE ANGGARAN', 'MATA ANGGARAN', 'PROGRAM', 'KETERANGAN', 'JUMLAH'],
    ];
    const programMap = batangTubuhProgramByYear[String(tahunAktif)] || {};

    const pushTemplateRow = (dr: BatangTubuhDetailRow) => {
      const programs = programMap[dr.kode] || [];
      if (programs.length > 0) {
        programs.forEach((program) => {
          const rincian = program.rincian || [];
          if (rincian.length === 0) {
            rows.push([dr.kode, dr.nama, program.namaProgram || 'Program Umum', '', 0]);
            return;
          }
          rincian.forEach((detail) => {
            rows.push([
              dr.kode,
              dr.nama,
              program.namaProgram || 'Program Umum',
              detail.keterangan || '',
              Number(detail.jumlah || 0),
            ]);
          });
        });
        return;
      }
      rows.push([
        dr.kode,
        dr.nama,
        Number(dr.dianggarkan || 0) > 0 ? 'Program Umum' : '',
        Number(dr.dianggarkan || 0) > 0 ? 'Anggaran awal' : '',
        Number(dr.dianggarkan || 0),
      ]);
    };

    (source || []).forEach((item) => {
      (item.detailRows || []).forEach((dr) => {
        pushTemplateRow(dr);
      });
      (item.batangTubuh || []).forEach((bt) => {
        (bt.detailRows || []).forEach((dr) => {
          pushTemplateRow(dr);
        });
      });
    });

    if (rows.length === 1) {
      rows.push(['I.2.2.01.001', 'Kolekta Kebaktian Minggu', 'Program Umum', 'Anggaran awal', 0]);
      rows.push(['I.2.2.01.002', 'Kolekta Kebaktian Minggu Perjamuan Kudus', 'Program Umum', 'Anggaran awal', 0]);
    }

    return rows;
  };

  const csvSample = (sep = ',', source = batangTubuhs) => {
    const rows = buildTemplateRows(source);
    return '\uFEFF' + rows.map(r => r.map(c => {
      if (typeof c === 'string' && (c.includes(sep) || c.includes('"') || c.includes('\n'))) {
        return '"' + c.replace(/"/g, '""') + '"';
      }
      return String(c);
    }).join(sep)).join('\n') + '\n';
  };

  // Import preview modal state
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importPreviewPath, setImportPreviewPath] = useState<string | null>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<BatangTubuhImportRow[]>([]);
  const [importAction, setImportAction] = useState<'replace'|'skip'>('replace');
  const existingCodes = useMemo(() => {
    const s: Record<string, true> = {};
    (batangTubuhs || []).forEach((g) => {
      (g.detailRows || []).forEach((dr) => {
        if (dr?.kode) s[dr.kode] = true;
      });
      (g.batangTubuh || []).forEach((bt) => {
        (bt.detailRows || []).forEach((dr) => {
          if (dr?.kode) s[dr.kode] = true;
        });
      });
    });
    return s;
  }, [batangTubuhs]);

  const openImportPreview = async () => {
    if (isYearLocked) {
      toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk import anggaran.`);
      return;
    }
    const electronAPI = getBatangTubuhElectronAPI();
    // If running inside Electron, use the native file picker + importer
    if (electronAPI?.importBatangTubuhPreview) {
      try {
        const pv = await electronAPI.importBatangTubuhPreview();
        if (pv?.canceled) return;
        if (!pv || !pv.success) {
          toast.error('Gagal membuka preview import.', {
            description: pv?.error || 'Tidak ada respons dari Electron.',
          });
          return;
        }
        // pv.rows is array of { raw, kode, nama, program, keterangan, jumlah }
        const rows = Array.isArray(pv.rows) ? pv.rows : [];
        setImportPreviewPath(pv.path || null);
        setImportPreviewRows(rows);
        setImportPreviewOpen(true);
        if (rows.length === 0) {
          toast.info('File terbuka, tapi tidak ada baris yang bisa dipreview.', {
            description: 'Pastikan sheet pertama punya kolom KODE ANGGARAN dan JUMLAH.',
          });
        }
        return;
      } catch (error) {
        console.error('Preview import Batang Tubuh gagal:', error);
        toast.error('Gagal preview import.', {
          description: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    // Fallback: running in browser (Vite). Use a file input and parse with xlsx in-browser.
    const normalizeHeaderLocal = (h?: string) => String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const detectColumnsLocal = (row: SheetJsonRow) => {
      const keys = Object.keys(row || {});
      const map: { kode: string | null; dianggarkan: string | null; nama: string | null; program: string | null; keterangan: string | null } = { kode: null, dianggarkan: null, nama: null, program: null, keterangan: null };
      for (const k of keys) {
        const nk = normalizeHeaderLocal(k);
        if (!map.kode && /^(kode|kode_anggaran|kodeanggaran|kode_ang|kodeang)/.test(nk)) map.kode = k;
        if (!map.dianggarkan && /^(dianggarkan|anggaran|budget|amount|nilai|nominal|jumlah)$/i.test(nk)) map.dianggarkan = k;
        if (!map.nama && /^(nama|mata_anggaran|mataangg|description|uraian)$/i.test(nk)) map.nama = k;
        if (!map.program && /^(program|nama_program|kegiatan|nama_kegiatan)$/i.test(nk)) map.program = k;
        if (!map.keterangan && /^(keterangan|rincian|rincian_program|uraian_rincian)$/i.test(nk)) map.keterangan = k;
      }
      if (!map.kode && keys.length > 0) map.kode = keys[0];
      if (!map.nama && keys.length > 1) map.nama = keys[1];
      if (!map.dianggarkan) {
        if (keys.length > 2) map.dianggarkan = keys[2];
        else if (keys.length > 1) map.dianggarkan = keys[1];
      }
      return map;
    };
    const parseNumberStringLocal = (val: unknown) => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return val;
      let s = String(val).trim();
      if (!s) return 0;
      s = s.replace(/[^0-9,.-]/g, '');
      const hasDot = s.indexOf('.') !== -1;
      const hasComma = s.indexOf(',') !== -1;
      if (hasDot && hasComma) {
        s = s.replace(/\./g, '').replace(/,/g, '.');
      } else if (hasComma && !hasDot) {
        s = s.replace(/,/g, '.');
      } else if (hasDot && !hasComma) {
        if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
      }
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    };

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv,.txt';
    input.onchange = async () => {
      const f = (input.files && input.files[0]) || null;
      if (!f) return;
      try {
        const mod = await import('xlsx');
        const XLSX = ((mod as { default?: XlsxModule }).default || mod) as XlsxModule;
        let rows: SheetJsonRow[] = [];
        const name = f.name || 'file';
        const ext = (name.split('.').pop() || '').toLowerCase();
        if (ext === 'csv' || ext === 'txt') {
          const text = await f.text();
          const wb = XLSX.read(text, { type: 'string' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        } else {
          const ab = await f.arrayBuffer();
          const wb = XLSX.read(ab, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        }
        if (!rows || rows.length === 0) {
          toast.error('File kosong atau tidak dapat dibaca.');
          return;
        }
        const detected = detectColumnsLocal(rows[0]);
        if (!detected.kode || !detected.dianggarkan) {
          toast.error('Kolom kode atau jumlah tidak ditemukan.');
          return;
        }
        const kodeColumn = detected.kode;
        const dianggarkanColumn = detected.dianggarkan;
        const namaColumn = detected.nama;
        const sample = rows.slice(0, 20).map((r) => {
          const kode = String(r[kodeColumn] || '').trim();
          const nama = String(namaColumn ? r[namaColumn] : r[kodeColumn] || '').trim();
          const dianggarkan = parseNumberStringLocal(r[dianggarkanColumn]);
          const program = String(detected.program ? r[detected.program] : '').trim();
          const keterangan = String(detected.keterangan ? r[detected.keterangan] : '').trim();
          return { raw: r, kode, nama, program, keterangan, jumlah: dianggarkan, dianggarkan };
        });
        setImportPreviewPath(name);
        setImportPreviewRows(sample);
        setImportPreviewOpen(true);
      } catch (err) {
        console.error('Failed to parse import file in browser fallback', err);
        toast.error('Gagal membaca file.', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    };
    input.click();
  };

  // Validation report modal state
  const [showValidationReport, setShowValidationReport] = useState(false);
  const [validationReport, setValidationReport] = useState<BatangTubuhValidationReport | null>(null);
  const [validationKey, setValidationKey] = useState<string | null>(null);

  const applyAutoFixValidation = () => {
    if (isYearLocked) {
      toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk mengubah Batang Tubuh.`);
      return;
    }
    // generate kode for rows missing kode
    const newData = (batangTubuhs || []).map((g) => ({
      ...g,
      batangTubuh: (g.batangTubuh || []).map((bt) => ({
        ...bt,
        detailRows: (bt.detailRows || []).map((dr) => ({
          ...dr,
          kode: dr.kode && String(dr.kode).trim() ? dr.kode : `AUTO-${generateId().slice(0,6)}`,
        })),
      })),
    }));
    try { setBatangTubuhs(newData); } catch (e) { console.error('Auto-fix failed', e); }
    // remove the stored validation report
    try { if (validationKey) window.localStorage.removeItem(validationKey); } catch { void 0; }
    setShowValidationReport(false);
    toast.success('Perbaikan otomatis diterapkan.', {
      description: 'Silakan periksa data Batang Tubuh.',
    });
  };

  // Load Batang Tubuh from database on mount
  useEffect(() => {
    const electronAPI = getBatangTubuhElectronAPI();
    if (!electronAPI?.loadBatangTubuh) return;
    electronAPI.loadBatangTubuh()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setBatangTubuhs(items);
          // check for validation reports saved by store normalizer
          try {
            const keys = Object.keys(window.localStorage || {}).filter(k => k.startsWith('bt_validation_'));
            if (keys.length > 0) {
              // pick latest by timestamp in key
              keys.sort();
              const last = keys[keys.length - 1];
              const raw = window.localStorage.getItem(last);
              if (raw) {
                const parsed = JSON.parse(raw);
                setValidationReport(parsed);
                setValidationKey(last);
                setShowValidationReport(true);
              }
            }
          } catch (e) { console.warn('Failed to load validation report', e); }
        }
      })
      .catch(() => {});
  }, [setBatangTubuhs]);

  const activeBatangTubuhs = useMemo(
    () => applyBatangTubuhAnggaranForYear(batangTubuhs, batangTubuhAnggaranByYear, tahunAktif, batangTubuhProgramByYear),
    [batangTubuhs, batangTubuhAnggaranByYear, batangTubuhProgramByYear, tahunAktif],
  );

  const getProgramsForKode = (kode: string) => batangTubuhProgramByYear[String(tahunAktif)]?.[kode] || [];

  const handleExport = async () => {
    const electronAPI = getBatangTubuhElectronAPI();
    if (!electronAPI?.exportBatangTubuh) {
      toast.error('Export Excel tidak tersedia.', {
        description: 'Pastikan aplikasi berjalan di desktop Electron.',
      });
      return;
    }
    const result = await electronAPI.exportBatangTubuh({
      namaGereja: 'GEREJA PROTESTAN MALUKU',
      klas: 'KLASIS PULAU AMBON TIMUR',
      jemaat: 'JEMAAT SULI',
      tahun: String(tahunAktif),
      batangTubuhs: activeBatangTubuhs,
      doorscrieftTransaksis,
    });
    if (result?.success && result.path) {
      toast.success('Export Batang Tubuh berhasil.', {
        description: result.path,
      });
    } else if (!result?.canceled) {
      toast.error('Export gagal.', {
        description: result?.error || 'Error tidak diketahui',
      });
    }
  };

  const handleSyncFromMasterKode = async () => {
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin mengubah Batang Tubuh.');
      return;
    }
    if (isYearLocked) {
      toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk sinkronisasi.`);
      return;
    }
    const electronAPI = getBatangTubuhElectronAPI();
    let masterItems = kodeAnggarans;
    try {
      if (electronAPI?.loadKodeAnggaran) {
        const loaded = await electronAPI.loadKodeAnggaran();
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

      const nextData = buildBatangTubuhFromMasterKode(masterItems, batangTubuhs);
      if (nextData.length === 0) {
        toast.error('Tidak ada kode Isi yang bisa disinkronkan.', {
          description: 'Pastikan Master Kode Anggaran memiliki kode Isi.',
        });
        return;
      }

      const confirmed = await confirm({
        title: 'Sinkronkan dari Master Kode Anggaran?',
        description: `Batang Tubuh akan dibentuk dari ${nextData.length} kelompok master. Anggaran dan program lama tetap dipertahankan selama kodenya sama.`,
        confirmText: 'Sinkronkan',
        tone: 'default',
      });
      if (!confirmed) return;

      setBatangTubuhs(nextData);
      if (electronAPI?.saveBatangTubuh) {
        const result = await electronAPI.saveBatangTubuh(nextData);
        if (!result?.success) {
          toast.error('Sinkronisasi masuk memori, tapi gagal menyimpan database.', {
            description: result?.error || 'Error tidak diketahui.',
          });
          return;
        }
      }
      useStore.getState().addAuditLog('Sinkron Batang Tubuh', 'Master Kode Anggaran', `${nextData.length} kelompok`, 'batang-tubuh');
      toast.success('Batang Tubuh berhasil disinkronkan dari Master Kode Anggaran.', {
        description: `${nextData.reduce((sum, group) => sum + (group.detailRows || []).length, 0)} kode Isi siap dianggarkan.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal sinkronisasi Batang Tubuh.');
    }
  };

  const filtered = activeBatangTubuhs.filter(
    (bt) => {
      const isPendapatan = !isPengeluaranKode(bt.kode);
      if (jenis === 'pendapatan' && !isPendapatan) return false;
      if (jenis === 'pengeluaran' && isPendapatan) return false;
      if (search) {
        const q = search.toLowerCase();
        return bt.nama.toLowerCase().includes(q) || bt.kode.toLowerCase().includes(q) || (bt.subSeksiNama || '').toLowerCase().includes(q) ||
          (bt.detailRows || []).some((r) => r.kode.toLowerCase().includes(q) || r.nama.toLowerCase().includes(q));
      }
      return true;
    }
  );

  // Hitung realisasi per detail row dari doorscrieftTransaksis (DOORSCRIEFT)
  const hitungRealisasi = useMemo(() => {
    const map: Record<string, number> = {};
    (filtered || []).forEach((bt) => {
      (bt.detailRows || []).forEach((dr) => {
        const rows = (doorscrieftTransaksis || []).filter((r) => {
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
    (filtered || []).forEach((bt) => {
      dianggarkan += (bt.detailRows || []).reduce((s, d) => s + (Number(d.dianggarkan) || 0), 0);
      (bt.detailRows || []).forEach((d) => { realisasi += Number(hitungRealisasi[d.kode] || 0); });
    });
    return { dianggarkan, realisasi, selisih: realisasi - dianggarkan };
  }, [filtered, hitungRealisasi]);

  // Per-Batang Tubuh totals
  const btTotals = useMemo(() => {
    const map: Record<string, { dianggarkan: number; realisasi: number; selisih: number }> = {};
    (filtered || []).forEach((bt) => {
      const dianggarkan = (bt.detailRows || []).reduce((s, d) => s + (Number(d.dianggarkan) || 0), 0);
      let realisasi = 0;
      (bt.detailRows || []).forEach((d) => { realisasi += Number(hitungRealisasi[d.kode] || 0); });
      map[bt.kode] = { dianggarkan, realisasi, selisih: realisasi - dianggarkan };
    });
    return map;
  }, [filtered, hitungRealisasi]);

  const operationalSummary = useMemo(() => {
    const detailRows = (filtered || []).reduce((sum, bt) => sum + (bt.detailRows || []).length, 0);
    const activeBudgetRows = (filtered || []).reduce(
      (sum, bt) => sum + (bt.detailRows || []).filter((row) => Number(row.dianggarkan || 0) > 0).length,
      0,
    );
    const realizedRows = Object.values(hitungRealisasi).filter((value) => Number(value || 0) > 0).length;
    const realizationRate = grandTotal.dianggarkan > 0
      ? Math.round((grandTotal.realisasi / grandTotal.dianggarkan) * 100)
      : 0;
    return {
      groups: filtered.length,
      detailRows,
      activeBudgetRows,
      realizedRows,
      realizationRate,
    };
  }, [filtered, grandTotal.dianggarkan, grandTotal.realisasi, hitungRealisasi]);

  const renderImportPreviewDialog = () => (
    <Dialog open={importPreviewOpen} onOpenChange={(v) => setImportPreviewOpen(v)} draggable>
      <DialogHeader draggable>
        <DialogTitle>Preview Import Batang Tubuh</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="mb-3">
          <p className="text-sm text-slate-600">File: {importPreviewPath || '-'}</p>
          <p className="text-sm text-slate-600">Total baris preview: {importPreviewRows.length}</p>
          <p className="text-xs text-slate-500">Format: Kode Anggaran, Mata Anggaran, Program, Keterangan, Jumlah</p>
        </div>
        <div className="overflow-auto max-h-60 border rounded">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">KODE</th>
                <th className="p-2 text-left">NAMA</th>
                <th className="p-2 text-left">PROGRAM</th>
                <th className="p-2 text-left">KETERANGAN</th>
                <th className="p-2 text-right">JUMLAH</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {importPreviewRows.map((r, idx) => {
                const matched = !!existingCodes[r.kode];
                return (
                  <tr key={idx} className={matched ? '' : 'bg-yellow-50'}>
                    <td className="p-2">{idx + 1}</td>
                    <td className="p-2">{r.kode}</td>
                    <td className="p-2">{r.nama}</td>
                    <td className="p-2">{r.program || '-'}</td>
                    <td className="p-2">{r.keterangan || '-'}</td>
                    <td className="p-2 text-right">{formatCurrency(r.jumlah ?? r.dianggarkan)}</td>
                    <td className="p-2">{matched ? 'Cocok' : 'Tidak ditemukan'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm">Aksi saat import:</label>
          <div className="flex gap-2">
            <button className={`px-3 py-1 border rounded ${importAction === 'replace' ? 'bg-slate-100' : ''}`} onClick={() => setImportAction('replace')}>Ganti anggaran</button>
            <button className={`px-3 py-1 border rounded ${importAction === 'skip' ? 'bg-slate-100' : ''}`} onClick={() => setImportAction('skip')}>Lewati yang tidak cocok</button>
          </div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button variant="outline" onClick={() => setImportPreviewOpen(false)}>Batal</Button>
        <Button onClick={async () => {
          if (isYearLocked) {
            toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk import anggaran.`);
            return;
          }
          try {
            const electronAPI = getBatangTubuhElectronAPI();
            if (!importPreviewPath && electronAPI?.importBatangTubuh) {
              toast.error('Pilih file template yang mau di-import dulu.');
              return;
            }
            let imp: BatangTubuhImportResult;
            if (electronAPI?.importBatangTubuh) {
              imp = await electronAPI.importBatangTubuh({ path: importPreviewPath });
              if (!imp || !imp.success) {
                toast.error('Import dibatalkan atau gagal.', {
                  description: imp?.error || undefined,
                });
                return;
              }
            } else {
              imp = {
                items: (importPreviewRows || []).map(r => ({
                  kode: r.kode,
                  nama: r.nama,
                  program: r.program,
                  keterangan: r.keterangan,
                  jumlah: r.jumlah ?? r.dianggarkan,
                  dianggarkan: r.jumlah ?? r.dianggarkan,
                })),
                total: (importPreviewRows || []).length,
                success: true,
              };
            }
            if (!Array.isArray(imp.items) || imp.items.length === 0) {
              toast.error('File import tidak berisi baris yang bisa dibaca.', {
                description: 'Pastikan kolom KODE ANGGARAN dan JUMLAH masih ada.',
              });
              return;
            }

            const normalizeCode = (s?: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
            const hasProgramImport = (imp.items || []).some((it) => String(it.program || it.keterangan || '').trim());
            if (hasProgramImport) {
              const detailByCode: Record<string, BatangTubuhDetailRow> = {};
              (batangTubuhs || []).forEach((group) => {
                (group.detailRows || []).forEach((dr) => { detailByCode[normalizeCode(dr.kode)] = dr; });
                (group.batangTubuh || []).forEach((bt) => {
                  (bt.detailRows || []).forEach((dr) => { detailByCode[normalizeCode(dr.kode)] = dr; });
                });
              });

              const grouped: Record<string, BatangTubuhProgram[]> = {};
              let changedProgramRows = 0;
              const missingProgramCodes = new Set<string>();
              (imp.items || []).forEach((it) => {
                const importedKode = String(it.kode || '').trim();
                const detail = detailByCode[normalizeCode(importedKode)];
                if (!detail) {
                  missingProgramCodes.add(importedKode || '(kosong)');
                  return;
                }
                const amount = Number(it.jumlah ?? it.dianggarkan ?? 0);
                const programName = String(it.program || 'Program Umum').trim() || 'Program Umum';
                const rincianText = String(it.keterangan || 'Anggaran awal').trim() || 'Anggaran awal';
                if (!grouped[detail.kode]) grouped[detail.kode] = [];
                let program = grouped[detail.kode].find((item) => item.namaProgram.toLowerCase() === programName.toLowerCase());
                if (!program) {
                  program = { id: generateId(), namaProgram: programName, rincian: [] };
                  grouped[detail.kode].push(program);
                }
                program.rincian.push({ id: generateId(), keterangan: rincianText, jumlah: amount });
                changedProgramRows++;
              });

              Object.entries(grouped).forEach(([kode, programs]) => {
                setBatangTubuhProgramsForKode(tahunAktif, kode, programs);
              });
              setImportPreviewOpen(false);
              setImportPreviewRows([]);
              setImportPreviewPath(null);
              toast.success('Import program anggaran berhasil diterapkan.', {
                description: `${changedProgramRows} rincian masuk ke ${Object.keys(grouped).length} kode. ${missingProgramCodes.size ? `${missingProgramCodes.size} kode tidak cocok.` : ''}`,
              });
              return;
            }

            try {
              const kodeList = electronAPI?.loadKodeAnggaran ? await electronAPI.loadKodeAnggaran() : [];
              const kodeByCode: Record<string, string> = {};
              const kodeByName: Record<string, string> = {};
              (kodeList || []).forEach((k) => {
                const code = String(k.kodeAnggaran || '').trim();
                const name = String(k.mataAnggaran || '').trim();
                if (code) kodeByCode[normalizeCode(code)] = name;
                if (name) kodeByName[name.toLowerCase()] = code;
              });
              (imp.items || []).forEach((it) => {
                const kodeNorm = String(it.kode || '').trim();
                const nameNorm = String(it.nama || '').trim();
                if (!kodeNorm && nameNorm) {
                  const found = kodeByName[nameNorm.toLowerCase()];
                  if (found) it.kode = found;
                  else {
                    const lcName = nameNorm.toLowerCase();
                    for (const kk of Object.keys(kodeByName)) {
                      if (kk.includes(lcName) || lcName.includes(kk)) { it.kode = kodeByName[kk]; break; }
                    }
                  }
                }
                if (!it.nama && kodeNorm) {
                  const n = kodeByCode[normalizeCode(kodeNorm)];
                  if (n) it.nama = n;
                }
              });
            } catch (e) {
              console.warn('Autofill kode-anggaran failed', e);
            }

            const mapping = (imp.items || []).reduce((acc: Record<string, number>, it) => {
              const kRaw = String(it.kode || '').trim();
              const k = normalizeCode(kRaw);
              if (k) acc[k] = Number(it.dianggarkan || 0);
              return acc;
            }, {} as Record<string, number>);
            const normalizeName = (s?: string) => String(s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
            const mappingByName: Record<string, number> = {};
            (imp.items || []).forEach((it) => {
              const n = normalizeName(it.nama || '');
              if (n) mappingByName[n] = Number(it.dianggarkan || 0);
            });

            let changed = 0;
            const missingKeys: string[] = [];
            const matchedCodes = new Set<string>();
            const applyImportedBudget = (dr: BatangTubuhDetailRow): BatangTubuhDetailRow => {
              const keyRaw = String(dr.kode || '').trim();
              const key = normalizeCode(keyRaw);
              const currentValue = Number(dr.dianggarkan || 0);
              const replaceWith = (nextValue: number) => {
                if (keyRaw) matchedCodes.add(keyRaw);
                if (importAction === 'replace' && currentValue !== Number(nextValue || 0)) changed++;
                return importAction === 'replace' ? { ...dr, dianggarkan: Number(nextValue || 0) } : dr;
              };
              if (key && mapping[key] !== undefined) return replaceWith(mapping[key]);
              const nameKey = normalizeName(dr.nama || dr.MataAnggaran || '');
              if (nameKey && mappingByName[nameKey] !== undefined) return replaceWith(mappingByName[nameKey]);
              if (nameKey) {
                for (const kName of Object.keys(mappingByName)) {
                  if (kName.includes(nameKey) || nameKey.includes(kName)) return replaceWith(mappingByName[kName]);
                }
              }
              if (key) {
                for (const impKey of Object.keys(mapping)) {
                  if (!impKey) continue;
                  if (impKey.startsWith(key) || key.startsWith(impKey) || impKey.includes(key) || key.includes(impKey)) return replaceWith(mapping[impKey]);
                }
              }
              missingKeys.push(keyRaw || nameKey || '(empty)');
              return dr;
            };

            const sourceData = electronAPI?.loadBatangTubuh
              ? await electronAPI.loadBatangTubuh()
              : batangTubuhs;
            const newData = (sourceData || []).map((group) => ({
              ...group,
              detailRows: (group.detailRows || []).map((dr) => applyImportedBudget(dr)),
              batangTubuh: (group.batangTubuh || []).map((bt) => ({
                ...bt,
                detailRows: (bt.detailRows || []).map((dr) => applyImportedBudget(dr)),
              })),
            }));

            console.log('[Import] mapping keys:', Object.keys(mapping).slice(0, 20));
            console.log('[Import] changed rows count:', changed);
            console.log('[Import] sample missing keys:', Array.from(new Set(missingKeys)).slice(0, 10));
            try {
              const yearKey = String(tahunAktif);
              const existing = (batangTubuhAnggaranByYear || {});
              const yearMap: Record<string, number> = { ...(existing[yearKey] || {}) };
              for (const g of newData || []) {
                for (const dr of g.detailRows || []) {
                  if (dr.kode && matchedCodes.has(String(dr.kode))) yearMap[String(dr.kode)] = Number(dr.dianggarkan || 0);
                }
                for (const bt of g.batangTubuh || []) {
                  for (const dr of bt.detailRows || []) {
                    if (dr?.kode && matchedCodes.has(String(dr.kode))) yearMap[String(dr.kode)] = Number(dr.dianggarkan || 0);
                  }
                }
              }
              const setByYearFn = useStore.getState().setBatangTubuhAnggaranByYear;
              if (typeof setByYearFn === 'function') setByYearFn({ ...existing, [yearKey]: yearMap });
            } catch (e) {
              console.warn('Failed to update batangTubuhAnggaranByYear after import', e);
            }

            if (electronAPI?.saveBatangTubuh) {
              const saveResult = await electronAPI.saveBatangTubuh(newData);
              if (!saveResult?.success) {
                toast.error('Import terbaca, tapi gagal menyimpan Batang Tubuh.', {
                  description: saveResult?.error || 'Unknown error',
                });
                return;
              }
            }
            setBatangTubuhs(newData);
            const matchedCount = matchedCodes.size;
            if (matchedCount === 0) {
              toast.info('Import selesai, tapi tidak ada kode yang cocok.', {
                description: 'Cek kolom KODE ANGGARAN di template.',
              });
            } else if (changed === 0) {
              toast.info('Import selesai.', {
                description: `${matchedCount} kode cocok, tapi nilainya sama dengan data saat ini.`,
              });
            } else {
              toast.success('Import Batang Tubuh berhasil.', {
                description: `${matchedCount} kode cocok, ${changed} baris diperbarui.`,
              });
            }
            setImportPreviewOpen(false);
          } catch (e: unknown) {
            console.error('Import error', e);
            toast.error('Terjadi kesalahan saat import.', {
              description: e instanceof Error ? e.message : String(e),
            });
          }
        }}>Terapkan Import</Button>
      </DialogFooter>
    </Dialog>
  );

  if (batangTubuhs.length === 0) {
    return (
      <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
              <Layers3 className="h-4 w-4" />
              Struktur Anggaran
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Batang Tubuh</h1>
            <p className="text-slate-500 dark:text-slate-400">Pantau anggaran dan realisasi Batang Tubuh Tahun {tahunAktif}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleSyncFromMasterKode} disabled={isYearLocked || !canInput}>
              <Layers3 className="mr-2 h-4 w-4" /> Sinkron Master
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export Excel
            </Button>
            <Button onClick={openImportPreview} disabled={isYearLocked || !canInput}>
              <Upload className="mr-2 h-4 w-4" /> Import
            </Button>
          </div>
        </div>
        {isYearLocked && <YearLockedBanner tahun={tahunAktif} detail='Anggaran Batang Tubuh hanya bisa dilihat. Buka kunci dari Pengaturan jika perlu revisi.' />}
        <Card>
          <CardContent className="p-6">
            <AppStateMessage
              title='Data Batang Tubuh belum tersedia'
              detail='Sinkronkan dari Master Kode Anggaran atau import template Batang Tubuh untuk mulai mengisi anggaran.'
              actionLabel={canInput && !isYearLocked ? 'Sinkron Master' : undefined}
              onAction={canInput && !isYearLocked ? handleSyncFromMasterKode : undefined}
            />
          </CardContent>
        </Card>
      </div>
      {renderImportPreviewDialog()}
      </>
    );
  }

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
            <Layers3 className="h-4 w-4" />
            Struktur Anggaran
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Batang Tubuh</h1>
          <p className="text-slate-500 dark:text-slate-400">Pantau anggaran dan realisasi Batang Tubuh Tahun {tahunAktif}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ReportPrintButton title={`Batang_Tubuh_${jenis}_${tahunAktif}`} />
          <Button variant="outline" onClick={handleSyncFromMasterKode} disabled={isYearLocked || !canInput}>
            <Layers3 className="mr-2 h-4 w-4" /> Sinkron Master
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40" disabled={isYearLocked || !canInput} onClick={async () => {
            if (isYearLocked) {
              toast.error(`Tahun ${tahunAktif} terkunci. Buka kunci di Pengaturan untuk reset anggaran.`);
              return;
            }
            const shouldReset = await confirm({
              title: 'Reset semua nilai dianggarkan?',
              description: 'Semua nilai dianggarkan akan menjadi 0 dan pengaturan anggaran per tahun akan dihapus.',
              confirmText: 'Reset Dianggarkan',
              cancelText: 'Batal',
              tone: 'danger',
            });
            if (!shouldReset) return;
            const verified = await adminConfirm({
              title: 'Verifikasi Admin',
              description: 'Semua nilai dianggarkan akan direset ke 0. Masukkan password admin untuk melanjutkan.',
              confirmText: 'Reset Dianggarkan',
              tone: 'danger',
            });
            if (!verified) return;
            const electronAPI = getBatangTubuhElectronAPI();
            try {
              // update store in-memory
              try {
                useStore.getState().resetAllDianggarkan();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Reset gagal.');
                return;
              }
              const newData = useStore.getState().batangTubuhs;

              if (electronAPI?.saveBatangTubuh) {
                const res = await electronAPI.saveBatangTubuh(newData);
                if (!res || res.success === false) {
                  console.error('Failed to save batangTubuh after reset', res);
                  toast.error('Reset gagal disimpan.', {
                    description: res?.error || 'Unknown error',
                  });
                  return;
                }
                // reload from disk to ensure persisted state is in sync
                if (electronAPI?.loadBatangTubuh) {
                  try {
                    const loaded = await electronAPI.loadBatangTubuh();
                    if (Array.isArray(loaded)) setBatangTubuhs(loaded);
                  } catch (e) {
                    console.warn('Failed to reload batangTubuh after save', e);
                  }
                }
                toast.success('Semua dianggarkan telah direset dan disimpan.');
              } else {
                // running in browser / no IPC available: state already reset in-memory
                toast.info('Semua dianggarkan telah direset di memori.', {
                  description: 'Simpan tidak tersedia di mode ini.',
                });
              }
            } catch (e: unknown) {
              console.error('Reset error', e);
              toast.error('Gagal mereset.', {
                description: e instanceof Error ? e.message : String(e),
              });
            }
          }}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Dianggarkan
          </Button>
          <Button variant="outline" onClick={async () => {
            const electronAPI = getBatangTubuhElectronAPI();
            if (!electronAPI?.downloadBatangTubuhTemplate) {
              toast.error('Fitur template tidak tersedia di mode ini.');
              return;
            }
            try {
              let templateSource = batangTubuhs;
              if (electronAPI?.loadBatangTubuh) {
                const loaded = await electronAPI.loadBatangTubuh();
                if (Array.isArray(loaded) && loaded.length > 0) {
                  templateSource = loaded;
                  setBatangTubuhs(loaded);
                }
              }
              setTemplatePreviewText(csvSample(',', templateSource));
              setTemplatePreviewFormat('xlsx');
            } catch (e) {
              console.error('Failed to preview JSON template', e);
              setTemplatePreviewText(csvSample());
              setTemplatePreviewFormat('xlsx');
            }
            setTemplatePreviewOpen(true);
          }}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button disabled={isYearLocked || !canInput} onClick={async () => {
            openImportPreview();
          }}>
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
        </div>
      </div>

      {isYearLocked && <YearLockedBanner tahun={tahunAktif} detail='Anggaran Batang Tubuh hanya bisa dilihat. Buka kunci dari Pengaturan jika perlu revisi.' />}

      <ReportPrintDocument
        title='BATANG TUBUH'
        subtitle={`${jenis === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'} - Tahun Anggaran ${tahunAktif}`}
        meta={[
          { label: 'Jenis', value: jenis === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran' },
          { label: 'Total Dianggarkan', value: formatCurrency(grandTotal.dianggarkan) },
          { label: 'Total Realisasi', value: formatCurrency(grandTotal.realisasi) },
          { label: 'Lebih / Kurang', value: formatTargetVariance(grandTotal.selisih) },
        ]}
      >
        <table>
          <thead>
            <tr>
              <th className='text-center'>No</th>
              <th>Kode</th>
              <th>Nama Batang Tubuh</th>
              <th className='text-right'>Dianggarkan</th>
              <th className='text-right'>Realisasi</th>
              <th className='text-right'>Lebih / Kurang</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className='text-center'>Tidak ada data Batang Tubuh.</td></tr>
            ) : filtered.map((item, index) => {
              const total = btTotals[item.kode] || { dianggarkan: 0, realisasi: 0, selisih: 0 };
              return (
                <tr key={item.kode}>
                  <td className='text-center'>{index + 1}</td>
                  <td>{item.kode}</td>
                  <td>{item.nama}</td>
                  <td className='text-right'>{formatCurrency(total.dianggarkan)}</td>
                  <td className='text-right'>{formatCurrency(total.realisasi)}</td>
                  <td className='text-right'>{formatTargetVariance(total.selisih)}</td>
                </tr>
              );
            })}
            <tr className='font-bold'>
              <td colSpan={3}>TOTAL</td>
              <td className='text-right'>{formatCurrency(grandTotal.dianggarkan)}</td>
              <td className='text-right'>{formatCurrency(grandTotal.realisasi)}</td>
              <td className='text-right'>{formatTargetVariance(grandTotal.selisih)}</td>
            </tr>
          </tbody>
        </table>
      </ReportPrintDocument>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Dianggarkan</p>
                <p className="mt-2 text-xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(grandTotal.dianggarkan)}</p>
              </div>
              <Target className="h-5 w-5 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Realisasi</p>
                <p className="mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(grandTotal.realisasi)}</p>
              </div>
              <Activity className="h-5 w-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Lebih / Kurang</p>
                <p className={`mt-2 text-xl font-bold ${grandTotal.selisih >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                  {formatTargetVariance(grandTotal.selisih)}
                </p>
              </div>
              <Scale className="h-5 w-5 text-slate-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">Cakupan Data</p>
            <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{operationalSummary.realizationRate}%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {operationalSummary.groups} kelompok, {operationalSummary.detailRows} kode
            </p>
          </CardContent>
        </Card>
      </div>
      <Dialog open={templatePreviewOpen} onOpenChange={(v) => setTemplatePreviewOpen(v)} draggable>
        <DialogHeader draggable>
          <DialogTitle>Preview Template Batang Tubuh</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Format</label>
            <div className="flex gap-2">
              <button className={`px-3 py-1 border rounded ${templatePreviewFormat === 'json' ? 'bg-slate-100' : ''}`} onClick={async () => { setTemplatePreviewFormat('json'); try { const electronAPI = getBatangTubuhElectronAPI(); const bt = electronAPI?.loadBatangTubuh ? await electronAPI.loadBatangTubuh() : []; setTemplatePreviewText(JSON.stringify(bt || [], null, 2)); } catch { setTemplatePreviewText('[]'); } }}>JSON (BatangTubuh)</button>
              <button className={`px-3 py-1 border rounded ${templatePreviewFormat === 'csv' ? 'bg-slate-100' : ''}`} onClick={() => { setTemplatePreviewFormat('csv'); setTemplatePreviewText(csvSample()); }}>CSV</button>
              <button className={`px-3 py-1 border rounded ${templatePreviewFormat === 'xlsx' ? 'bg-slate-100' : ''}`} onClick={() => { setTemplatePreviewFormat('xlsx'); setTemplatePreviewText(csvSample()); }}>XLSX</button>
              <button className={`px-3 py-1 border rounded ${templatePreviewFormat === 'txt' ? 'bg-slate-100' : ''}`} onClick={() => { setTemplatePreviewFormat('txt'); setTemplatePreviewText(csvSample('\t')); }}>TXT (TSV)</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Preview</label>
            <textarea readOnly rows={8} className="w-full font-mono text-sm p-2 border rounded" value={templatePreviewText} />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTemplatePreviewOpen(false)}>Batal</Button>
          <Button onClick={async () => {
            const electronAPI = getBatangTubuhElectronAPI();
            if (!electronAPI?.downloadBatangTubuhTemplate) {
              toast.error('Fitur template tidak tersedia di mode ini.');
              return;
            }
            const res = await electronAPI.downloadBatangTubuhTemplate({
              format: templatePreviewFormat,
              tahun: tahunAktif,
              batangTubuhProgramByYear,
            });
            if (res?.success) {
              toast.success('Template berhasil disimpan.', {
                description: res.path,
              });
              setTemplatePreviewOpen(false);
            } else if (!res?.canceled) {
              toast.error('Gagal menyimpan template.', {
                description: res?.error || undefined,
              });
            }
          }}>Simpan</Button>
        </DialogFooter>
      </Dialog>
      <Dialog open={showValidationReport} onOpenChange={(v) => setShowValidationReport(v)} draggable>
        <DialogHeader draggable>
          <DialogTitle>Laporan Validasi Batang Tubuh</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="mb-2">
            <p className="text-sm">Ditemukan masalah saat memuat data Batang Tubuh.</p>
            <p className="text-sm text-slate-500">Jumlah baris file: {validationReport?.total ?? '-'}</p>
            <p className="text-sm text-slate-500">Masalah terdeteksi: {validationReport?.errors?.length ?? 0}</p>
          </div>
          <div className="overflow-auto max-h-48 border rounded p-2 bg-yellow-50">
            <pre className="text-xs font-mono">{JSON.stringify((validationReport?.errors || []).slice(0,20), null, 2)}</pre>
          </div>
          <div className="mt-3 text-sm text-slate-600">Pilih tindakan:</div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => { try { if (validationKey) window.localStorage.removeItem(validationKey); } catch { void 0; } setShowValidationReport(false); }}>Abaikan</Button>
          <Button onClick={applyAutoFixValidation}>Perbaikan Otomatis (isi kode)</Button>
        </DialogFooter>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Tampilan Data</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Menampilkan {operationalSummary.groups} kelompok dan {operationalSummary.detailRows} kode anggaran.
              </p>
            </div>
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input className="pl-10" placeholder="Cari kode, nama, atau Sub Seksi..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-[auto_1fr]">
            <div className="flex w-fit rounded-md border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              {(['pendapatan', 'pengeluaran'] as const).map((j) => (
                <Button
                  key={j}
                  size="sm"
                  variant={jenis === j ? 'default' : 'ghost'}
                  className={jenis === j ? 'shadow-sm' : 'text-slate-600 dark:text-slate-300'}
                  onClick={() => setJenis(j)}
                >
                  {j === 'pendapatan' ? 'Pendapatan' : 'Pengeluaran'}
                </Button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setShowDianggarkan(!showDianggarkan)}
                className={`rounded-md border p-3 text-left transition ${
                  showDianggarkan
                    ? 'border-blue-300 bg-blue-50 shadow-sm dark:border-blue-800 dark:bg-blue-950/30'
                    : 'border-slate-200 bg-white opacity-75 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${showDianggarkan ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>Dianggarkan</p>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(grandTotal.dianggarkan)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${showDianggarkan ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {showDianggarkan ? 'Aktif' : 'Mati'}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setShowRealisasi(!showRealisasi)}
                className={`rounded-md border p-3 text-left transition ${
                  showRealisasi
                    ? 'border-emerald-300 bg-emerald-50 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30'
                    : 'border-slate-200 bg-white opacity-75 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${showRealisasi ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>Realisasi</p>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(grandTotal.realisasi)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${showRealisasi ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {showRealisasi ? 'Aktif' : 'Mati'}
                  </span>
                </div>
              </button>
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
                {formatTargetVariance(grandTotal.selisih)}
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
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='py-4'>
                      <AppStateMessage
                        tone='search'
                        title='Tidak ada data Batang Tubuh'
                        detail='Ubah kata kunci pencarian atau pilihan jenis untuk menampilkan struktur anggaran.'
                        compact
                      />
                    </td>
                  </tr>
                ) : filtered.map((bt) => {
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
                            {t.selisih !== 0 ? formatTargetVariance(t.selisih) : '—'}
                          </td>
                        )}
                        <td className="sticky right-0 z-10 px-4 py-2 bg-slate-50/50 dark:bg-slate-800/30"></td>
                      </tr>
                      {/* Child rows - detailRows */}
                      {isExpanded && bt.detailRows.map((dr) => {
                        const drRealisasi = Number(hitungRealisasi[dr.kode] || 0);
                        const drSelisih = drRealisasi - (Number(dr.dianggarkan) || 0);
                        const programs = getProgramsForKode(dr.kode);
                        const programCount = programs.length;
                        const isProgramExpanded = expandedProgramKode === dr.kode;
                        return (
                          <React.Fragment key={dr.kode}>
                            <tr className="border-b border-slate-200 dark:border-slate-700/40 last:border-0 bg-slate-50/50 dark:bg-slate-800/30">
                              <td className="px-4 py-2"></td>
                              <td className="px-4 py-2 pl-8 font-mono text-xs dark:text-slate-200">{dr.kode}</td>
                              <td className="px-4 py-2 text-sm dark:text-slate-200">
                                <div>{dr.nama}</div>
                                {programCount > 0 && (
                                  <button
                                    type="button"
                                    className="mt-1 text-xs font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                                    onClick={() => setExpandedProgramKode(isProgramExpanded ? null : dr.kode)}
                                  >
                                    Buka detail
                                  </button>
                                )}
                              </td>
                              {showDianggarkan && (
                                <td className="px-4 py-2 text-right font-mono text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-900/20 border-l border-blue-100 dark:border-blue-900">
                                  <span className="inline-block">{dr.dianggarkan > 0 ? formatCurrency(dr.dianggarkan) : '—'}</span>
                                </td>
                              )}
                              {showRealisasi && (
                                <td className="px-4 py-2 text-right font-mono text-green-600 dark:text-green-400 bg-green-50/80 dark:bg-green-900/20 border-l border-green-100 dark:border-green-900">
                                  {drRealisasi > 0 ? formatCurrency(drRealisasi) : '—'}
                                </td>
                              )}
                              {showDianggarkan && showRealisasi && (
                                <td className={`px-4 py-2 text-right font-mono ${drSelisih >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {drSelisih !== 0 ? formatTargetVariance(drSelisih) : '—'}
                                </td>
                              )}
                              <td className="sticky right-0 z-10 px-4 py-2 text-center bg-slate-50/50 dark:bg-slate-800/30">
                              </td>
                            </tr>
                            {isProgramExpanded && (
                              <tr className="border-b border-sky-100 bg-sky-50/40 dark:border-sky-900/50 dark:bg-slate-950/40">
                                <td></td>
                                <td colSpan={6} className="px-4 py-3">
                                  <div className="ml-4 space-y-3 rounded-md border border-sky-200 bg-sky-50 p-3 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/20">
                                    {programs.map((program) => {
                                      const totalProgram = (program.rincian || []).reduce((sum, rincian) => sum + Number(rincian.jumlah || 0), 0);
                                      return (
                                        <div key={program.id} className="overflow-hidden rounded-md border border-emerald-200 bg-white shadow-sm dark:border-emerald-900/60 dark:bg-slate-900">
                                          <div className="flex items-center justify-between gap-3 border-l-4 border-emerald-500 bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                                            <p className="font-semibold text-emerald-950 dark:text-emerald-100">{program.namaProgram || 'Program Umum'}</p>
                                            <p className="rounded bg-white px-2 py-1 font-mono text-sm font-bold text-emerald-700 dark:bg-slate-950 dark:text-emerald-300">{formatCurrency(totalProgram)}</p>
                                          </div>
                                          <div className="divide-y divide-slate-100 px-3 py-1 text-sm dark:divide-slate-800">
                                            {(program.rincian || []).map((rincian) => (
                                              <div key={rincian.id} className="flex items-center justify-between gap-3 py-1.5">
                                                <span className="text-slate-700 dark:text-slate-200">{rincian.keterangan || '-'}</span>
                                                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(rincian.jumlah || 0)}</span>
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
                          </React.Fragment>
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
    {renderImportPreviewDialog()}
    </>
  );
}
