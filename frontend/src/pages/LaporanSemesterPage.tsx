import { Fragment, useMemo, useState } from 'react';
import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { FileText, TrendingUp, TrendingDown, Wallet, Users, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import type { DoorscrieftRowInput, SubSeksi, BatangTubuhItem } from '@/types';

type Semester = 1 | 2;

function getSemesterMonths(semester: Semester) {
  return semester === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
}

function getSemesterLabel(semester: Semester) {
  return semester === 1 ? 'Semester 1 (Jan - Jun)' : 'Semester 2 (Jul - Des)';
}

type SubSeksiSummary = {
  subSeksi: SubSeksi;
  totalPendapatan: number;
  totalPengeluaran: number;
  programs: ProgramSummary[];
};

type TransaksiDetail = {
  id: string;
  tanggal: string;
  uraian: string;
  penerimaan: number;
  pengeluaran: number;
};

type ProgramSummary = {
  kode: string;
  nama: string;
  totalPendapatan: number;
  totalPengeluaran: number;
  transaksis: TransaksiDetail[];
};

function buildSubSeksiMap(batangTubuhs: BatangTubuhItem[]) {
  // Hanya kode anggaran dengan prefix I.3. (pendapatan sub-seksi)
  // dan II.3. (pengeluaran sub-seksi) yang termasuk sub-seksi
  const map = new Map<string, string>();

  for (const group of batangTubuhs) {
    if (group.detailRows) {
      for (const row of group.detailRows) {
        if (row.kode && (row.kode.startsWith('I.3.') || row.kode.startsWith('II.3.'))) {
          map.set(row.kode, group.subSeksiKode || '');
        }
      }
    }
    if (group.batangTubuh) {
      for (const bt of group.batangTubuh) {
        if (bt.detailRows) {
          for (const row of bt.detailRows) {
            if (row.kode && (row.kode.startsWith('I.3.') || row.kode.startsWith('II.3.'))) {
              map.set(row.kode, group.subSeksiKode || '');
            }
          }
        }
      }
    }
  }

  return map;
}

export function LaporanSemesterPage() {
  const {
    tahunAktif,
    doorscrieftTransaksis,
    subSeksis,
    batangTubuhs,
    namaJemaat,
  } = useStore();

  const [semester, setSemester] = useState<Semester>(1);
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set());

  const toggleProgram = (id: string) => {
    setExpandedPrograms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const kodeToSubSeksi = useMemo(() => {
    const map = new Map<string, SubSeksi>();
    for (const ss of subSeksis) {
      if (ss.kode) map.set(ss.kode, ss);
    }
    return map;
  }, [subSeksis]);

  const kodeAnggaranToSubSeksiKode = useMemo(
    () => buildSubSeksiMap(batangTubuhs),
    [batangTubuhs]
  );

  const semesterData = useMemo(() => {
    const months = getSemesterMonths(semester);

    const filtered = doorscrieftTransaksis.filter((t) => {
      const d = new Date(t.tanggal);
      return (
        !Number.isNaN(d.getTime()) &&
        d.getFullYear() === tahunAktif &&
        months.includes(d.getMonth() + 1)
      );
    });

    const totalPendapatan = filtered.reduce(
      (sum, t) => sum + Number(t.penerimaan || 0), 0
    );
    const totalPengeluaran = filtered.reduce(
      (sum, t) => sum + Number(t.pengeluaran || 0), 0
    );

    // Filter hanya transaksi dengan kode I.3.* (pendapatan sub-seksi)
    // dan II.3.* (pengeluaran sub-seksi) untuk breakdown per sub-seksi
    const subSeksiTransactions = filtered.filter(
      (t) => t.kodeAnggaran?.startsWith('I.3.') || t.kodeAnggaran?.startsWith('II.3.')
    );

    const bySubSeksiKode = new Map<string, DoorscrieftRowInput[]>();

    for (const t of subSeksiTransactions) {
      const subSeksiKode = kodeAnggaranToSubSeksiKode.get(t.kodeAnggaran);
      if (!subSeksiKode) continue;
      const existing = bySubSeksiKode.get(subSeksiKode) || [];
      existing.push(t);
      bySubSeksiKode.set(subSeksiKode, existing);
    }

    const summaries: SubSeksiSummary[] = [];

    for (const [ssKode, transaksis] of bySubSeksiKode) {
      const subSeksi = kodeToSubSeksi.get(ssKode);
      const byProgram = new Map<string, { nama: string; pendapatan: number; pengeluaran: number; transaksis: TransaksiDetail[] }>();

      for (const t of transaksis) {
        const programKode = t.kodeAnggaran;
        const existing = byProgram.get(programKode) || {
          nama: t.mataAnggaran || programKode,
          pendapatan: 0,
          pengeluaran: 0,
          transaksis: [],
        };
        existing.pendapatan += Number(t.penerimaan || 0);
        existing.pengeluaran += Number(t.pengeluaran || 0);
        existing.transaksis.push({
          id: t.id,
          tanggal: formatDate(t.tanggal),
          uraian: t.uraian,
          penerimaan: Number(t.penerimaan || 0),
          pengeluaran: Number(t.pengeluaran || 0),
        });
        byProgram.set(programKode, existing);
      }

      const programs: ProgramSummary[] = [];
      for (const [kode, prog] of byProgram) {
        programs.push({
          kode,
          nama: prog.nama,
          totalPendapatan: prog.pendapatan,
          totalPengeluaran: prog.pengeluaran,
          transaksis: prog.transaksis.sort(
            (a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime()
          ),
        });
      }
      programs.sort((a, b) => a.nama.localeCompare(b.nama));

      const totalPendapatanSub = programs.reduce((s, p) => s + p.totalPendapatan, 0);
      const totalPengeluaranSub = programs.reduce((s, p) => s + p.totalPengeluaran, 0);

      summaries.push({
        subSeksi: subSeksi || { id: ssKode, nama: ssKode, kode: ssKode },
        totalPendapatan: totalPendapatanSub,
        totalPengeluaran: totalPengeluaranSub,
        programs,
      });
    }

    summaries.sort((a, b) => a.subSeksi.nama.localeCompare(b.subSeksi.nama));

    return {
      totalPendapatan,
      totalPengeluaran,
      summaries,
      count: filtered.length,
    };
  }, [doorscrieftTransaksis, tahunAktif, semester, kodeAnggaranToSubSeksiKode, kodeToSubSeksi]);

  const bulanLabel = getSemesterLabel(semester);
  const tahunLabel = `${tahunAktif}`;

  return (
    <div className='space-y-6'>
      <div className='sticky top-0 z-10 bg-gray-50 dark:bg-slate-900 pt-4 pb-3 -mx-4 px-4 border-b border-slate-200 dark:border-slate-700 mb-6'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Laporan Semester</h1>
          <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
            {namaJemaat} — Tahun {tahunLabel}
          </p>
        </div>
        <div className='flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800'>
          {([1, 2] as Semester[]).map((s) => (
            <button
              key={s}
              onClick={() => setSemester(s)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-all',
                semester === s
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              )}
            >
              Semester {s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className='grid gap-4 sm:grid-cols-2'>
        <Card>
          <CardContent className='flex items-center gap-4 py-5'>
            <div className='rounded-full bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'>
              <TrendingUp className='h-6 w-6' />
            </div>
            <div>
              <p className='text-sm font-medium text-slate-500 dark:text-slate-400'>Total Pendapatan</p>
              <p className='text-2xl font-bold text-emerald-700 dark:text-emerald-300'>
                {formatCurrency(semesterData.totalPendapatan)}
              </p>
              <p className='text-xs text-slate-400'>{bulanLabel} {tahunLabel}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='flex items-center gap-4 py-5'>
            <div className='rounded-full bg-rose-100 p-3 text-rose-700 dark:bg-rose-950 dark:text-rose-300'>
              <TrendingDown className='h-6 w-6' />
            </div>
            <div>
              <p className='text-sm font-medium text-slate-500 dark:text-slate-400'>Total Pengeluaran</p>
              <p className='text-2xl font-bold text-rose-700 dark:text-rose-300'>
                {formatCurrency(semesterData.totalPengeluaran)}
              </p>
              <p className='text-xs text-slate-400'>{bulanLabel} {tahunLabel}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      </div>

      {/* Per Sub-Seksi Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Users className='h-5 w-5 text-blue-600' />
            Laporan per Sub Seksi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {semesterData.summaries.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12 text-center'>
              <FileText className='mb-3 h-12 w-12 text-slate-300 dark:text-slate-600' />
              <p className='text-lg font-medium text-slate-500 dark:text-slate-400'>Belum ada transaksi</p>
              <p className='mt-1 text-sm text-slate-400 dark:text-slate-500'>
                Tidak ditemukan transaksi sub-seksi pada {bulanLabel.toLowerCase()} {tahunLabel}
              </p>
            </div>
          ) : (
            <div className='space-y-8'>
              {semesterData.summaries.map((summary) => (
                <div key={summary.subSeksi.id}>
                  {/* Sub-Seksi header */}
                  <div className='mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50'>
                    <div className='flex items-center gap-3'>
                      <div className='rounded-md bg-blue-100 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300'>
                        <Layers className='h-4 w-4' />
                      </div>
                      <div>
                        <h3 className='font-semibold text-slate-900 dark:text-white'>{summary.subSeksi.nama}</h3>
                        {summary.subSeksi.kode && (
                          <p className='text-xs text-slate-400'>Kode: {summary.subSeksi.kode}</p>
                        )}
                      </div>
                    </div>
                    <div className='hidden text-right sm:block'>
                      <p className='text-xs text-slate-500 dark:text-slate-400'>
                        P: {formatCurrency(summary.totalPendapatan)} | B: {formatCurrency(summary.totalPengeluaran)}
                      </p>
                    </div>
                  </div>

                  {/* Programs table */}
                  <div className='overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700'>
                    <table className='w-full text-left text-sm'>
                      <thead>
                        <tr className='border-b border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800'>
                          <th className='w-8 px-2 py-3'></th>
                          <th className='px-2 py-3 font-semibold text-slate-700 dark:text-slate-300'>Kode</th>
                          <th className='px-3 py-3 font-semibold text-slate-700 dark:text-slate-300'>Program / Mata Anggaran</th>
                          <th className='px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-300'>Pendapatan</th>
                          <th className='px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-300'>Pengeluaran</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-slate-200 dark:divide-slate-700'>
                        {summary.programs.map((prog) => {
                          const programKey = `${summary.subSeksi.id}-${prog.kode}`;
                          const isExpanded = expandedPrograms.has(programKey);
                          return (
                            <Fragment key={prog.kode}>
                              {/* Program row */}
                              <tr
                                className={cn(
                                  'cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
                                  isExpanded && 'bg-slate-50 dark:bg-slate-800/30'
                                )}
                                onClick={() => toggleProgram(programKey)}
                              >
                                <td className='px-2 py-2.5'>
                                  {prog.transaksis.length > 0 ? (
                                    isExpanded ? (
                                      <ChevronDown className='h-4 w-4 text-slate-400' />
                                    ) : (
                                      <ChevronRight className='h-4 w-4 text-slate-400' />
                                    )
                                  ) : null}
                                </td>
                                <td className='px-2 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400'>
                                  {prog.kode}
                                </td>
                                <td className='px-3 py-2.5 text-slate-900 dark:text-white'>{prog.nama}</td>
                                <td className='px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-300'>
                                  {prog.totalPendapatan > 0 ? formatCurrency(prog.totalPendapatan) : '-'}
                                </td>
                                <td className='px-3 py-2.5 text-right font-mono text-rose-700 dark:text-rose-300'>
                                  {prog.totalPengeluaran > 0 ? formatCurrency(prog.totalPengeluaran) : '-'}
                                </td>
                              </tr>
                              {/* Expanded detail rows */}
                              {isExpanded && prog.transaksis.length > 0 && (
                                <tr>
                                  <td colSpan={5} className='bg-slate-50/70 px-0 dark:bg-slate-900/50'>
                                    <table className='w-full text-left text-xs'>
                                      <thead>
                                        <tr className='border-y border-slate-200 dark:border-slate-700'>
                                          <th className='px-2 py-1.5 font-medium text-slate-500 dark:text-slate-400 w-24'>Tanggal</th>
                                          <th className='px-2 py-1.5 font-medium text-slate-500 dark:text-slate-400'>Keterangan</th>
                                          <th className='px-2 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400 w-28'>Penerimaan</th>
                                          <th className='px-2 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400 w-28'>Pengeluaran</th>
                                        </tr>
                                      </thead>
                                      <tbody className='divide-y divide-slate-100 dark:divide-slate-800'>
                                        {prog.transaksis.map((trx) => (
                                          <tr key={trx.id} className='hover:bg-slate-100/70 dark:hover:bg-slate-800/50'>
                                            <td className='px-2 py-1.5 text-slate-600 dark:text-slate-400 whitespace-nowrap'>{trx.tanggal}</td>
                                            <td className='px-2 py-1.5 text-slate-800 dark:text-slate-200'>{trx.uraian || '-'}</td>
                                            <td className='px-2 py-1.5 text-right font-mono text-emerald-600 dark:text-emerald-400'>
                                              {trx.penerimaan > 0 ? formatCurrency(trx.penerimaan) : '-'}
                                            </td>
                                            <td className='px-2 py-1.5 text-right font-mono text-rose-600 dark:text-rose-400'>
                                              {trx.pengeluaran > 0 ? formatCurrency(trx.pengeluaran) : '-'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                        {/* Subtotal row */}
                        <tr className='bg-slate-50 font-semibold dark:bg-slate-800/70'>
                          <td colSpan={3} className='px-3 py-3 text-slate-900 dark:text-white'>
                            SUBTOTAL {summary.subSeksi.nama.toUpperCase()}
                          </td>
                          <td className='px-3 py-3 text-right font-mono text-emerald-700 dark:text-emerald-300'>
                            {formatCurrency(summary.totalPendapatan)}
                          </td>
                          <td className='px-3 py-3 text-right font-mono text-rose-700 dark:text-rose-300'>
                            {formatCurrency(summary.totalPengeluaran)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* Grand total */}
              <div className='rounded-lg border-2 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'>
                <div className='flex items-center justify-between px-6 py-4'>
                  <div className='flex items-center gap-3'>
                    <Wallet className='h-5 w-5 text-blue-600' />
                    <span className='text-lg font-bold text-slate-900 dark:text-white'>
                      TOTAL {bulanLabel.toUpperCase()} {tahunLabel}
                    </span>
                  </div>
                  <div className='text-right'>
                    <p className='text-sm text-slate-500 dark:text-slate-400'>
                      P: <span className='font-semibold text-emerald-700 dark:text-emerald-300'>{formatCurrency(semesterData.totalPendapatan)}</span>
                      {' | '}B: <span className='font-semibold text-rose-700 dark:text-rose-300'>{formatCurrency(semesterData.totalPengeluaran)}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
