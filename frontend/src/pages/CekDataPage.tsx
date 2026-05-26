import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Database, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStore } from '@/stores';
import { formatCurrency } from '@/lib/utils';
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

export function CekDataPage() {
  const { doorscrieftTransaksis, kodeAnggarans, tahunAktif } = useStore();

  const masterKode = useMemo(() => {
    return new Set(kodeAnggarans.map((item) => normalizeKode(item.kodeAnggaran)).filter(Boolean));
  }, [kodeAnggarans]);

  const issues = useMemo<ValidationIssue[]>(() => {
    const nextIssues: ValidationIssue[] = [];

    doorscrieftTransaksis.forEach((row, index) => {
      const issuePrefix = row.id || String(index);
      const date = new Date(row.tanggal);
      const hasValidDate = !Number.isNaN(date.getTime());
      const kode = normalizeKode(row.kodeAnggaran);
      const penerimaan = Number(row.penerimaan || 0);
      const pengeluaran = Number(row.pengeluaran || 0);
      const hasPenerimaan = penerimaan !== 0;
      const hasPengeluaran = pengeluaran !== 0;

      if (!hasValidDate) {
        nextIssues.push({
          id: `${issuePrefix}-tanggal-invalid`,
          level: 'error',
          title: 'Tanggal tidak valid',
          detail: 'Transaksi ini tidak punya tanggal yang bisa dibaca aplikasi.',
          row,
        });
      } else if (date.getFullYear() !== tahunAktif) {
        nextIssues.push({
          id: `${issuePrefix}-tahun-lain`,
          level: 'warning',
          title: 'Tanggal di luar tahun aktif',
          detail: `Transaksi berada di tahun ${date.getFullYear()}, sedangkan tahun aktif sekarang ${tahunAktif}.`,
          row,
        });
      }

      if (!kode) {
        nextIssues.push({
          id: `${issuePrefix}-kode-kosong`,
          level: 'error',
          title: 'Kode anggaran kosong',
          detail: 'Export dan laporan memakai KODE ANGGARAN sebagai kunci utama, jadi kode wajib diisi.',
          row,
        });
      } else if (!masterKode.has(kode)) {
        nextIssues.push({
          id: `${issuePrefix}-kode-tidak-terdaftar`,
          level: 'error',
          title: 'Kode anggaran tidak terdaftar',
          detail: `Kode "${kode}" tidak ditemukan di master DATA BASE2.`,
          row,
        });
      }

      if (hasPenerimaan && hasPengeluaran) {
        nextIssues.push({
          id: `${issuePrefix}-dua-nominal`,
          level: 'error',
          title: 'Penerimaan dan pengeluaran terisi bersamaan',
          detail: 'Satu transaksi sebaiknya hanya mengisi salah satu nominal agar laporan tidak rancu.',
          row,
        });
      }

      if (!hasPenerimaan && !hasPengeluaran) {
        nextIssues.push({
          id: `${issuePrefix}-nominal-kosong`,
          level: 'warning',
          title: 'Nominal kosong',
          detail: 'Transaksi tidak memiliki penerimaan maupun pengeluaran.',
          row,
        });
      }

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
    });

    return nextIssues;
  }, [doorscrieftTransaksis, masterKode, tahunAktif]);

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

  const issuesByLevel = {
    error: issues.filter((issue) => issue.level === 'error'),
    warning: issues.filter((issue) => issue.level === 'warning'),
    info: issues.filter((issue) => issue.level === 'info'),
  };

  const totalPenerimaan = activeYearRows.reduce((sum, row) => sum + Number(row.penerimaan || 0), 0);
  const totalPengeluaran = activeYearRows.reduce((sum, row) => sum + Number(row.pengeluaran || 0), 0);

  return (
    <div className='space-y-5'>
      <div>
        <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Cek Data</h1>
        <p className='text-slate-500 dark:text-slate-400'>
          Validasi transaksi Doorscrieft sebelum laporan dan export Excel.
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-4'>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-sm text-slate-500'>Transaksi {tahunAktif}</p>
            <p className='mt-2 text-2xl font-bold text-slate-900 dark:text-white'>{activeYearRows.length}</p>
          </CardContent>
        </Card>
        <Card className={issueCounts.error > 0 ? 'border-red-300 dark:border-red-900' : ''}>
          <CardContent className='pt-6'>
            <p className='text-sm text-slate-500'>Error</p>
            <p className='mt-2 text-2xl font-bold text-red-600'>{issueCounts.error}</p>
          </CardContent>
        </Card>
        <Card className={issueCounts.warning > 0 ? 'border-amber-300 dark:border-amber-900' : ''}>
          <CardContent className='pt-6'>
            <p className='text-sm text-slate-500'>Peringatan</p>
            <p className='mt-2 text-2xl font-bold text-amber-600'>{issueCounts.warning}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-sm text-slate-500'>Saldo Tahun Aktif</p>
            <p className='mt-2 text-xl font-bold text-blue-700 dark:text-blue-400'>
              {formatCurrency(totalPenerimaan - totalPengeluaran)}
            </p>
          </CardContent>
        </Card>
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
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-5 xl:grid-cols-2'>
          <IssueSection
            title='Error yang wajib dibereskan'
            icon={<AlertTriangle className='h-5 w-5 text-red-600' />}
            issues={issuesByLevel.error}
            emptyText='Tidak ada error wajib.'
          />
          <IssueSection
            title='Peringatan yang perlu dicek'
            icon={<Info className='h-5 w-5 text-amber-600' />}
            issues={issuesByLevel.warning}
            emptyText='Tidak ada peringatan.'
          />
        </div>
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
