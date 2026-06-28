import { Maximize2, Minus, Plus, Printer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useStore } from '@/stores';
import { churchLogoUrl } from '@/lib/assets';
import { getDoorscrieftValidationIssues, summarizeValidationForExport } from '@/lib/dataValidation';
import { getElectronAPI } from '@/lib/electron';
import { printWithPageSetup } from '@/lib/print';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';

type ReportPrintButtonProps = {
  title: string;
  disabled?: boolean;
  orientation?: 'portrait' | 'landscape';
};

type ReportPrintDocumentProps = {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string | number }>;
  children: ReactNode;
};

type PaperSize = {
  label: string;
  widthMm: number;
  heightMm: number;
};

const MM_TO_PX = 96 / 25.4;

const PAPER_SIZES: Record<string, PaperSize> = {
  F4: { label: 'F4 210 x 330 mm', widthMm: 210, heightMm: 330 },
  A4: { label: 'A4 210 x 297 mm', widthMm: 210, heightMm: 297 },
  Legal: { label: 'Legal 216 x 356 mm', widthMm: 216, heightMm: 356 },
  Letter: { label: 'Letter 216 x 279 mm', widthMm: 216, heightMm: 279 },
};

function getPaperPixels(
  paper: string,
  orientation: 'portrait' | 'landscape',
  customWidthMm: number | '',
  customHeightMm: number | '',
) {
  const size = paper === 'custom'
    ? {
        label: 'Custom',
        widthMm: Math.max(50, Number(customWidthMm) || PAPER_SIZES.F4.widthMm),
        heightMm: Math.max(50, Number(customHeightMm) || PAPER_SIZES.F4.heightMm),
      }
    : PAPER_SIZES[paper] || PAPER_SIZES.F4;
  const widthMm = orientation === 'landscape' ? size.heightMm : size.widthMm;
  const heightMm = orientation === 'landscape' ? size.widthMm : size.heightMm;
  return {
    width: Math.round(widthMm * MM_TO_PX),
    height: Math.round(heightMm * MM_TO_PX),
    widthMm,
    heightMm,
  };
}

function collectDocumentStyles() {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .join('\n');
}

