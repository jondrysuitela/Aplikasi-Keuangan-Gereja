import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CalendarX, CheckCircle2, Database, Download, FileWarning, Info, ListChecks, Search, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStore } from '@/stores';
import { cn, formatCurrency } from '@/lib/utils';
import { getDoorscrieftValidationIssues } from '@/lib/dataValidation';
import type { DoorscrieftRowInput } from '@/types';

type ValidationLevel = 'error' | 'warning' | 'info';

type ValidationIssue = {
  id: string;
  level: ValidationLevel;
  title: string;
  detail: string;
  row?: DoorscrieftRowInput;
};

function formatDate(value: Date | string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID');
}

function normalizeKode(value: unknown) {
  return String(value || '').trim();
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportIssuesToCsv(issues: ValidationIssue[], tahunAktif: number) {
  const rows = [
    ['Level', 'Judul', 'Detail', 'No', 'Tanggal', 'Kode Anggaran', 'Uraian', 'Penerimaan', 'Pengeluaran'],
    ...issues.map((issue) => [
      issue.level,
      issue.title,
      issue.detail,
      issue.row?.no || '',
      issue.row?.tanggal ? formatDate(issue.row.tanggal) : '',
      issue.row?.kodeAnggaran || '',
      issue.row?.uraian || '',
      Number(issue.row?.penerimaan || 0),
      Number(issue.row?.pengeluaran || 0),
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cek-data-keuangan-${tahunAktif}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function CekDataPage() {
  const { doorscrieftTransaksis, kodeAnggarans, tahunAktif, addAuditLog } = useStore();
  const [levelFilter, setLevelFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [query, setQuery] = useState('');

  const issues = useMemo<ValidationIssue[]>(() => {
    const nextIssues: ValidationIssue[] = [];

    getDoorscrieftValidationIssues(doorscrieftTransaksis, kodeAnggarans, tahunAktif).forEach((issue) => {
      const row = doorscrieftTransaksis.find((item) => item.id === issue.rowId);
      nextIssues.push({ ...issue, row });
    });

    doorscrieftTransaksis.forEach((row, index) => {
      const issuePrefix = row.id || String(index);
      const kode = normalizeKode(row.kodeAnggaran);
      const penerimaan = Number(row.penerimaan || 0);
      const pengeluaran = Number(row.pengeluaran || 0);
      const hasPenerimaan = penerimaan !== 0;
      const hasPengeluaran = pengeluaran !== 0;

      if (penerimaan < 0 || pengeluaran < 0) {
        nextIssues.push({
          id: `${issuePrefix}-nominal-negatif`,
          level: 'warning',
          title: 'Nominal negatif',
          detail: 'Nominal negatif perlu dicek ulang karena bisa memengaruhi total laporan.',
          row,
        });
      }

      if (kode.startsWith('I.') && hasPengeluaran) {
        nextIssues.push({
          id: `${issuePrefix}-pendapatan-pengeluaran`,
          level: 'warning',
          title: 'Kode pendapatan berisi pengeluaran',
          detail: 'Kode berawalan I. biasanya dipakai untuk pendapatan, tetapi transaksi ini mengisi pengeluaran.',
          row,
        });
      }

      if (kode.startsWith('II.') && hasPenerimaan) {
        nextIssues.push({
          id: `${issuePrefix}-pengeluaran-penerimaan`,
          level: 'warning',
          title: 'Kode pengeluaran berisi penerimaan',
          detail: 'Kode berawalan II. biasanya dipakai untuk pengeluaran, tetapi transaksi ini mengisi penerimaan.',
          row,
        });
      }

      if (hasPengeluaran && (!Array.isArray(row.attachments) || row.attachments.length === 0)) {
        nextIssues.push({
          id: `${issuePrefix}-pengeluaran-tanpa-bukti`,
          level: 'warning',
          title: 'Pengeluaran tanpa bukti',
          detail: 'Transaksi pengeluaran sebaiknya memiliki lampiran bukti/kuitansi untuk kebutuhan audit.',
          row,
        });
      }
    });

    return nextIssues;
  }, [doorscrieftTransaksis, kodeAnggarans, tahunAktif]);

  const activeYearRows = useMemo(() => {
    return doorscrieftTransaksis.filter((row) => {
      const date = new Date(row.tanggal);
      return !Number.isNaN(date.getTime()) && date.getFullYear() === tahunAktif;
    });
  }, [doorscrieftTransaksis, tahunAktif]);

  const issueCounts = useMemo(() => {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.level] += 1;
        return acc;
      },
      { error: 0, warning: 0, info: 0 } as Record<ValidationLevel, number>,
    );
  }, [issues]);

  const auditInsights = useMemo(() => {
    const rowIdsWithErrors = new Set(issues.filter((issue) => issue.level === 'error').map((issue) => issue.row?.id).filter(Boolean));
    return {
      validRows: activeYearRows.filter((row) => !rowIdsWithErrors.has(row.id)).length,
      unknownCodes: issues.filter((issue) => issue.id.includes('kode-tidak-terdaftar')).length,
      outsideYear: issues.filter((issue) => issue.id.includes('tahun-lain')).length,
      conflictingNominal: issues.filter((issue) => issue.id.includes('dua-nominal')).length,
      emptyNominal: issues.filter((issue) => issue.id.includes('nominal-kosong')).length,
      negativeNominal: issues.filter((issue) => issue.id.includes('nominal-negatif')).length,
      missingAttachment: issues.filter((issue) => issue.id.includes('pengeluaran-tanpa-bukti')).length,
    };
  }, [activeYearRows, issues]);

  const totalPenerimaan = activeYearRows.reduce((sum, row) => sum + Number(row.penerimaan || 0), 0);
  const totalPengeluaran = activeYearRows.reduce((sum, row) => sum + Number(row.pengeluaran || 0), 0);
  const auditStatus = issueCounts.error > 0 ? 'Perlu Perbaikan' : issueCounts.warning > 0 ? 'Perlu Review' : 'Siap Export';
  const normalizedQuery = query.trim().toLowerCase();
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (levelFilter !== 'all' && issue.level !== levelFilter) return false;
      if (!normalizedQuery) return true;

      const rowText = [
        issue.title,
        issue.detail,
        issue.row?.no,
        issue.row?.kodeAnggaran,
        issue.row?.uraian,
        issue.row?.tanggal,
      ].join(' ').toLowerCase();

      return rowText.includes(normalizedQuery);
    });
  }, [issues, levelFilter, normalizedQuery]);
  const filteredIssuesByLevel = {
    error: filteredIssues.filter((issue) => issue.level === 'error'),
    warning: filteredIssues.filter((issue) => issue.level === 'warning'),
    info: filteredIssues.filter((issue) => issue.level === 'info'),
  };

  const handleExportIssues = () => {
    exportIssuesToCsv(filteredIssues.length > 0 ? filteredIssues : issues, tahunAktif);
    addAuditLog('Export Cek Data', 'Validasi', `${filteredIssues.length || issues.length} isu diexport`, String(tahunAktif));
  };

  return (
    <div className='space-y-5'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>Quality Control</p>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Cek Data</h1>
          <p className='text-slate-500 dark:text-slate-400'>
            Audit transaksi Doorscrieft sebelum laporan dan export Excel Tahun {tahunAktif}.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button variant='outline' onClick={handleExportIssues} disabled={issues.length === 0}>
            <Download className='mr-2 h-4 w-4' />
            Export Hasil Cek
          </Button>
          <Button variant='outline' onClick={() => { window.location.hash = '#/doorscrieft'; }}>
            Buka Doorscrieft
          </Button>
          <Button variant='outline' onClick={() => { window.location.hash = '#/laporan'; }}>
            Lihat Laporan
          </Button>
          <Button onClick={() => { window.location.hash = '#/doorscrieft'; }}>
            Perbaiki Data
          </Button>
        </div>
      </div>

      <Card className={cn(
        'border-l-4',
        issueCounts.error > 0 ? 'border-l-red-500' : issueCounts.warning > 0 ? 'border-l-amber-500' : 'border-l-green-600',
      )}>
        <CardContent className='flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex items-center gap-3'>
            <div className={cn(
              'flex h-11 w-11 items-center justify-center rounded-md',
              issueCounts.error > 0 ? 'bg-red-50 text-red-600 dark:bg-red-950/40' : issueCounts.warning > 0 ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40' : 'bg-green-50 text-green-600 dark:bg-green-950/40',
            )}>
              {issueCounts.error > 0 ? <AlertTriangle className='h-5 w-5' /> : <ShieldCheck className='h-5 w-5' />}
            </div>
            <div>
              <p className='text-xs uppercase tracking-wide text-slate-500'>Status Audit</p>
              <p className='text-lg font-bold text-slate-900 dark:text-white'>{auditStatus}</p>
              <p className='text-sm text-slate-500 dark:text-slate-400'>
                {issueCounts.error > 0
                  ? 'Selesaikan error sebelum laporan final.'
                  : issueCounts.warning > 0
                    ? 'Data bisa dipakai, tapi masih perlu review.'
                    : 'Data siap dipakai untuk laporan.'}
              </p>
            </div>
          </div>
          <div className='grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3 lg:min-w-[520px]'>
            <span className='rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900'>Tahun aktif: <strong>{tahunAktif}</strong></span>
            <span className='rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900'>Error: <strong className='text-red-600'>{issueCounts.error}</strong></span>
            <span className='rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-900'>Peringatan: <strong className='text-amber-600'>{issueCounts.warning}</strong></span>
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 md:grid-cols-4'>
        <AuditMetric title={`Transaksi ${tahunAktif}`} value={String(activeYearRows.length)} detail={`${auditInsights.validRows} baris tanpa error`} icon={<ListChecks className='h-4 w-4' />} tone='neutral' />
        <AuditMetric title='Error' value={String(issueCounts.error)} detail={`${auditInsights.unknownCodes} kode tidak dikenal`} icon={<AlertTriangle className='h-4 w-4' />} tone={issueCounts.error > 0 ? 'danger' : 'good'} />
        <AuditMetric title='Peringatan' value={String(issueCounts.warning)} detail={`${auditInsights.outsideYear} tanggal luar tahun`} icon={<FileWarning className='h-4 w-4' />} tone={issueCounts.warning > 0 ? 'warn' : 'good'} />
        <AuditMetric title='Saldo Tahun Aktif' value={formatCurrency(totalPenerimaan - totalPengeluaran)} detail={`${auditInsights.conflictingNominal + auditInsights.emptyNominal + auditInsights.negativeNominal} isu nominal, ${auditInsights.missingAttachment} tanpa bukti`} icon={<Database className='h-4 w-4' />} tone='neutral' />
      </div>

      <div className='grid gap-3 md:grid-cols-3'>
        <InsightPill
          icon={<Database className='h-4 w-4' />}
          title='Master Kode'
          detail={`${kodeAnggarans.length} kode tersedia, ${auditInsights.unknownCodes} tidak cocok`}
          tone={auditInsights.unknownCodes > 0 ? 'danger' : 'good'}
        />
        <InsightPill
          icon={<CalendarX className='h-4 w-4' />}
          title='Tanggal'
          detail={auditInsights.outsideYear > 0 ? `${auditInsights.outsideYear} baris di luar ${tahunAktif}` : `Semua baris aktif berada di ${tahunAktif}`}
          tone={auditInsights.outsideYear > 0 ? 'warn' : 'good'}
        />
        <InsightPill
          icon={<FileWarning className='h-4 w-4' />}
          title='Nominal'
          detail={`${auditInsights.conflictingNominal} dobel, ${auditInsights.emptyNominal} kosong, ${auditInsights.negativeNominal} negatif`}
          tone={auditInsights.conflictingNominal > 0 || auditInsights.emptyNominal > 0 || auditInsights.negativeNominal > 0 ? 'warn' : 'good'}
        />
      </div>

      {issues.length === 0 ? (
        <Card className='border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30'>
          <CardContent className='flex items-center gap-3 py-6'>
            <CheckCircle2 className='h-6 w-6 text-green-600' />
            <div>
              <p className='font-semibold text-green-800 dark:text-green-300'>Data terlihat aman</p>
              <p className='text-sm text-green-700 dark:text-green-400'>
                Tidak ditemukan kode kosong, kode tidak terdaftar, tanggal bermasalah, atau nominal rancu.
              </p>
            </div>
            <Button className='ml-auto' onClick={() => { window.location.hash = '#/laporan'; }}>
              Buka Laporan
              <ArrowRight className='ml-2 h-4 w-4' />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
        <Card>
          <CardContent className='flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between'>
            <div className='flex flex-wrap gap-2'>
              {[
                ['all', `Semua (${issues.length})`],
                ['error', `Error (${issueCounts.error})`],
                ['warning', `Peringatan (${issueCounts.warning})`],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  size='sm'
                  variant={levelFilter === value ? 'default' : 'outline'}
                  onClick={() => setLevelFilter(value as 'all' | 'error' | 'warning')}
                >
                  {label}
                </Button>
              ))}
            </div>
            <label className='relative block w-full lg:max-w-sm'>
              <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className='h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                placeholder='Cari no, kode, uraian...'
              />
            </label>
          </CardContent>
        </Card>

        <div className='grid gap-5 xl:grid-cols-2'>
          <IssueSection
            title='Error yang wajib dibereskan'
            icon={<AlertTriangle className='h-5 w-5 text-red-600' />}
            issues={filteredIssuesByLevel.error}
            emptyText='Tidak ada error wajib.'
          />
          <IssueSection
            title='Peringatan yang perlu dicek'
            icon={<Info className='h-5 w-5 text-amber-600' />}
            issues={filteredIssuesByLevel.warning}
            emptyText='Tidak ada peringatan.'
          />
        </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Database className='h-5 w-5 text-blue-600' />
            Ringkasan Tahun Aktif
          </CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 text-sm md:grid-cols-3'>
          <div className='rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-800'>
            <p className='text-slate-500'>Total Penerimaan</p>
            <p className='mt-1 font-bold text-green-600'>{formatCurrency(totalPenerimaan)}</p>
          </div>
          <div className='rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-800'>
            <p className='text-slate-500'>Total Pengeluaran</p>
            <p className='mt-1 font-bold text-red-600'>{formatCurrency(totalPengeluaran)}</p>
          </div>
          <div className='rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-800'>
            <p className='text-slate-500'>Master Kode Anggaran</p>
            <p className='mt-1 font-bold text-slate-900 dark:text-white'>{kodeAnggarans.length}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditMetric({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: 'neutral' | 'good' | 'warn' | 'danger';
}) {
  return (
    <Card className={cn(
      tone === 'danger' && 'border-red-300 dark:border-red-900',
      tone === 'warn' && 'border-amber-300 dark:border-amber-900',
      tone === 'good' && 'border-green-300 dark:border-green-900',
    )}>
      <CardContent className='flex items-start justify-between gap-3 pt-6'>
        <div>
          <p className='text-sm text-slate-500'>{title}</p>
          <p className={cn(
            'mt-2 text-xl font-bold text-slate-900 dark:text-white',
            tone === 'danger' && 'text-red-600 dark:text-red-400',
            tone === 'warn' && 'text-amber-600 dark:text-amber-400',
            tone === 'good' && 'text-green-600 dark:text-green-400',
          )}>
            {value}
          </p>
          <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>{detail}</p>
        </div>
        <div className='rounded-md bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300'>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function InsightPill({
  icon,
  title,
  detail,
  tone,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  tone: 'good' | 'warn' | 'danger';
}) {
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-md border bg-white p-3 text-sm dark:bg-slate-800',
      tone === 'good' && 'border-green-200 dark:border-green-900',
      tone === 'warn' && 'border-amber-200 dark:border-amber-900',
      tone === 'danger' && 'border-red-200 dark:border-red-900',
    )}>
      <div className={cn(
        'rounded-md p-2',
        tone === 'good' && 'bg-green-50 text-green-600 dark:bg-green-950/40',
        tone === 'warn' && 'bg-amber-50 text-amber-600 dark:bg-amber-950/40',
        tone === 'danger' && 'bg-red-50 text-red-600 dark:bg-red-950/40',
      )}>
        {icon}
      </div>
      <div>
        <p className='font-semibold text-slate-900 dark:text-white'>{title}</p>
        <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>{detail}</p>
      </div>
    </div>
  );
}

function IssueSection({
  title,
  icon,
  issues,
  emptyText,
}: {
  title: string;
  icon: ReactNode;
  issues: ValidationIssue[];
  emptyText: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <p className='py-4 text-sm text-slate-500'>{emptyText}</p>
        ) : (
          <div className='max-h-[520px] space-y-2 overflow-y-auto pr-1'>
            {issues.map((issue) => (
              <div key={issue.id} className='rounded-md border p-3 text-sm dark:border-slate-700'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='font-semibold text-slate-900 dark:text-white'>{issue.title}</p>
                    <p className='mt-1 text-slate-500 dark:text-slate-400'>{issue.detail}</p>
                  </div>
                  {issue.row?.no && (
                    <span className='shrink-0 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-200'>
                      No {issue.row.no}
                    </span>
                  )}
                </div>
                {issue.row && (
                  <div className='mt-3 grid gap-2 rounded bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:grid-cols-2'>
                    <p><span className='font-semibold'>Tanggal:</span> {formatDate(issue.row.tanggal)}</p>
                    <p><span className='font-semibold'>Kode:</span> {issue.row.kodeAnggaran || '-'}</p>
                    <p className='sm:col-span-2'><span className='font-semibold'>Uraian:</span> {issue.row.uraian || '-'}</p>
                    <p><span className='font-semibold'>Penerimaan:</span> {formatCurrency(Number(issue.row.penerimaan || 0))}</p>
                    <p><span className='font-semibold'>Pengeluaran:</span> {formatCurrency(Number(issue.row.pengeluaran || 0))}</p>
                  </div>
                )}
                <div className='mt-3 flex justify-end'>
                  <Button variant='outline' size='sm' onClick={() => { window.location.hash = '#/doorscrieft'; }}>
                    Buka Doorscrieft
                    <ArrowRight className='ml-2 h-3.5 w-3.5' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
