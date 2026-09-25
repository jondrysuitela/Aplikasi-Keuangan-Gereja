import { Link, useLocation } from 'react-router-dom';
import { cn, getYearOptions } from '@/lib/utils';
import { churchLogoUrl } from '@/lib/assets';
import { useAppVersion } from '@/lib/appVersion';
import { createAutoBackup, restoreSnapshotData, saveProjectBackup, stringifyProjectSnapshot } from '@/lib/projectSnapshot';
import { getDoorscrieftValidationIssues, summarizeValidationForExport } from '@/lib/dataValidation';
import { can, type Permission } from '@/lib/permissions';
import { getElectronAPI } from '@/lib/electron';
import { addRecentProject } from '@/lib/recentProjects';
import { getReleaseNote } from '@/lib/releaseNotes';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { applyBatangTubuhAnggaranForYear, useStore } from '@/stores';
import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  ArrowUpCircle,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Calendar,
  Users,
  Wallet,
  BookOpen,
  ShieldCheck,
  HardDrive,
  Lock,
  CheckCircle2,
  Calculator,
  Sparkles,
  History,
  HelpCircle,
  Paperclip
} from 'lucide-react';
import { Button } from './ui/button';
import type { SubSeksi } from '@/types';

type NavigationItem = {
  name: string;
  href: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
  permission?: Permission;
};

const navigation: NavigationItem[] = [
  { name: 'Project Home', href: '/', icon: HardDrive },
  { name: 'Dianggarkan', href: '/dianggarkan', icon: Calculator },
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Realisasi Perbulan', href: '/laporan', icon: FileText },
  { name: 'Pendapatan Perbulan', href: '/pendapatan-perbulan', icon: BookOpen },
  { name: 'Pengeluaran Perbulan', href: '/pengeluaran-perbulan', icon: Wallet },
  { name: 'Komponen Pendapatan', href: '/komp-pendapatan', icon: BarChart3 },
  { name: 'Komponen Pengeluaran', href: '/komp-belanja', icon: BarChart3 },
  { name: 'Batang Tubuh', href: '/batang-tubuh', icon: ArrowUpCircle },
  { name: 'Rekonsiliasi', href: '/rekonsiliasi', icon: Calendar },
  { name: 'Rekon Klasis', href: '/rekon-klasis', icon: FileText },
  { name: 'Sub Seksi', href: '/sub-seksi', icon: Users },
  { name: 'Doorscrieft', href: '/doorscrieft', icon: FileText },
  { name: 'Bukti Transaksi', href: '/bukti-transaksi', icon: Paperclip, permission: 'attachment' },
  { name: 'Cek Data', href: '/cek-data', icon: ShieldCheck },
  { name: 'Laporan Semester', href: '/laporan-semester', icon: Calendar },
  { name: 'Bantuan', href: '/bantuan', icon: HelpCircle },
  { name: 'Riwayat Aktivitas', href: '/audit-log', icon: History, adminOnly: true },

  { name: 'Pengaturan', href: '/pengaturan', icon: Settings },
];

const UPDATE_SEEN_KEY_PREFIX = 'keuangan-gereja-update-seen';

function getProjectFileName(projectPath?: string | null) {
  if (!projectPath) return 'Belum disimpan';
  const normalized = projectPath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || projectPath;
}