export function ReportPrintButton({ title, disabled, orientation = 'landscape' }: ReportPrintButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [selectedOrientation, setSelectedOrientation] = useState<'portrait' | 'landscape'>(orientation);
  const [paper, setPaper] = useState('F4');
  const [customWidthMm, setCustomWidthMm] = useState<number | ''>(210);
  const [customHeightMm, setCustomHeightMm] = useState<number | ''>(330);
  const [previewMode, setPreviewMode] = useState<'page' | 'width' | 'custom'>('page');
  const [previewScale, setPreviewScale] = useState(100);
  const [marginMm, setMarginMm] = useState(10);
  const [compactTable, setCompactTable] = useState(false);
  const [showSignatures, setShowSignatures] = useState(true);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const confirm = useConfirm();
  const { doorscrieftTransaksis, kodeAnggarans, tahunAktif } = useStore();
  const paperPixels = useMemo(
    () => getPaperPixels(paper, selectedOrientation, customWidthMm, customHeightMm),
    [customHeightMm, customWidthMm, paper, selectedOrientation],
  );
  const marginPx = Math.round(marginMm * MM_TO_PX);

  const measurePreview = useCallback(() => {
    const viewportRect = previewViewportRef.current?.getBoundingClientRect();
    const frame = previewFrameRef.current;
    setViewportSize({
      width: viewportRect?.width || Math.max(360, window.innerWidth - 360),
      height: viewportRect?.height || Math.max(320, window.innerHeight - 220),
    });
    if (frame) {
      setContentSize({
        width: Math.max(frame.scrollWidth, frame.offsetWidth, paperPixels.width + marginPx * 2),
        height: Math.max(frame.scrollHeight, frame.offsetHeight, paperPixels.height + marginPx * 2),
      });
    } else {
      setContentSize({
        width: paperPixels.width + marginPx * 2,
        height: paperPixels.height + marginPx * 2,
      });
    }
  }, [marginPx, paperPixels.height, paperPixels.width]);

  useEffect(() => {
    if (!isOpen || !previewViewportRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setViewportSize({ width: rect.width, height: rect.height });
    });
    observer.observe(previewViewportRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    measurePreview();
    const raf = window.requestAnimationFrame(measurePreview);
    const timer = window.setTimeout(measurePreview, 120);
    window.addEventListener('resize', measurePreview);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener('resize', measurePreview);
    };
  }, [compactTable, customHeightMm, customWidthMm, isOpen, marginMm, measurePreview, paper, previewHtml, selectedOrientation, showSignatures]);

  const effectiveScale = useMemo(() => {
    const targetWidth = Math.max(contentSize.width, paperPixels.width + marginPx * 2);
    const targetHeight = Math.max(contentSize.height, paperPixels.height + marginPx * 2);
    const availableWidth = Math.max(320, viewportSize.width - 32);
    const availableHeight = Math.max(280, viewportSize.height - 32);
    if (previewMode === 'width') {
      return Math.min(1.3, Math.max(0.08, availableWidth / targetWidth));
    }
    if (previewMode === 'page') {
      return Math.min(1.3, Math.max(0.08, Math.min(availableWidth / targetWidth, availableHeight / targetHeight)));
    }
    return previewScale / 100;
  }, [contentSize.height, contentSize.width, marginPx, paperPixels.height, paperPixels.width, previewMode, previewScale, viewportSize.height, viewportSize.width]);

  const openPreview = async () => {
    const validation = summarizeValidationForExport(
      getDoorscrieftValidationIssues(doorscrieftTransaksis, kodeAnggarans, tahunAktif),
    );

    if (validation.errors > 0) {
      const lanjut = await confirm({
        title: 'Cetak laporan dengan data bermasalah?',
        description: `Ditemukan ${validation.errors} error data dan ${validation.warnings} peringatan. Pilih Batal untuk membuka halaman Cek Data.`,
        confirmText: 'Tetap Cetak',
        tone: 'warning',
      });
      if (!lanjut) {
        window.location.hash = '#/cek-data';
        return;
      }
    }

    const target = document.querySelector<HTMLElement>('.print-target');
    const nextPreviewHtml = target?.outerHTML || '<div class="p-4 text-sm text-slate-500">Preview cetak belum tersedia untuk halaman ini.</div>';
    const electronAPI = getElectronAPI();
    if (electronAPI?.openPrintPreviewWindow) {
      const result = await electronAPI.openPrintPreviewWindow({
        title,
        html: nextPreviewHtml,
        styles: collectDocumentStyles(),
        paper: 'F4',
        orientation,
        marginMm: 10,
        customWidthMm: 210,
        customHeightMm: 330,
      });
      if (result.success) return;
    }

    setPreviewHtml(nextPreviewHtml);
    setSelectedOrientation(orientation);
    setPaper('F4');
    setCustomWidthMm(210);
    setCustomHeightMm(330);
    setPreviewMode('page');
    setPreviewScale(100);
    setMarginMm(10);
    setCompactTable(false);
    setShowSignatures(true);
    setIsOpen(true);
  };

  const handlePrint = () => {
    setIsOpen(false);
    printWithPageSetup({
      title,
      paper: paper === 'custom' ? '' : paper,
      customWidthMm: paper === 'custom' ? paperPixels.widthMm : undefined,
      customHeightMm: paper === 'custom' ? paperPixels.heightMm : undefined,
      orientation: selectedOrientation,
      marginMm,
      scale: 1,
      styleId: 'report-print-page-setup',
    });
  };

  const normalizeCustomSize = (value: number | '', fallback: number, min: number, max: number) => {
    if (value === '' || !Number.isFinite(Number(value))) return fallback;
    return Math.min(max, Math.max(min, Number(value)));
  };

  return (
    <>
      <Button
        variant='outline'
        data-report-print-button='true'
        disabled={disabled}
        onClick={openPreview}
      >
        <Printer className='mr-2 h-4 w-4' /> Print
      </Button>

      {isOpen ? (
        <div className='fixed inset-0 z-[10000] flex flex-col bg-slate-950/75 p-3'>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-xl dark:border-slate-700 dark:bg-slate-900'>
            <div>
              <h2 className='text-lg font-semibold text-slate-900 dark:text-white'>Preview Cetak</h2>
              <p className='text-xs text-slate-500 dark:text-slate-400'>
                {paper} {selectedOrientation} - {Math.round(effectiveScale * 100)}% - {paperPixels.widthMm} x {paperPixels.heightMm} mm
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' onClick={() => setPreviewMode('page')}>
                <Maximize2 className='mr-2 h-4 w-4' /> Fit Halaman
              </Button>
              <Button variant='outline' onClick={() => setPreviewMode('width')}>Fit Lebar</Button>
              <Button variant='outline' onClick={() => setIsOpen(false)}>Tutup</Button>
              <Button onClick={handlePrint}>
                <Printer className='mr-2 h-4 w-4' /> Cetak
              </Button>
            </div>
          </div>

          <div className='grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]'>
            <aside className='min-h-0 space-y-4 overflow-auto rounded-md border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900'>
              <label className='space-y-1 text-sm'>
                <span className='font-medium text-slate-700 dark:text-slate-200'>Orientasi</span>
                <select
                  className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                  value={selectedOrientation}
                  onChange={(event) => setSelectedOrientation(event.target.value as 'portrait' | 'landscape')}
                >
                  <option value='portrait'>Portrait</option>
                  <option value='landscape'>Landscape</option>
                </select>
              </label>

              <label className='space-y-1 text-sm'>
                <span className='font-medium text-slate-700 dark:text-slate-200'>Ukuran Kertas</span>
                <select
                  className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                  value={paper}
                  onChange={(event) => setPaper(event.target.value)}
                >
                  {Object.entries(PAPER_SIZES).map(([key, size]) => (
                    <option key={key} value={key}>{size.label}</option>
                  ))}
                  <option value='custom'>Custom - ditentukan pengguna</option>
                </select>
              </label>

              {paper === 'custom' ? (
                <div className='grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700'>
                  <label className='space-y-1 text-sm'>
                    <span className='font-medium text-slate-700 dark:text-slate-200'>Lebar</span>
                    <div className='flex items-center gap-1'>
                      <input
                        type='number'
                        min={50}
                        max={500}
                        value={customWidthMm}
                        onChange={(event) => setCustomWidthMm(event.target.value === '' ? '' : Number(event.target.value))}
                        onBlur={() => setCustomWidthMm((value) => normalizeCustomSize(value, 210, 50, 500))}
                        className='h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                      />
                      <span className='text-xs text-slate-500'>mm</span>
                    </div>
                  </label>
                  <label className='space-y-1 text-sm'>
                    <span className='font-medium text-slate-700 dark:text-slate-200'>Tinggi</span>
                    <div className='flex items-center gap-1'>
                      <input
                        type='number'
                        min={50}
                        max={600}
                        value={customHeightMm}
                        onChange={(event) => setCustomHeightMm(event.target.value === '' ? '' : Number(event.target.value))}
                        onBlur={() => setCustomHeightMm((value) => normalizeCustomSize(value, 330, 50, 600))}
                        className='h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                      />
                      <span className='text-xs text-slate-500'>mm</span>
                    </div>
                  </label>
                </div>
              ) : null}

              <label className='space-y-2 text-sm'>
                <span className='font-medium text-slate-700 dark:text-slate-200'>Margin</span>
                <div className='flex items-center gap-2'>
                  <input
                    type='range'
                    min={5}
                    max={25}
                    value={marginMm}
                    onChange={(event) => setMarginMm(Number(event.target.value))}
                    className='w-full'
                  />
                  <span className='w-12 text-right text-xs text-slate-500'>{marginMm}mm</span>
                </div>
              </label>

              <label className='space-y-1 text-sm'>
                <span className='font-medium text-slate-700 dark:text-slate-200'>Mode Preview</span>
                <select
                  className='h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                  value={previewMode}
                  onChange={(event) => setPreviewMode(event.target.value as 'page' | 'width' | 'custom')}
                >
                  <option value='page'>Fit halaman</option>
                  <option value='width'>Fit lebar</option>
                  <option value='custom'>Zoom manual</option>
                </select>
              </label>

              <div className='space-y-2 text-sm'>
                <div className='flex items-center justify-between'>
                  <span className='font-medium text-slate-700 dark:text-slate-200'>Zoom</span>
                  <span className='text-xs text-slate-500'>{Math.round(effectiveScale * 100)}%</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    disabled={previewMode !== 'custom'}
                    onClick={() => setPreviewScale((value) => Math.max(35, value - 10))}
                  >
                    <Minus className='h-4 w-4' />
                  </Button>
                  <input
                    type='range'
                    min={35}
                    max={130}
                    value={previewScale}
                    disabled={previewMode !== 'custom'}
                    onChange={(event) => setPreviewScale(Number(event.target.value))}
                    className='w-full'
                  />
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    disabled={previewMode !== 'custom'}
                    onClick={() => setPreviewScale((value) => Math.min(130, value + 10))}
                  >
                    <Plus className='h-4 w-4' />
                  </Button>
                </div>
              </div>

              <div className='space-y-2 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-900'>
                <label className='flex items-center justify-between gap-3'>
                  <span className='font-medium text-slate-700 dark:text-slate-200'>Tabel padat</span>
                  <input
                    type='checkbox'
                    checked={compactTable}
                    onChange={(event) => setCompactTable(event.target.checked)}
                    className='h-4 w-4'
                  />
                </label>
                <label className='flex items-center justify-between gap-3'>
                  <span className='font-medium text-slate-700 dark:text-slate-200'>Tanda tangan</span>
                  <input
                    type='checkbox'
                    checked={showSignatures}
                    onChange={(event) => setShowSignatures(event.target.checked)}
                    className='h-4 w-4'
                  />
                </label>
              </div>

              <div className='rounded-md border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400'>
                <p className='font-medium text-slate-700 dark:text-slate-200'>Halaman</p>
                <p>{paper === 'custom' ? 'Custom' : paper} {selectedOrientation}</p>
                <p>{paperPixels.widthMm} x {paperPixels.heightMm} mm</p>
              </div>
            </aside>

            <div ref={previewViewportRef} className='min-h-0 overflow-auto rounded-md border border-slate-300 bg-slate-200 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-950'>
              <div
                className='mx-auto'
                style={{
                  width: Math.max(contentSize.width, paperPixels.width + marginPx * 2) * effectiveScale,
                  minHeight: Math.max(contentSize.height, paperPixels.height + marginPx * 2) * effectiveScale,
                } as CSSProperties}
              >
                <div
                  ref={previewFrameRef}
                  className={`print-preview-frame bg-white text-slate-900 shadow-xl ${compactTable ? 'print-preview-compact' : ''} ${showSignatures ? '' : 'print-preview-hide-signatures'}`}
                  style={{
                    width: paperPixels.width,
                    minHeight: paperPixels.height,
                    padding: `${marginPx}px`,
                    transform: `scale(${effectiveScale})`,
                    transformOrigin: 'top left',
                  } as CSSProperties}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ReportPrintDocument({ title, subtitle, children }: ReportPrintDocumentProps) {
  const {
    namaJemaat,
    kopGereja,
    kopKlas,
    penandatanganKiriJabatan,
    penandatanganKiriNama,
    penandatanganKananJabatan,
    penandatanganKananNama,
  } = useStore();
  return (
    <section className='print-target print-only bg-white p-4 text-slate-900'>
      <header className='mb-4 flex items-center justify-center gap-4 border-b-2 border-slate-900 pb-3'>
        <img src={churchLogoUrl} alt='GPM' className='h-20 w-20 flex-shrink-0' />
        <div className='text-center'>
          <p className='text-sm font-bold uppercase'>{kopGereja || 'Gereja Protestan Maluku'}</p>
          <p className='text-xs'>(ANGGOTA PGI)</p>
          <p className='text-xs font-bold uppercase'>{kopKlas || 'KLASIS'}</p>
          <p className='text-sm font-bold uppercase'>{namaJemaat || 'JEMAAT'}</p>
          <p className='mt-2 text-base font-bold uppercase'>{title}</p>
          {subtitle ? <p className='text-xs uppercase tracking-wide'>{subtitle}</p> : null}
        </div>
      </header>

      <div className='print-report-content'>
        {children}
      </div>

      <footer className='print-signature mt-8 grid grid-cols-2 gap-8 text-center text-xs'>
        <div>
          <p>Mengetahui,</p>
          <p className='font-semibold'>{penandatanganKiriJabatan || 'Ketua Majelis Jemaat'}</p>
          <div className='h-16' />
          <p className='border-t border-slate-400 pt-1 font-semibold'>{penandatanganKiriNama || '\u00A0'}</p>
        </div>
        <div>
          <p>Disusun oleh,</p>
          <p className='font-semibold'>{penandatanganKananJabatan || 'Bendahara Jemaat'}</p>
          <div className='h-16' />
          <p className='border-t border-slate-400 pt-1 font-semibold'>{penandatanganKananNama || '\u00A0'}</p>
        </div>
      </footer>
    </section>
  );
}
