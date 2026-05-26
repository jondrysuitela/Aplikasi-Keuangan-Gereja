import { Link, useLocation } from 'react-router-dom';
import { cn, getYearOptions } from '@/lib/utils';
import { churchLogoUrl } from '@/lib/assets';
import { useAppVersion } from '@/lib/appVersion';
import { useStore } from '@/stores';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ArrowUpCircle,
  ArrowDownCircle,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Calendar,
  Users,
  Wallet,
  BookOpen
} from 'lucide-react';
import { Button } from './ui/button';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Realisasi Perbulan', href: '/laporan', icon: FileText },
  { name: 'Pendapatan Perbulan', href: '/pendapatan-perbulan', icon: BookOpen },
  { name: 'Pengeluaran Perbulan', href: '/pengeluaran-perbulan', icon: Wallet },
  { name: 'Komponen Pendapatan', href: '/komp-pendapatan', icon: BarChart3 },
  { name: 'Komponen Pengeluaran', href: '/komp-belanja', icon: BarChart3 },
  { name: 'Batang Tubuh', href: '/batang-tubuh', icon: ArrowUpCircle },
  { name: 'Rekonsiliasi', href: '/rekonsiliasi', icon: Calendar },
  { name: 'Sub Seksi', href: '/sub-seksi', icon: Users },
  { name: 'Doorscrieft', href: '/doorscrieft', icon: FileText },

  { name: 'Pengaturan', href: '/pengaturan', icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const {
    user,
    logout,
    tahunAktif,
    setTahunAktif,
    doorscrieftTransaksis,
    setDoorscrieftTransaksis,
    kodeAnggarans,
    subSeksis,
    setSubSeksis,
    batangTubuhs,
    namaJemaat,
    kopGereja,
    kopKlas,
    appName,
    appSubtitle,
  } = useStore();
  const [showAbout, setShowAbout] = useState(false);
  const appVersion = useAppVersion();

  // Load Sub Seksi from database on mount
  useEffect(() => {
    const anyWin = window as unknown as { electronAPI?: { loadSubSeksiDb?: () => Promise<any[]> } };
    if (!anyWin?.electronAPI?.loadSubSeksiDb) return;
    anyWin.electronAPI.loadSubSeksiDb()
      .then((items: any[]) => {
        if (Array.isArray(items) && items.length > 0) {
          setSubSeksis(items);
        }
      })
      .catch(() => {});
  }, [setSubSeksis]);
  const yearOptions = useMemo(() => {
    const dataYears = doorscrieftTransaksis
      .map((row) => new Date(row.tanggal).getFullYear())
      .filter((year) => Number.isFinite(year));

    return getYearOptions(tahunAktif, dataYears);
  }, [doorscrieftTransaksis, tahunAktif]);

  // Listen for menu actions from Electron
  useEffect(() => {
    const anyWin = window as unknown as { electronAPI?: { onMenuAction?: (cb: (a: string) => void) => (() => void) | undefined } };
    if (!anyWin?.electronAPI?.onMenuAction) {
      console.log('[MENU] onMenuAction not available');
      return;
    }
    console.log('[MENU] Setting up onMenuAction listener');

    const handler = (action: string) => {
      console.log('[MENU ACTION] received:', action);
      if (action === 'about') setShowAbout(true);
      if (action === 'save-project') {
        console.log('[MENU ACTION] calling handleSaveProject');
        handleSaveProject();
      }
      if (action === 'open-project') {
        console.log('[MENU ACTION] calling handleOpenProject');
        handleOpenProject();
      }
      if (action === 'save-project-as') {
        console.log('[MENU ACTION] calling handleSaveProject(asNew)');
        handleSaveProject(true);
      }
      if (action === 'new-project') {
        handleNewProject();
      }
      if (action === 'export-data') {
        handleExportData();
      }
    };

    const cleanup = anyWin.electronAPI.onMenuAction(handler);
    return () => cleanup?.();
  }, []);

  const handleSaveProject = async (asNew?: boolean) => {
    const anyWin = window as unknown as { electronAPI?: { saveProject?: (data: string, name: string, asNew?: boolean) => Promise<{ success: boolean; path?: string }> } };
    if (!anyWin?.electronAPI?.saveProject) {
      alert('Fitur ini hanya tersedia di mode Electron.');
      return;
    }
    let state: ReturnType<typeof useStore.getState>;
    let data: string;

    try {
      state = useStore.getState();
      data = JSON.stringify({
        user: state.user ?? null,
        kategoriPendapatans: state.kategoriPendapatans,
        kategoriBelanjas: state.kategoriBelanjas,
        subSeksis: state.subSeksis,
        pemasukans: state.pemasukans,
        pengeluarans: state.pengeluarans,
        realisasis: state.realisasis,
        kodeAnggarans: state.kodeAnggarans,
        batangTubuhs: state.batangTubuhs,
        doorscrieftTransaksis: state.doorscrieftTransaksis,
        tahunAktif: state.tahunAktif,
        selectedBulan: state.selectedBulan,
        namaJemaat: state.namaJemaat,
        kopGereja: state.kopGereja,
        kopKlas: state.kopKlas,
        appName: state.appName,
        appSubtitle: state.appSubtitle,
        loginBackgroundImage: state.loginBackgroundImage,
        adminUsername: state.adminUsername,
        adminPassword: state.adminPassword,
      });
    } catch (error) {
      console.error('[PROJECT] Failed to prepare save data:', error);
      alert(`Gagal menyiapkan data project: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return;
    }

    const defaultName = `${state.namaJemaat.replace(/\s+/g, '_')}_${state.tahunAktif}.gpm`;

    try {
      const result = await anyWin.electronAPI.saveProject(data, defaultName, asNew);
      if (result.success) {
        alert(`Project berhasil disimpan:\n${result.path}`);
      } else {
        alert('Project tidak tersimpan.');
      }
    } catch (error) {
      console.error('[PROJECT] Save failed:', error);
      alert(`Gagal menyimpan project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleOpenProject = async () => {
    const anyWin = window as unknown as { electronAPI?: { openProject?: () => Promise<{ success: boolean; data?: string; path?: string }> } };
    if (!anyWin?.electronAPI?.openProject) {
      alert('Fitur ini hanya tersedia di mode Electron.');
      return;
    }
    const result = await anyWin.electronAPI.openProject();
    if (result.success && result.data) {
      try {
        const parsed = JSON.parse(result.data);

        // Convert date strings back to Date objects
        const restoreDates = (obj: any, fields: string[]) => {
          fields.forEach((f) => {
            if (obj[f] && typeof obj[f] === 'string') obj[f] = new Date(obj[f]);
          });
          return obj;
        };
        if (Array.isArray(parsed.pemasukans)) {
          parsed.pemasukans = parsed.pemasukans.map((p: any) => restoreDates(p, ['tanggal', 'createdAt', 'updatedAt']));
        }
        if (Array.isArray(parsed.pengeluarans)) {
          parsed.pengeluarans = parsed.pengeluarans.map((p: any) => restoreDates(p, ['tanggal', 'createdAt', 'updatedAt']));
        }
        if (Array.isArray(parsed.doorscrieftTransaksis)) {
          parsed.doorscrieftTransaksis = parsed.doorscrieftTransaksis.map((t: any) => restoreDates(t, ['tanggal', 'createdAt', 'updatedAt']));
        }
        if (parsed.user?.createdAt && typeof parsed.user.createdAt === 'string') {
          parsed.user.createdAt = new Date(parsed.user.createdAt);
        }

        // Use Zustand setState to properly update store
        useStore.setState({
          ...(parsed.pemasukans && { pemasukans: parsed.pemasukans }),
          ...(parsed.pengeluarans && { pengeluarans: parsed.pengeluarans }),
          ...(parsed.doorscrieftTransaksis && { doorscrieftTransaksis: parsed.doorscrieftTransaksis }),
          ...(parsed.kodeAnggarans && { kodeAnggarans: parsed.kodeAnggarans }),
          ...(parsed.subSeksis && { subSeksis: parsed.subSeksis }),
          ...(parsed.batangTubuhs && { batangTubuhs: parsed.batangTubuhs }),
          ...(parsed.namaJemaat && { namaJemaat: parsed.namaJemaat }),
          ...(parsed.tahunAktif && { tahunAktif: parsed.tahunAktif }),
          ...(parsed.user && { user: parsed.user }),
          ...(parsed.kopGereja && { kopGereja: parsed.kopGereja }),
          ...(parsed.kopKlas && { kopKlas: parsed.kopKlas }),
          ...(parsed.appName && { appName: parsed.appName }),
          ...(parsed.appSubtitle && { appSubtitle: parsed.appSubtitle }),
          ...(Object.prototype.hasOwnProperty.call(parsed, 'loginBackgroundImage') && { loginBackgroundImage: parsed.loginBackgroundImage ?? null }),
          ...(parsed.adminUsername && { adminUsername: parsed.adminUsername }),
          ...(parsed.adminPassword && { adminPassword: parsed.adminPassword }),
          ...(parsed.kategoriPendapatans && { kategoriPendapatans: parsed.kategoriPendapatans }),
          ...(parsed.kategoriBelanjas && { kategoriBelanjas: parsed.kategoriBelanjas }),
          ...(parsed.realisasis && { realisasis: parsed.realisasis }),
          ...(parsed.selectedBulan && { selectedBulan: parsed.selectedBulan }),
        });

        alert(`Project berhasil dibuka:\n${result.path}`);
        // Navigate to home since Zustand state is now properly updated
        window.location.href = window.location.pathname + '#/';
      } catch {
        alert('File project tidak valid.');
      }
    }
  };

  const handleNewProject = () => {
    if (confirm('Buat project baru? Data yang belum disimpan akan hilang.')) {
      window.location.reload();
    }
  };

  const handleExportData = async () => {
    if (doorscrieftTransaksis.length === 0) {
      alert('Tidak ada data untuk di-export.');
      return;
    }

    const anyWin = window as unknown as {
      electronAPI?: {
        exportFullWorkbook?: (config: unknown) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }>;
      };
    };

    if (!anyWin?.electronAPI?.exportFullWorkbook) {
      alert('Export Excel lengkap hanya tersedia di mode Electron.');
      return;
    }

    const result = await anyWin.electronAPI.exportFullWorkbook({
      tahun: tahunAktif,
      namaJemaat,
      namaGereja: kopGereja,
      klasis: kopKlas,
      appName,
      appSubtitle,
      doorscrieftTransaksis,
      kodeAnggarans,
      subSeksis,
      batangTubuhs,
    });

    if (result.success) {
      alert(`Berhasil export ke:\n${result.path}`);
    } else if (!result.canceled) {
      alert(`Gagal export: ${result.error || 'Unknown error'}`);
    }
  };

  const handleLogout = () => {
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
        'fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transform transition-transform duration-300 lg:translate-x-0',
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

        <div className='p-4 border-b border-slate-800'>
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

        <nav className='mt-6 px-3'>
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || location.pathname === `#${item.href}`;

            // Sub Seksi nav item - simple link
            if (item.name === 'Sub Seksi') {
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 my-1 rounded-lg text-sm font-medium transition-colors',
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
                  'flex items-center gap-3 px-3 py-2.5 my-1 rounded-lg text-sm font-medium transition-colors',
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

        <div className='absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800'>
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

          {/* Sync status (online/offline + pending) */}
          <SyncStatusBadge />
        </header>

        {/* Page content */}
        <main className='p-4 sm:p-6 lg:p-8 text-slate-900 dark:text-slate-100'>
          {children}
        </main>
      </div>

      {/* About Dialog */}
      {showAbout && (
        <div className='fixed inset-0 z-50 bg-black/50 flex items-center justify-center' onClick={() => setShowAbout(false)}>
          <div className='bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4' onClick={(e) => e.stopPropagation()}>
            <div className='text-center'>
              <img src={churchLogoUrl} alt="GPM" className="w-16 h-16 mx-auto mb-3" />
              <h2 className='text-xl font-bold text-slate-900'>{appName}</h2>
              <p className='text-sm text-slate-500 mt-1'>{appSubtitle}</p>
              <div className='mt-4 text-sm text-slate-600 space-y-1'>
                <p><strong>Versi:</strong> {appVersion}</p>
                <p><strong>User:</strong> {user?.name || 'Administrator'}</p>
                <p><strong>Tahun Aktif:</strong> {tahunAktif}</p>
              </div>
              <div className='mt-3 text-xs text-slate-400'>
                1 Kor 3:6 — "Aku menanam, Apolos menyiram, tetapi Allah yang membuat tumbuh."
              </div>
              <Button className='mt-4' onClick={() => setShowAbout(false)}>Tutup</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
