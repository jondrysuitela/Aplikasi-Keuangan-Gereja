import { useMemo, useState } from 'react';
import { Download, History, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useStore } from '@/stores';

function formatAuditDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function exportAuditCsv(rows: ReturnType<typeof useStore.getState>['auditLogs']) {
  const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const data = [
    ['Waktu', 'User', 'Aksi', 'Entitas', 'Entity ID', 'Detail'],
    ...rows.map((log) => [
      formatAuditDate(log.createdAt),
      log.userId,
      log.action,
      log.entity,
      log.entityId,
      log.newValue || '',
    ]),
  ];
  const csv = data.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `audit-log-keuangan-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AuditLogPage() {
  const { auditLogs, clearAuditLogs, addAuditLog } = useStore();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');

  const entities = useMemo(() => {
    return Array.from(new Set(auditLogs.map((log) => log.entity).filter(Boolean))).sort();
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return auditLogs
      .filter((log) => entityFilter === 'all' || log.entity === entityFilter)
      .filter((log) => {
        if (!term) return true;
        return [log.userId, log.action, log.entity, log.entityId, log.oldValue, log.newValue]
          .some((value) => String(value || '').toLowerCase().includes(term));
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [auditLogs, entityFilter, search]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return auditLogs.filter((log) => new Date(log.createdAt).toDateString() === today).length;
  }, [auditLogs]);

  const handleExport = () => {
    if (filteredLogs.length === 0) {
      toast.error('Tidak ada riwayat untuk diexport.');
      return;
    }
    exportAuditCsv(filteredLogs);
    addAuditLog('Export Audit Log', 'Audit', `${filteredLogs.length} aktivitas diexport`);
    toast.success('Audit log berhasil diexport.');
  };

  const handleClear = async () => {
    if (auditLogs.length === 0) return;
    const ok = await confirm({
      title: 'Hapus semua riwayat aktivitas?',
      description: 'Riwayat yang sudah dihapus tidak bisa dikembalikan dari aplikasi.',
      confirmText: 'Hapus Riwayat',
      tone: 'danger',
    });
    if (!ok) return;
    clearAuditLogs();
    toast.success('Riwayat aktivitas dihapus.');
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Riwayat Aktivitas</h1>
          <p className='text-slate-500 dark:text-slate-400'>Jejak perubahan project, login, backup, export, dan pengaturan aplikasi.</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' onClick={handleExport} disabled={filteredLogs.length === 0}>
            <Download className='mr-2 h-4 w-4' /> Export CSV
          </Button>
          <Button variant='outline' onClick={handleClear} disabled={auditLogs.length === 0}>
            <Trash2 className='mr-2 h-4 w-4' /> Hapus Riwayat
          </Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <AuditMetric title='Total Aktivitas' value={String(auditLogs.length)} detail='Seluruh project saat ini' icon={<History className='h-4 w-4' />} />
        <AuditMetric title='Hari Ini' value={String(todayCount)} detail='Aktivitas pada tanggal berjalan' icon={<ShieldCheck className='h-4 w-4' />} />
        <AuditMetric title='Hasil Filter' value={String(filteredLogs.length)} detail='Sesuai pencarian dan entitas' icon={<Search className='h-4 w-4' />} />
      </div>

      <Card>
        <CardHeader className='space-y-4'>
          <CardTitle>Daftar Riwayat</CardTitle>
          <div className='grid gap-3 lg:grid-cols-[1fr_220px]'>
            <div className='relative'>
              <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='Cari aksi, user, entitas, atau detail'
                className='pl-9'
              />
            </div>
            <select
              value={entityFilter}
              onChange={(event) => setEntityFilter(event.target.value)}
              className='h-10 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
            >
              <option value='all'>Semua entitas</option>
              {entities.map((entity) => (
                <option key={entity} value={entity}>{entity}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className='rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400'>
              Belum ada riwayat yang sesuai.
            </div>
          ) : (
            <div className='overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700'>
              <div className='max-h-[620px] overflow-auto'>
                <table className='w-full min-w-[820px] text-sm'>
                  <thead className='sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400'>
                    <tr>
                      <th className='px-4 py-3'>Waktu</th>
                      <th className='px-4 py-3'>User</th>
                      <th className='px-4 py-3'>Aksi</th>
                      <th className='px-4 py-3'>Entitas</th>
                      <th className='px-4 py-3'>Detail</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-slate-100 dark:divide-slate-800'>
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className='bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70'>
                        <td className='whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300'>{formatAuditDate(log.createdAt)}</td>
                        <td className='px-4 py-3 font-medium text-slate-900 dark:text-white'>{log.userId || '-'}</td>
                        <td className='px-4 py-3 text-slate-700 dark:text-slate-200'>{log.action}</td>
                        <td className='px-4 py-3'>
                          <span className='rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300'>
                            {log.entity || '-'}
                          </span>
                        </td>
                        <td className='px-4 py-3 text-slate-600 dark:text-slate-300'>{log.newValue || log.entityId || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditMetric({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className='flex items-center gap-3 p-4'>
        <div className='flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'>
          {icon}
        </div>
        <div>
          <p className='text-xs uppercase text-slate-500 dark:text-slate-400'>{title}</p>
          <p className='text-xl font-semibold text-slate-900 dark:text-white'>{value}</p>
          <p className='text-xs text-slate-500 dark:text-slate-400'>{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
