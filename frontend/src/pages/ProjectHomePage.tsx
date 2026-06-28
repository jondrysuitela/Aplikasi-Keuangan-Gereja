import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Database, FilePlus2, FolderOpen, HardDrive, Save, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AppStateMessage } from '@/components/AppStateMessage';
import { getElectronAPI } from '@/lib/electron';
import { createAutoBackup, listProjectBackups, restoreSnapshotData, saveProjectBackup, stringifyProjectSnapshot, type ProjectBackupInfo } from '@/lib/projectSnapshot';
import { can } from '@/lib/permissions';
import { useAppVersion } from '@/lib/appVersion';
import { useStore } from '@/stores';
import { addRecentProject, listRecentProjects, removeRecentProject, type RecentProject } from '@/lib/recentProjects';

const STORAGE_KEY = 'keuangan-gereja-autosave';

function fileName(path?: string | null) {
  if (!path) return 'Belum ada file project';
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
}

function formatDate(value?: Date | string | null) {
  if (!value) return 'Belum tercatat';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Belum tercatat';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectHomePage() {
  const {
    user,
    namaJemaat,
    tahunAktif,
    doorscrieftTransaksis,
    kodeAnggarans,
    activeProjectPath,
    setActiveProjectPath,
    lastSavedAt,
    setLastSavedAt,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    addAuditLog,
  } = useStore();
  const canInput = can(user?.role, 'input');
  const canBackup = can(user?.role, 'backup');
  const canRestore = can(user?.role, 'restore');
  const confirm = useConfirm();
  const appVersion = useAppVersion();
  const [backups, setBackups] = useState<ProjectBackupInfo[]>([]);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const tahunRows = useMemo(() => doorscrieftTransaksis.filter((row) => {
    const tanggal = new Date(row.tanggal);
    return !Number.isNaN(tanggal.getTime()) && tanggal.getFullYear() === tahunAktif;
  }), [doorscrieftTransaksis, tahunAktif]);

  const totals = useMemo(() => {
    const pendapatan = tahunRows.reduce((sum, row) => sum + Number(row.penerimaan || 0), 0);
    const pengeluaran = tahunRows.reduce((sum, row) => sum + Number(row.pengeluaran || 0), 0);
    return { pendapatan, pengeluaran, saldo: pendapatan - pengeluaran };
  }, [tahunRows]);

  const refreshBackups = async () => {
    setLoadingBackups(true);
    try {
      setBackups(await listProjectBackups());
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    refreshBackups();
    setRecentProjects(listRecentProjects());
  }, []);

  const handleSaveProject = async (asNew = false) => {
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin menyimpan project.');
      return;
    }
    const electronAPI = getElectronAPI();
    if (!electronAPI?.saveProject) {
      toast.error('Simpan project hanya tersedia di aplikasi desktop Electron.');
      return;
    }

    try {
      const result = await electronAPI.saveProject(
        stringifyProjectSnapshot(),
        `${namaJemaat.replace(/\s+/g, '_')}_${tahunAktif}.gpm`,
        asNew,
      );
      if (result.success) {
        setActiveProjectPath(result.path || null);
        setLastSavedAt(new Date());
        setHasUnsavedChanges(false);
        setRecentProjects(addRecentProject(result.path));
        addAuditLog(asNew ? 'Simpan Sebagai' : 'Simpan Project', 'Project', result.path || '', result.path || '');
        toast.success('Project berhasil disimpan.', { description: result.path || '' });
      } else if (!result.canceled) {
        toast.error(result.error || 'Project gagal disimpan.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Project gagal disimpan.');
    }
  };

  const handleOpenProject = async () => {
    if (!canRestore) {
      toast.error('Role Anda tidak memiliki izin membuka project.');
      return;
    }
    const electronAPI = getElectronAPI();
    if (!electronAPI?.openProject) {
      toast.error('Buka project hanya tersedia di aplikasi desktop Electron.');
      return;
    }
    if (hasUnsavedChanges) {
      const lanjut = await confirm({
        title: 'Buka project lain?',
        description: 'Ada perubahan belum disimpan. Auto backup akan dibuat sebelum membuka project lain.',
        confirmText: 'Buka Project',
        tone: 'warning',
      });
      if (!lanjut) return;
      await createAutoBackup('sebelum-buka-project-dari-home');
    }
    const result = await electronAPI.openProject();
    if (result.success && result.data) {
      restoreSnapshotData(result.data);
      setActiveProjectPath(result.path || null);
      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);
      setRecentProjects(addRecentProject(result.path));
      addAuditLog('Buka Project', 'Project', result.path || '', result.path || '');
      toast.success('Project berhasil dibuka.', { description: result.path || '' });
    } else if (!result.canceled) {
      toast.error(result.error || 'Gagal membuka project.');
    }
  };

  const handleOpenRecentProject = async (project: RecentProject) => {
    if (!canRestore) {
      toast.error('Role Anda tidak memiliki izin membuka project.');
      return;
    }
    const electronAPI = getElectronAPI();
    if (!electronAPI?.openRecentProject) {
      toast.error('Buka recent project hanya tersedia di aplikasi desktop Electron.');
      return;
    }
    if (hasUnsavedChanges) {
      const lanjut = await confirm({
        title: 'Buka recent project?',
        description: 'Ada perubahan belum disimpan. Auto backup akan dibuat sebelum membuka project lain.',
        confirmText: 'Buka Project',
        tone: 'warning',
      });
      if (!lanjut) return;
      await createAutoBackup('sebelum-buka-recent-project');
    }
    const result = await electronAPI.openRecentProject(project.path);
    if (result.success && result.data) {
      restoreSnapshotData(result.data);
      setActiveProjectPath(result.path || project.path);
      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);
      setRecentProjects(addRecentProject(result.path || project.path));
      addAuditLog('Buka Recent Project', 'Project', result.path || project.path, result.path || project.path);
      toast.success('Project berhasil dibuka.', { description: result.path || project.path });
    } else {
      toast.error(result.error || 'Recent project tidak bisa dibuka.', {
        description: 'File mungkin sudah dipindahkan atau dihapus.',
      });
    }
  };

  const handleRemoveRecentProject = (path: string) => {
    setRecentProjects(removeRecentProject(path));
    toast.success('Project dihapus dari daftar recent.');
  };

  const handleBackupProject = async () => {
    if (!canBackup) {
      toast.error('Role Anda tidak memiliki izin backup.');
      return;
    }
    const result = await saveProjectBackup(`${namaJemaat.replace(/\s+/g, '_')}_${tahunAktif}_backup.gpm`);
    if (result.success) {
      addAuditLog('Backup Project', 'Project', result.path || '', result.path || '');
      toast.success('Backup project berhasil dibuat.', { description: result.path || '' });
      await refreshBackups();
    } else if (!result.canceled) {
      toast.error(result.error || 'Backup project gagal dibuat.');
    }
  };

  const handleCreateProject = async (event: FormEvent) => {
    event.preventDefault();
    const projectName = newProjectName.trim();
    if (!projectName) return;
    if (!canInput) {
      toast.error('Role Anda tidak memiliki izin membuat project baru.');
      return;
    }
    const lanjut = await confirm({
      title: 'Buat project baru?',
      description: 'Auto backup akan dibuat, lalu data kerja saat ini dikosongkan.',
      confirmText: 'Buat Project',
      tone: 'warning',
    });
    if (!lanjut) return;

    await createAutoBackup('sebelum-project-baru-dari-home');
    await getElectronAPI()?.newProject?.();
    const tahun = new Date().getFullYear();
    useStore.setState((state) => ({
      pemasukans: [],
      pengeluarans: [],
      realisasis: [],
      doorscrieftTransaksis: [],
      batangTubuhAnggaranByYear: {},
      batangTubuhProgramByYear: {},
      lockedYears: [],
      tahunAktif: tahun,
      selectedBulan: new Date().getMonth() + 1,
      namaJemaat: projectName,
      appSubtitle: projectName,
      user: state.user,
      activeProjectPath: null,
      lastSavedAt: null,
      hasUnsavedChanges: false,
    }));
    addAuditLog('Project Baru', 'Project', projectName, projectName);
    localStorage.removeItem(STORAGE_KEY);
    setNewProjectOpen(false);
    setNewProjectName('');
    toast.success('Project baru siap digunakan.');
  };

  const latestBackup = backups[0];

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <div className='flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300'>
            <Database className='h-4 w-4' />
            Project Home
          </div>
          <h1 className='mt-1 text-2xl font-bold text-slate-900 dark:text-white'>Kelola Project Keuangan</h1>
          <p className='text-slate-500 dark:text-slate-400'>Buka, simpan, backup, dan lanjutkan pekerjaan project Tahun {tahunAktif}.</p>
        </div>
        <Button onClick={() => { window.location.hash = '#/dashboard'; }}>
          Lanjut ke Dashboard <ArrowRight className='ml-2 h-4 w-4' />
        </Button>
      </div>

      {hasUnsavedChanges && (
        <div className='flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'>
          <AlertTriangle className='mt-0.5 h-5 w-5 flex-shrink-0' />
          <div>
            <p className='font-semibold'>Ada perubahan belum disimpan</p>
            <p className='mt-1 text-sm'>Simpan project atau buat backup sebelum membuka project lain.</p>
          </div>
        </div>
      )}

      <div className='grid gap-4 xl:grid-cols-[1.2fr_0.8fr]'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Project Aktif</CardTitle>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div>
              <p className='text-sm text-slate-500 dark:text-slate-400'>Nama Project</p>
              <p className='mt-1 text-xl font-bold text-slate-900 dark:text-white'>{namaJemaat}</p>
              <p className='mt-1 truncate text-sm text-slate-500 dark:text-slate-400' title={activeProjectPath || ''}>{fileName(activeProjectPath)}</p>
            </div>
            <div className='grid gap-3 md:grid-cols-3'>
              <ProjectMetric label='Transaksi' value={String(tahunRows.length)} detail={`Tahun ${tahunAktif}`} />
              <ProjectMetric label='Kode Anggaran' value={String(kodeAnggarans.length)} detail='Master aktif' />
              <ProjectMetric label='Saldo' value={new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totals.saldo)} detail='Pendapatan - pengeluaran' />
            </div>
            <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
              <Button onClick={() => handleSaveProject(false)} disabled={!canInput}>
                <Save className='mr-2 h-4 w-4' /> Simpan
              </Button>
              <Button variant='outline' onClick={handleOpenProject} disabled={!canRestore}>
                <FolderOpen className='mr-2 h-4 w-4' /> Buka
              </Button>
              <Button variant='outline' onClick={handleBackupProject} disabled={!canBackup}>
                <HardDrive className='mr-2 h-4 w-4' /> Backup
              </Button>
              <Button variant='outline' onClick={() => setNewProjectOpen(true)} disabled={!canInput}>
                <FilePlus2 className='mr-2 h-4 w-4' /> Baru
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Status Kerja</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <StatusLine label='Status Simpan' value={hasUnsavedChanges ? 'Belum tersimpan' : 'Tersimpan'} ok={!hasUnsavedChanges} />
            <StatusLine label='Simpan Terakhir' value={formatDate(lastSavedAt)} ok={Boolean(lastSavedAt)} />
            <StatusLine label='Backup Terakhir' value={latestBackup ? formatDate(latestBackup.updatedAt) : 'Belum ada backup'} ok={Boolean(latestBackup)} />
            <StatusLine label='Versi Aplikasi' value={`v${appVersion}`} ok />
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-4 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Recent Projects</CardTitle>
            <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>Project yang terakhir dibuka atau disimpan dari perangkat ini.</p>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <AppStateMessage title='Belum ada recent project' detail='Project yang dibuka atau disimpan akan muncul di sini.' compact />
            ) : (
              <div className='divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700'>
                {recentProjects.map((project) => (
                  <div key={project.path} className='flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between'>
                    <button className='min-w-0 text-left' onClick={() => handleOpenRecentProject(project)}>
                      <p className='truncate font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-300'>{project.name}</p>
                      <p className='truncate text-sm text-slate-500 dark:text-slate-400' title={project.path}>{project.path}</p>
                      <p className='mt-0.5 text-xs text-slate-400 dark:text-slate-500'>Terakhir dibuka {formatDate(project.openedAt)}</p>
                    </button>
                    <Button variant='ghost' size='icon' onClick={() => handleRemoveRecentProject(project.path)} title='Hapus dari recent'>
                      <X className='h-4 w-4' />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div>
              <CardTitle className='text-base'>Backup Terakhir</CardTitle>
              <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>Riwayat backup project yang tersedia di perangkat ini.</p>
            </div>
            <Button variant='outline' size='sm' onClick={refreshBackups} disabled={loadingBackups}>Refresh</Button>
          </CardHeader>
          <CardContent>
            {backups.length === 0 ? (
              <AppStateMessage title='Belum ada backup project' detail='Gunakan tombol Backup untuk membuat cadangan project sebelum perubahan besar.' compact />
            ) : (
              <div className='divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700'>
                {backups.slice(0, 6).map((backup) => (
                  <div key={backup.path} className='flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='min-w-0'>
                      <p className='truncate font-semibold text-slate-900 dark:text-white'>{backup.name}</p>
                      <p className='text-sm text-slate-500 dark:text-slate-400'>{formatDate(backup.updatedAt)}</p>
                    </div>
                    <span className='text-sm text-slate-500 dark:text-slate-400'>{Math.max(1, Math.round(backup.size / 1024))} KB</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {newProjectOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4' onClick={() => setNewProjectOpen(false)}>
          <form className='w-full max-w-md rounded-md bg-white p-6 shadow-xl dark:bg-slate-800' onSubmit={handleCreateProject} onClick={(e) => e.stopPropagation()}>
            <h2 className='text-xl font-bold text-slate-900 dark:text-white'>Project Baru</h2>
            <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>Masukkan nama jemaat atau nama project baru.</p>
            <label className='mt-5 block text-sm font-medium text-slate-700 dark:text-slate-200'>
              Nama Project
              <input
                className='mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder='Contoh: Jemaat GPM Suli 2026'
                autoFocus
              />
            </label>
            <div className='mt-6 flex justify-end gap-2'>
              <Button type='button' variant='outline' onClick={() => setNewProjectOpen(false)}>Batal</Button>
              <Button type='submit' disabled={!newProjectName.trim()}>Buat Project</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ProjectMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className='rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900'>
      <p className='text-xs font-medium text-slate-500 dark:text-slate-400'>{label}</p>
      <p className='mt-1 text-lg font-bold text-slate-900 dark:text-white'>{value}</p>
      <p className='mt-0.5 text-xs text-slate-500 dark:text-slate-400'>{detail}</p>
    </div>
  );
}

function StatusLine({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className='flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700'>
      <div>
        <p className='text-sm font-medium text-slate-900 dark:text-white'>{label}</p>
        <p className='mt-0.5 text-sm text-slate-500 dark:text-slate-400'>{value}</p>
      </div>
      <ShieldCheck className={ok ? 'h-5 w-5 text-emerald-600' : 'h-5 w-5 text-amber-500'} />
    </div>
  );
}
