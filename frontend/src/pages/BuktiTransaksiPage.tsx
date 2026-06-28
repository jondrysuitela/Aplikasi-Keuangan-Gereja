import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Download, Eye, FileWarning, FolderOpen, Paperclip, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStore } from '@/stores';
import { formatCurrency, getMonthName } from '@/lib/utils';
import { getElectronAPI } from '@/lib/electron';
import type { DoorscrieftRowInput, TransactionAttachment } from '@/types';
import { AppStateMessage } from '@/components/AppStateMessage';

type ProofStatus = 'semua' | 'sudah' | 'belum' | 'pengeluaran-tanpa-bukti' | 'file-hilang';

function formatDate(value: Date | string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID');
}

function formatAttachmentSize(size?: number) {
  if (!size || size <= 0) return '-';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function getRowAmount(row: DoorscrieftRowInput) {
  return Number(row.penerimaan || 0) || Number(row.pengeluaran || 0);
}

export function BuktiTransaksiPage() {
  const { doorscrieftTransaksis, tahunAktif, addAuditLog } = useStore();
  const [monthFilter, setMonthFilter] = useState<'semua' | number>('semua');
  const [statusFilter, setStatusFilter] = useState<ProofStatus>('semua');
  const [query, setQuery] = useState('');
  const [missingAttachmentIds, setMissingAttachmentIds] = useState<Set<string>>(new Set());
  const [isCheckingFiles, setIsCheckingFiles] = useState(false);

  const yearRows = useMemo(() => {
    return doorscrieftTransaksis
      .filter((row) => {
        const date = new Date(row.tanggal);
        return !Number.isNaN(date.getTime()) && date.getFullYear() === tahunAktif;
      })
      .sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());
  }, [doorscrieftTransaksis, tahunAktif]);

  const stats = useMemo(() => {
    const expenseRows = yearRows.filter((row) => Number(row.pengeluaran || 0) > 0);
    const rowsWithProof = yearRows.filter((row) => (row.attachments || []).length > 0);
    const expenseRowsWithoutProof = expenseRows.filter((row) => (row.attachments || []).length === 0);
    const totalAttachments = yearRows.reduce((sum, row) => sum + (row.attachments || []).length, 0);
    const completeness = expenseRows.length > 0 ? Math.round(((expenseRows.length - expenseRowsWithoutProof.length) / expenseRows.length) * 100) : 100;
    return {
      totalRows: yearRows.length,
      expenseRows: expenseRows.length,
      rowsWithProof: rowsWithProof.length,
      expenseRowsWithoutProof: expenseRowsWithoutProof.length,
      totalAttachments,
      completeness,
    };
  }, [yearRows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return yearRows.filter((row) => {
      const date = new Date(row.tanggal);
      if (monthFilter !== 'semua' && date.getMonth() + 1 !== monthFilter) return false;

      const attachments = row.attachments || [];
      const hasProof = attachments.length > 0;
      const hasMissingFile = attachments.some((attachment) => missingAttachmentIds.has(attachment.id));
      const isExpense = Number(row.pengeluaran || 0) > 0;

      if (statusFilter === 'sudah' && !hasProof) return false;
      if (statusFilter === 'belum' && hasProof) return false;
      if (statusFilter === 'pengeluaran-tanpa-bukti' && (!isExpense || hasProof)) return false;
      if (statusFilter === 'file-hilang' && !hasMissingFile) return false;

      if (!normalizedQuery) return true;
      return [
        row.no,
        row.uraian,
        row.kodeAnggaran,
        row.mataAnggaran,
        ...attachments.map((attachment) => attachment.fileName),
      ].join(' ').toLowerCase().includes(normalizedQuery);
    });
  }, [missingAttachmentIds, monthFilter, query, statusFilter, yearRows]);

  const handleOpenAttachment = async (attachment: TransactionAttachment) => {
    const result = await getElectronAPI()?.openAttachment?.(attachment.storedPath);
    if (!result?.success) toast.error(result?.error || 'File bukti tidak bisa dibuka.');
  };

  const handleShowAttachmentInFolder = async (attachment: TransactionAttachment) => {
    const result = await getElectronAPI()?.showAttachmentInFolder?.(attachment.storedPath);
    if (!result?.success) toast.error(result?.error || 'Folder bukti tidak bisa dibuka.');
  };

  const checkAttachmentFiles = async () => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.checkAttachmentExists) {
      toast.error('Cek file bukti hanya tersedia di aplikasi desktop Electron.');
      return;
    }
    setIsCheckingFiles(true);
    try {
      const missing = new Set<string>();
      const attachments = yearRows.flatMap((row) => row.attachments || []);
      for (const attachment of attachments) {
        const result = await electronAPI.checkAttachmentExists(attachment.storedPath);
        if (!result?.success || !result.exists) missing.add(attachment.id);
      }
      setMissingAttachmentIds(missing);
      toast.success('Pemeriksaan file bukti selesai.', {
        description: missing.size > 0 ? `${missing.size} lampiran tidak ditemukan.` : 'Semua file lampiran ditemukan.',
      });
    } finally {
      setIsCheckingFiles(false);
    }
  };

  const exportIndex = () => {
    const rows = [
      ['Tanggal', 'No', 'Uraian', 'Kode Anggaran', 'Mata Anggaran', 'Jenis', 'Nominal', 'Status Bukti', 'Nama File', 'Ukuran', 'Path'],
      ...filteredRows.flatMap((row) => {
        const attachments = row.attachments || [];
        const status = attachments.length > 0 ? 'Ada Bukti' : Number(row.pengeluaran || 0) > 0 ? 'Pengeluaran Tanpa Bukti' : 'Belum Ada Bukti';
        const jenis = Number(row.penerimaan || 0) > 0 ? 'Penerimaan' : Number(row.pengeluaran || 0) > 0 ? 'Pengeluaran' : '-';
        if (attachments.length === 0) {
          return [[formatDate(row.tanggal), row.no, row.uraian, row.kodeAnggaran, row.mataAnggaran, jenis, getRowAmount(row), status, '', '', '']];
        }
        return attachments.map((attachment) => [
          formatDate(row.tanggal),
          row.no,
          row.uraian,
          row.kodeAnggaran,
          row.mataAnggaran,
          jenis,
          getRowAmount(row),
          missingAttachmentIds.has(attachment.id) ? 'File Hilang' : 'Ada Bukti',
          attachment.fileName,
          formatAttachmentSize(attachment.size),
          attachment.storedPath,
        ]);
      }),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `indeks-bukti-transaksi-${tahunAktif}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addAuditLog('Export Indeks Bukti', 'Bukti Transaksi', `${filteredRows.length} transaksi`, String(tahunAktif));
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300'>
            <Paperclip className='h-4 w-4' />
            Audit Bukti
          </div>
          <h1 className='mt-1 text-2xl font-bold text-slate-900 dark:text-white'>Bukti Transaksi</h1>
          <p className='text-slate-500 dark:text-slate-400'>Pantau kelengkapan bukti transaksi Doorscrieft Tahun {tahunAktif}.</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' onClick={checkAttachmentFiles} disabled={isCheckingFiles || stats.totalAttachments === 0}>
            <ShieldCheck className='mr-2 h-4 w-4' /> {isCheckingFiles ? 'Memeriksa...' : 'Cek File'}
          </Button>
          <Button variant='outline' onClick={exportIndex} disabled={filteredRows.length === 0}>
            <Download className='mr-2 h-4 w-4' /> Export Indeks
          </Button>
          <Button onClick={() => { window.location.hash = '#/doorscrieft'; }}>
            Buka Doorscrieft
          </Button>
        </div>
      </div>

      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
        <ProofMetric title='Transaksi' value={String(stats.totalRows)} detail={`Tahun ${tahunAktif}`} icon={<CalendarDays className='h-4 w-4' />} tone='neutral' />
        <ProofMetric title='Dengan Bukti' value={String(stats.rowsWithProof)} detail={`${stats.totalAttachments} file lampiran`} icon={<CheckCircle2 className='h-4 w-4' />} tone='good' />
        <ProofMetric title='Pengeluaran' value={String(stats.expenseRows)} detail='Baris pengeluaran' icon={<FileWarning className='h-4 w-4' />} tone='neutral' />
        <ProofMetric title='Tanpa Bukti' value={String(stats.expenseRowsWithoutProof)} detail='Pengeluaran perlu bukti' icon={<FileWarning className='h-4 w-4' />} tone={stats.expenseRowsWithoutProof > 0 ? 'warn' : 'good'} />
        <ProofMetric title='Kelengkapan' value={`${stats.completeness}%`} detail='Pengeluaran berbukti' icon={<ShieldCheck className='h-4 w-4' />} tone={stats.completeness >= 90 ? 'good' : stats.completeness >= 70 ? 'warn' : 'danger'} />
      </div>

      <Card>
        <CardHeader className='border-b border-slate-100 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/70'>
          <div className='grid gap-3 lg:grid-cols-[160px_220px_1fr]'>
            <select
              className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white'
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value === 'semua' ? 'semua' : Number(event.target.value))}
            >
              <option value='semua'>Semua Bulan</option>
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>{getMonthName(index + 1)}</option>
              ))}
            </select>
            <select
              className='h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white'
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ProofStatus)}
            >
              <option value='semua'>Semua Status</option>
              <option value='sudah'>Sudah Ada Bukti</option>
              <option value='belum'>Belum Ada Bukti</option>
              <option value='pengeluaran-tanpa-bukti'>Pengeluaran Tanpa Bukti</option>
              <option value='file-hilang'>File Hilang</option>
            </select>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
              <Input className='pl-10' placeholder='Cari no, uraian, kode, atau nama file...' value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-0'>
          {filteredRows.length === 0 ? (
            <div className='p-6'>
              <AppStateMessage tone='search' title='Tidak ada transaksi sesuai filter' detail='Ubah bulan, status, atau kata kunci pencarian.' compact />
            </div>
          ) : (
            <div className='overflow-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900'>
                    <th className='px-4 py-3'>Tanggal</th>
                    <th className='px-4 py-3'>No</th>
                    <th className='px-4 py-3'>Uraian</th>
                    <th className='px-4 py-3'>Kode</th>
                    <th className='px-4 py-3 text-right'>Nominal</th>
                    <th className='px-4 py-3'>Bukti</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
                  {filteredRows.map((row) => {
                    const attachments = row.attachments || [];
                    const isExpenseWithoutProof = Number(row.pengeluaran || 0) > 0 && attachments.length === 0;
                    return (
                      <tr key={row.id} className='bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70'>
                        <td className='whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300'>{formatDate(row.tanggal)}</td>
                        <td className='px-4 py-3 font-mono text-xs text-slate-500'>{row.no || '-'}</td>
                        <td className='min-w-[260px] px-4 py-3'>
                          <p className='font-medium text-slate-900 dark:text-white'>{row.uraian || '-'}</p>
                          <p className='text-xs text-slate-500 dark:text-slate-400'>{row.mataAnggaran || '-'}</p>
                        </td>
                        <td className='px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200'>{row.kodeAnggaran || '-'}</td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${Number(row.penerimaan || 0) > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                          {formatCurrency(getRowAmount(row))}
                        </td>
                        <td className='min-w-[280px] px-4 py-3'>
                          {attachments.length === 0 ? (
                            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${isExpenseWithoutProof ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                              {isExpenseWithoutProof ? 'Pengeluaran tanpa bukti' : 'Belum ada bukti'}
                            </span>
                          ) : (
                            <div className='space-y-1'>
                              {attachments.map((attachment) => {
                                const missing = missingAttachmentIds.has(attachment.id);
                                return (
                                  <div key={attachment.id} className='flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800'>
                                    <div className='min-w-0'>
                                      <p className={`truncate text-xs font-semibold ${missing ? 'text-red-700 dark:text-red-300' : 'text-slate-800 dark:text-slate-100'}`}>{attachment.fileName}</p>
                                      <p className='text-[11px] text-slate-500 dark:text-slate-400'>{missing ? 'File tidak ditemukan' : formatAttachmentSize(attachment.size)}</p>
                                    </div>
                                    <div className='flex shrink-0 items-center gap-1'>
                                      <button type='button' className='rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/50' onClick={() => handleOpenAttachment(attachment)} title='Buka bukti'>
                                        <Eye className='h-3.5 w-3.5' />
                                      </button>
                                      <button type='button' className='rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700' onClick={() => handleShowAttachmentInFolder(attachment)} title='Buka folder'>
                                        <FolderOpen className='h-3.5 w-3.5' />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProofMetric({ title, value, detail, icon, tone }: { title: string; value: string; detail: string; icon: React.ReactNode; tone: 'good' | 'warn' | 'danger' | 'neutral' }) {
  const toneClass = {
    good: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-300',
    warn: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-300',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/25 dark:text-rose-300',
    neutral: 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  }[tone];
  return (
    <Card className={toneClass}>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='text-xs font-semibold uppercase opacity-80'>{title}</p>
            <p className='mt-2 text-2xl font-bold'>{value}</p>
          </div>
          <span className='rounded-md bg-white/80 p-2 shadow-sm dark:bg-slate-950/70'>{icon}</span>
        </div>
        <p className='mt-2 text-xs opacity-80'>{detail}</p>
      </CardContent>
    </Card>
  );
}