function formatSavedAt(value?: Date | string | null) {
  if (!value) return 'Belum ada simpan manual';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Status simpan tidak diketahui';

  return `Disimpan ${date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const {
    user,
    logout,
    tahunAktif,
    setTahunAktif,
    doorscrieftTransaksis,
    kodeAnggarans,
    subSeksis,
    setSubSeksis,
    batangTubuhs,
    batangTubuhAnggaranByYear,
    batangTubuhProgramByYear,
    namaJemaat,
    kopGereja,
    kopKlas,
    appName,
    appSubtitle,
    lockedYears,
    activeProjectPath,
    setActiveProjectPath,
    lastSavedAt,
    setLastSavedAt,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    addAuditLog,
  } = useStore();
  const [showAbout, setShowAbout] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showUpdateNotes, setShowUpdateNotes] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [appInfo, setAppInfo] = useState<{
    name?: string;
    version?: string;
    userDataPath?: string;
    projectFilePath?: string | null;
    isPackaged?: boolean;
    platform?: string;
    electronVersion?: string;
    nodeVersion?: string;
  } | null>(null);
  const appVersion = useAppVersion();
  const currentRelease = getReleaseNote(appVersion);
  const confirm = useConfirm();
  const isCurrentYearLocked = lockedYears.includes(tahunAktif);
  const userRole = user?.role;
  const canInput = can(userRole, 'input');
  const canExport = can(userRole, 'export');
  const canBackup = can(userRole, 'backup');
  const canRestore = can(userRole, 'restore');
  const canSettings = can(userRole, 'settings');
  const projectFileName = getProjectFileName(activeProjectPath);
  const saveStatusText = hasUnsavedChanges ? 'Ada perubahan belum disimpan' : formatSavedAt(lastSavedAt);

  useEffect(() => {
    if (!appVersion || appVersion === 'dev') return;
    const key = `${UPDATE_SEEN_KEY_PREFIX}:${appVersion}`;
    try {
      if (window.localStorage.getItem(key) === '1') return;
      setShowUpdateNotes(true);
    } catch {
      setShowUpdateNotes(true);
    }
  }, [appVersion]);

  const closeUpdateNotes = () => {
    if (appVersion && appVersion !== 'dev') {
      try {
        window.localStorage.setItem(`${UPDATE_SEEN_KEY_PREFIX}:${appVersion}`, '1');
      } catch {
        // Ignore storage issues; the dialog can appear again on next launch.
      }
    }
    setShowUpdateNotes(false);
  };

  const validateBeforeCriticalAction = async (title: string, confirmText: string) => {
    const validation = summarizeValidationForExport(
      getDoorscrieftValidationIssues(useStore.getState().doorscrieftTransaksis, useStore.getState().kodeAnggarans, useStore.getState().tahunAktif),
    );

    if (validation.errors === 0) return true;

    const lanjut = await confirm({
      title,
      description: `Ditemukan ${validation.errors} error data dan ${validation.warnings} peringatan. Pilih Batal untuk membuka halaman Cek Data.`,
      confirmText,
      tone: 'warning',
    });

    if (!lanjut) {
      window.location.hash = '#/cek-data';
      return false;
    }

    return true;
  };

  // Load Sub Seksi from database on mount
  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.loadSubSeksiDb) return;
    electronAPI.loadSubSeksiDb()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setSubSeksis(items as SubSeksi[]);
        }
      })
      .catch(() => {});
  }, [setSubSeksis]);

  useEffect(() => {
    const electronAPI = getElectronAPI();
    electronAPI?.getAppInfo?.()
      .then((info) => {
        if (!info) return;
        setAppInfo(info);
        if (info.projectFilePath) setActiveProjectPath(info.projectFilePath);
      })
      .catch(() => {});
  }, [setActiveProjectPath]);

  useEffect(() => {
    const electronAPI = getElectronAPI();

    const cleanupProject = electronAPI?.onProjectOpenedFromFile?.(async (payload) => {
      if (!payload.success || !payload.data) {
        toast.error(payload.error || 'Gagal membuka file project.');
        return;
      }

      try {
        await createAutoBackup('sebelum-buka-project-dari-file');
        restoreSnapshotData(payload.data);
        setActiveProjectPath(payload.path || null);
        setLastSavedAt(new Date());
        setHasUnsavedChanges(false);
        addRecentProject(payload.path);
        addAuditLog('Buka Project dari File', 'Project', payload.path || '', payload.path || '');
        window.location.hash = '#/';
      } catch {
        toast.error('File project tidak valid.');
      }
    });

    const cleanupClose = electronAPI?.onCloseRequested?.(() => {
      const state = useStore.getState();
      if (state.hasUnsavedChanges && can(state.user?.role, 'input')) {
        setShowCloseConfirm(true);
        return;
      }
      if (electronAPI?.forceClose) {
        electronAPI.forceClose();
        return;
      }
      electronAPI?.close?.();
    });

    return () => {
      cleanupProject?.();
      cleanupClose?.();
    };
  }, [addAuditLog, setActiveProjectPath, setHasUnsavedChanges, setLastSavedAt]);
  const yearOptions = useMemo(() => {
    const dataYears = doorscrieftTransaksis
      .map((row) => new Date(row.tanggal).getFullYear())
      .filter((year) => Number.isFinite(year));

    return getYearOptions(tahunAktif, dataYears);
  }, [doorscrieftTransaksis, tahunAktif]);

  // Listen for menu actions from Electron
  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.onMenuAction) {
      console.log('[MENU] onMenuAction not available');
      return;
    }
    console.log('[MENU] Setting up onMenuAction listener');

    const handler = (action: string) => {
      console.log('[MENU ACTION] received:', action);
      if (action === 'about') setShowAbout(true);
      if (action === 'save-project') {
        if (!canInput) {
          toast.error('Role Anda tidak memiliki izin menyimpan project.');
          return;
        }
        console.log('[MENU ACTION] calling handleSaveProject');
        handleSaveProject();
      }
      if (action === 'open-project') {
        if (!canRestore) {
          toast.error('Role Anda tidak memiliki izin membuka/restore project.');
          return;
        }
        console.log('[MENU ACTION] calling handleOpenProject');
        handleOpenProject();
      }
      if (action === 'save-project-as') {
        if (!canInput) {
          toast.error('Role Anda tidak memiliki izin menyimpan project.');
          return;
        }
        console.log('[MENU ACTION] calling handleSaveProject(asNew)');
        handleSaveProject(true);
      }
      if (action === 'new-project') {
        if (!canInput) {
          toast.error('Role Anda tidak memiliki izin membuat project baru.');
          return;
        }
        openNewProjectDialog();
      }
      if (action === 'export-data') {
        if (!canExport) {
          toast.error('Role Anda tidak memiliki izin export.');
          return;
        }
        handleExportData();
      }
      if (action === 'backup-project') {
        if (!canBackup) {
          toast.error('Role Anda tidak memiliki izin backup.');
          return;
        }
        handleBackupProject();
      }
      if (action === 'print-report') {
        const printButton = document.querySelector<HTMLButtonElement>('[data-report-print-button="true"]:not(:disabled)');
        if (printButton) {
          printButton.click();
          return;
        }
        toast.info('Halaman ini belum memiliki format print laporan.');
      }
    };

    const cleanup = electronAPI.onMenuAction(handler);
    return () => cleanup?.();
    // Menu action listener is registered once for Electron's app menu bridge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProjectAction = async (asNew?: boolean, showResult = true) => {
    if (!canInput) {
      if (showResult) toast.error('Role Anda tidak memiliki izin menyimpan project.');
      return false;
    }
    const electronAPI = getElectronAPI();
    if (!electronAPI?.saveProject) {
      if (showResult) toast.error('Fitur ini hanya tersedia di mode Electron.');
      return false;
    }
    if (!(await validateBeforeCriticalAction('Simpan project dengan data bermasalah?', 'Tetap Simpan'))) {
      return false;
    }
    let state: ReturnType<typeof useStore.getState>;
    let data: string;

    try {
      state = useStore.getState();
      data = stringifyProjectSnapshot();
    } catch (error) {
      console.error('[PROJECT] Failed to prepare save data:', error);
      if (showResult) toast.error(`Gagal menyiapkan data project: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }

    const defaultName = `${state.namaJemaat.replace(/\s+/g, '_')}_${state.tahunAktif}.gpm`;

    try {
      const result = await electronAPI.saveProject(data, defaultName, asNew);
      if (result.success) {
        setActiveProjectPath(result.path || null);
        setLastSavedAt(new Date());
        setHasUnsavedChanges(false);
        addRecentProject(result.path);
        addAuditLog(asNew ? 'Simpan Sebagai' : 'Simpan Project', 'Project', result.path || defaultName, result.path || defaultName);
        if (showResult) toast.success('Project berhasil disimpan.', { description: result.path || defaultName });
        return true;
      } else {
        if (showResult) toast.info('Project tidak tersimpan.');
        return false;
      }
    } catch (error) {
      console.error('[PROJECT] Save failed:', error);
      if (showResult) toast.error(`Gagal menyimpan project: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  };

  const handleSaveProject = async (asNew?: boolean) => {
    await saveProjectAction(asNew, true);
  };

  const handleOpenProject = async () => {
    if (!canRestore) {
      toast.error('Role Anda tidak memiliki izin membuka/restore project.');
      return;
    }
    const electronAPI = getElectronAPI();
    if (!electronAPI?.openProject) {
      toast.error('Fitur ini hanya tersedia di mode Electron.');
      return;
    }
    if (hasUnsavedChanges) {
      const lanjut = await confirm({
        title: 'Buka project lain?',
        description: 'Ada perubahan yang belum disimpan. Auto backup akan dibuat sebelum file project lain dibuka.',
        confirmText: 'Buka Project',
        tone: 'warning',
      });
      if (!lanjut) return;
    }
    await createAutoBackup('sebelum-buka-project');
    const result = await electronAPI.openProject();
    if (result.success && result.data) {
      try {
        restoreSnapshotData(result.data);
        useStore.setState({ activeProjectPath: result.path || null, lastSavedAt: new Date() });
        setHasUnsavedChanges(false);
        addRecentProject(result.path);

        addAuditLog('Buka Project', 'Project', result.path || '', result.path || '');
        toast.success('Project berhasil dibuka.', { description: result.path || '' });
        // Navigate to home since Zustand state is now properly updated
        window.location.href = window.location.pathname + '#/';
      } catch {
        toast.error('File project tidak valid.');
      }
    }
  };

  const openNewProjectDialog = () => {
    setNewProjectName('');
    setShowNewProject(true);
  };

  const handleCreateNewProject = async (event: FormEvent) => {
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

    const electronAPI = getElectronAPI();
    await createAutoBackup('sebelum-project-baru');
    await electronAPI?.newProject?.();

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
    localStorage.removeItem('keuangan-gereja-autosave');
    setShowNewProject(false);
    window.location.hash = '#/';
  };

  const handleExportData = async () => {
    if (!canExport) {
      toast.error('Role Anda tidak memiliki izin export.');
      return;
    }
    if (doorscrieftTransaksis.length === 0) {
      toast.info('Tidak ada data untuk di-export.');
      return;
    }

    const electronAPI = getElectronAPI();
    if (!electronAPI?.exportFullWorkbook) {
      toast.error('Export Excel lengkap hanya tersedia di mode Electron.');
      return;
    }

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

    const result = await electronAPI.exportFullWorkbook({
      tahun: tahunAktif,
      namaJemaat,
      namaGereja: kopGereja,
      klasis: kopKlas,
      appName,
      appSubtitle,
      doorscrieftTransaksis,
      kodeAnggarans,
      subSeksis,
      batangTubuhs: applyBatangTubuhAnggaranForYear(batangTubuhs, batangTubuhAnggaranByYear, tahunAktif, batangTubuhProgramByYear),
    });

    if (result.success) {
      addAuditLog('Export Workbook', 'Excel', result.path || `Tahun ${tahunAktif}`, result.path || '');
      toast.success('Workbook berhasil diexport.', { description: result.path || '' });
    } else if (!result.canceled) {
      toast.error(`Gagal export: ${result.error || 'Unknown error'}`);
    }
  };

  const handleBackupProject = async () => {
    if (!canBackup) {
      toast.error('Role Anda tidak memiliki izin backup.');
      return;
    }
    if (!(await validateBeforeCriticalAction('Backup project dengan data bermasalah?', 'Tetap Backup'))) return;
    const result = await saveProjectBackup(`${namaJemaat.replace(/\s+/g, '_')}_${tahunAktif}_backup.gpm`);
    if (result.success) {
      addAuditLog('Backup Project', 'Project', result.path || '', result.path || '');
      toast.success('Backup berhasil dibuat.', { description: result.path || '' });
    } else if (!('canceled' in result && result.canceled)) {
      toast.error(`Gagal membuat backup: ${'error' in result ? result.error || 'Unknown error' : 'Fitur hanya tersedia di mode Electron.'}`);
    }
  };

  const forceCloseApp = async () => {
    const electronAPI = getElectronAPI();
    if (electronAPI?.forceClose) {
      await electronAPI.forceClose();
      return;
    }
    electronAPI?.close?.();
  };

  const handleCloseSaveAndExit = async () => {
    const saved = await saveProjectAction(false, true);
    if (saved) {
      setShowCloseConfirm(false);
      await forceCloseApp();
    }
  };

  const handleCloseBackupAndExit = async () => {
    if (!canBackup) {
      toast.error('Role Anda tidak memiliki izin backup.');
      return;
    }
    const result = await saveProjectBackup(`${namaJemaat.replace(/\s+/g, '_')}_${tahunAktif}_backup-sebelum-keluar.gpm`);
    if (!result.success) {
      toast.error(result.error || 'Backup gagal dibuat.');
      return;
    }
    addAuditLog('Backup Sebelum Keluar', 'Project', result.path || '', result.path || '');
    setHasUnsavedChanges(false);
    setShowCloseConfirm(false);
    await forceCloseApp();
  };

  const handleLogout = () => {
    if (hasUnsavedChanges && canInput) {
      confirm({
        title: 'Logout tanpa menyimpan?',
        description: 'Ada perubahan project yang belum disimpan. Perubahan bisa hilang jika Anda logout sekarang.',
        confirmText: 'Logout',
        tone: 'warning',
      }).then((lanjut) => {
        if (!lanjut) return;
        logout();
        window.location.hash = '#/login';
      });
      return;
    }
    logout();
    window.location.hash = '#/login';
  };

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className='fixed inset-0 z-40 bg-black/50 lg:hidden'
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col bg-slate-900 transition-transform duration-300 lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className='flex h-16 items-center justify-between px-4 border-b border-slate-800'>
          <div className='flex items-center gap-3'>
            <img src={churchLogoUrl} alt="GPM" className="w-10 h-10" />
            <div>
              <h1 className='text-sm font-bold text-white leading-tight'>{appName}</h1>
              <p className='text-xs text-slate-400 leading-tight'>{appSubtitle}</p>
            </div>
          </div>
          <button
            className='lg:hidden text-slate-400 hover:text-white'
            onClick={() => setSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <div className='border-b border-slate-800 p-3'>
          <div className='flex items-center gap-3 text-white'>
            <div className='w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-semibold'>
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div>
              <p className='font-medium'>{user?.name || 'Administrator'}</p>
              <p className='text-xs text-slate-400 capitalize'>{user?.role || 'admin'}</p>
            </div>
          </div>
        </div>

        <nav className='flex-1 overflow-y-auto px-3 py-3'>
          {navigation.map((item) => {
            if ((item.href === '/pengaturan' || item.adminOnly) && !canSettings) return null;
            if ('permission' in item && item.permission && !can(userRole, item.permission)) return null;
            const isActive = location.pathname === item.href || location.pathname === `#${item.href}`;

            // Sub Seksi nav item - simple link
            if (item.name === 'Sub Seksi') {
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'my-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )}
                >
                  <item.icon size={20} />
                  {item.name}
                </Link>
              );
            }

            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'my-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
              >
                <item.icon size={20} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className='shrink-0 border-t border-slate-800 p-3'>
          <Button
            variant='ghost'
            className='w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800'
            onClick={handleLogout}
          >
            <LogOut size={20} className='mr-3' />
            Keluar
          </Button>
          <div className='mt-3 text-center text-xs text-slate-500'>
            <p>v{appVersion} — Jondry Suitela</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className='lg:pl-64 bg-gray-50 dark:bg-slate-900 min-h-screen transition-colors'>
        {/* Top bar */}
        <header className='sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-white px-4 sm:px-6 lg:px-8'>
          <button
            className='lg:hidden text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>

          <div className='flex items-center gap-2'>
            <select
              value={tahunAktif}
              onChange={(e) => setTahunAktif(Number(e.target.value))}
              className='h-9 rounded-md border border-input bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white px-3 text-sm font-medium'
            >
              {yearOptions.map((tahun) => (
                <option key={tahun} value={tahun}>Tahun {tahun}</option>
              ))}
            </select>
          </div>

          <div className='flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300'>
            <span>{new Date().toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}</span>
          </div>

          <div className='ml-auto hidden items-center gap-2 lg:flex'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => handleSaveProject(false)}
              disabled={!canInput}
              title='Simpan project'
            >
              Simpan
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={handleBackupProject}
              disabled={!canBackup}
              title='Buat backup project'
            >
              Backup
            </Button>
          </div>

        </header>

        {/* Page content */}
        <main className='p-4 pb-16 sm:p-6 sm:pb-16 lg:p-8 lg:pb-16 text-slate-900 dark:text-slate-100'>
          {children}
        </main>

        <footer className='fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 lg:left-64'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1'>
              <span className='flex items-center gap-1.5'>
                <HardDrive className='h-3.5 w-3.5 text-slate-400' />
                <span className='font-medium text-slate-700 dark:text-slate-200'>Project:</span>
                <span className='max-w-[280px] truncate' title={activeProjectPath || projectFileName}>{projectFileName}</span>
              </span>
              <span>{doorscrieftTransaksis.length} transaksi</span>
              <span>{kodeAnggarans.length} kode anggaran</span>
              <span className='flex items-center gap-1.5'>
                {isCurrentYearLocked ? <Lock className='h-3.5 w-3.5 text-red-500' /> : <CheckCircle2 className='h-3.5 w-3.5 text-green-600' />}
                Tahun {tahunAktif} {isCurrentYearLocked ? 'terkunci' : 'terbuka'}
              </span>
            </div>
            <div className='flex items-center gap-3'>
              <span className='flex items-center gap-1.5'>
                <span className={cn('h-2 w-2 rounded-full', hasUnsavedChanges ? 'bg-amber-500' : 'bg-green-600')} />
                {saveStatusText}
              </span>
              <span>v{appVersion}</span>
            </div>
          </div>
        </footer>
      </div>

      {/* About Dialog */}
      {showNewProject && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4' onClick={() => setShowNewProject(false)}>
          <form
            className='w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800'
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateNewProject}
          >
            <div className='flex items-start justify-between gap-4'>
              <div>
                <h2 className='text-xl font-bold text-slate-900 dark:text-white'>Project Baru</h2>
                <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>Masukkan nama project untuk memulai ruang kerja baru.</p>
              </div>
              <button
                type='button'
                className='rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white'
                onClick={() => setShowNewProject(false)}
              >
                <X size={20} />
              </button>
            </div>

            <label className='mt-5 block text-sm font-medium text-slate-700 dark:text-slate-200'>
              Nama Project
              <input
                autoFocus
                className='mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white'
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder='Contoh: Laporan Keuangan Jemaat Suli 2026'
              />
            </label>

            <div className='mt-6 flex justify-end gap-2'>
              <Button type='button' variant='outline' onClick={() => setShowNewProject(false)}>
                Batal
              </Button>
              <Button type='submit' disabled={!newProjectName.trim()}>
                Buat Project
              </Button>
            </div>
          </form>
        </div>
      )}

      {showAbout && (
        <div className='fixed inset-0 z-50 bg-black/50 flex items-center justify-center' onClick={() => setShowAbout(false)}>
          <div className='bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4 dark:bg-slate-800' onClick={(e) => e.stopPropagation()}>
            <div>
              <div className='text-center'>
              <img src={churchLogoUrl} alt="GPM" className="w-16 h-16 mx-auto mb-3" />
              <h2 className='text-xl font-bold text-slate-900 dark:text-white'>{appName}</h2>
              <p className='text-sm text-slate-500 mt-1 dark:text-slate-400'>{appSubtitle}</p>
              </div>
              <div className='mt-5 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2'>
                <InfoRow label='Versi' value={appVersion} />
                <InfoRow label='Mode' value={appInfo?.isPackaged ? 'Production' : 'Development'} />
                <InfoRow label='User' value={user?.name || 'Administrator'} />
                <InfoRow label='Tahun Aktif' value={`${tahunAktif}${isCurrentYearLocked ? ' terkunci' : ' terbuka'}`} />
                <InfoRow label='Electron' value={appInfo?.electronVersion || '-'} />
                <InfoRow label='Platform' value={appInfo?.platform || '-'} />
                <div className='sm:col-span-2'>
                  <InfoRow label='Developer' value={'Jondry Suitela (dibuat dengan bantuan AI)'} />
                </div>
                <div className='sm:col-span-2'>
                  <InfoRow label='Folder Data' value={appInfo?.userDataPath || '-'} />
                </div>
                <div className='sm:col-span-2'>
                  <InfoRow label='Project' value={activeProjectPath || appInfo?.projectFilePath || 'Belum disimpan'} />
                </div>
              </div>
              <div className='mt-5 flex justify-end gap-2'>
                <Button variant='outline' onClick={handleBackupProject}>
                  <HardDrive className='mr-2 h-4 w-4' /> Backup
                </Button>
                <Button onClick={() => setShowAbout(false)}>Tutup</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUpdateNotes && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4' onClick={closeUpdateNotes}>
          <div
            className='w-full max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='border-b border-slate-200 bg-gradient-to-br from-blue-50 to-emerald-50 p-6 dark:border-slate-700 dark:from-blue-950/30 dark:to-emerald-950/20'>
              <div className='flex items-start justify-between gap-4'>
                <div className='flex items-start gap-3'>
                  <span className='rounded-md bg-blue-600 p-2 text-white shadow-sm'>
                    <Sparkles className='h-5 w-5' />
                  </span>
                  <div>
                    <p className='text-sm font-semibold uppercase text-blue-700 dark:text-blue-300'>Update Aplikasi</p>
                    <h2 className='mt-1 text-xl font-bold text-slate-950 dark:text-white'>Apa yang baru di v{appVersion}</h2>
                    <p className='mt-1 text-sm text-slate-600 dark:text-slate-300'>
                      {currentRelease.summary}
                    </p>
                  </div>
                </div>
                <button
                  type='button'
                  className='rounded-md p-1 text-slate-400 hover:bg-white/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white'
                  onClick={closeUpdateNotes}
                  title='Tutup'
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className='space-y-3 p-6'>
              {currentRelease.highlights.map((item) => (
                <div key={item} className='flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/70'>
                  <span className='mt-0.5 rounded-full bg-emerald-100 p-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'>
                    <CheckCircle2 className='h-3.5 w-3.5' />
                  </span>
                  <p className='text-slate-700 dark:text-slate-200'>{item}</p>
                </div>
              ))}
            </div>
            <div className='flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-950/40 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-xs text-slate-500 dark:text-slate-400'>
                Alert ini muncul sekali untuk setiap versi aplikasi.
              </p>
              <Button onClick={closeUpdateNotes}>Mengerti</Button>
            </div>
          </div>
        </div>
      )}

      {showCloseConfirm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4'>
          <div className='w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800'>
            <h2 className='text-lg font-bold text-slate-900 dark:text-white'>Perubahan Belum Disimpan</h2>
            <p className='mt-2 text-sm text-slate-600 dark:text-slate-300'>
              Ada perubahan data yang belum disimpan sebagai project. Pilih tindakan sebelum aplikasi ditutup.
            </p>
            <div className='mt-5 grid gap-2'>
              <Button onClick={handleCloseSaveAndExit}>Simpan Project lalu Keluar</Button>
              {canBackup && <Button variant='outline' onClick={handleCloseBackupAndExit}>Backup lalu Keluar</Button>}
              <Button
                variant='destructive'
                onClick={async () => {
                  setHasUnsavedChanges(false);
                  setShowCloseConfirm(false);
                  await forceCloseApp();
                }}
              >
                Keluar Tanpa Menyimpan
              </Button>
              <Button variant='ghost' onClick={() => setShowCloseConfirm(false)}>Batal</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900'>
      <p className='text-xs text-slate-500 dark:text-slate-400'>{label}</p>
      <p className='mt-0.5 truncate font-medium text-slate-900 dark:text-white' title={value}>{value}</p>
    </div>
  );
}
