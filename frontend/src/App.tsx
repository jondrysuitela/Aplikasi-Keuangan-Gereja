import { Component, Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from '@/components/Layout';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import { AdminConfirmProvider } from '@/components/ui/admin-confirm-dialog';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';
import { can } from '@/lib/permissions';
import { shouldRequireInitialSetup } from '@/lib/setupMode';
import { useStore } from '@/stores';

const BatangTubuhPage = lazy(() => import('@/pages/BatangTubuhPage').then((m) => ({ default: m.BatangTubuhPage })));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const BantuanPage = lazy(() => import('@/pages/BantuanPage').then((m) => ({ default: m.BantuanPage })));
const BuktiTransaksiPage = lazy(() => import('@/pages/BuktiTransaksiPage').then((m) => ({ default: m.BuktiTransaksiPage })));
const CekDataPage = lazy(() => import('@/pages/CekDataPage').then((m) => ({ default: m.CekDataPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const DianggarkanPage = lazy(() => import('@/pages/DianggarkanPage').then((m) => ({ default: m.DianggarkanPage })));
const DoorscrieftInputPage = lazy(() => import('@/pages/DoorscrieftInputPage').then((m) => ({ default: m.DoorscrieftInputPage })));
const InputDataPage = lazy(() => import('@/pages/InputDataPage').then((m) => ({ default: m.InputDataPage })));
const KomponenBelanjaPage = lazy(() => import('@/pages/KomponenBelanjaPage').then((m) => ({ default: m.KomponenBelanjaPage })));
const KomponenPendapatanPage = lazy(() => import('@/pages/KomponenPendapatanPage').then((m) => ({ default: m.KomponenPendapatanPage })));
const LaporanBulananPage = lazy(() => import('@/pages/LaporanBulananPage').then((m) => ({ default: m.LaporanBulananPage })));
const PemasukanPage = lazy(() => import('@/pages/PemasukanPage').then((m) => ({ default: m.PemasukanPage })));
const PendapatanPerbulanPage = lazy(() => import('@/pages/PendapatanPerbulanPage').then((m) => ({ default: m.PendapatanPerbulanPage })));
const PengaturanPage = lazy(() => import('@/pages/PengaturanPage').then((m) => ({ default: m.PengaturanPage })));
const PengeluaranPage = lazy(() => import('@/pages/PengeluaranPage').then((m) => ({ default: m.PengeluaranPage })));
const PengeluaranPerbulanPage = lazy(() => import('@/pages/PengeluaranPerbulanPage').then((m) => ({ default: m.PengeluaranPerbulanPage })));
const ProjectHomePage = lazy(() => import('@/pages/ProjectHomePage').then((m) => ({ default: m.ProjectHomePage })));
const RealisasiPage = lazy(() => import('@/pages/RealisasiPage').then((m) => ({ default: m.RealisasiPage })));
const RekonsiliasiPage = lazy(() => import('@/pages/RekonsiliasiPage').then((m) => ({ default: m.RekonsiliasiPage })));
const SubSeksiPage = lazy(() => import('@/pages/SubSeksiPage').then((m) => ({ default: m.SubSeksiPage })));
const LaporanSemesterPage = lazy(() => import('@/pages/LaporanSemesterPage').then((m) => ({ default: m.LaporanSemesterPage })));

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-slate-50">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Terjadi Kesalahan</h1>
            <p className="text-slate-600 mb-4">Aplikasi mengalami error. Silakan refresh halaman.</p>
            <p className="text-xs text-slate-500 mb-4 font-mono bg-slate-100 p-2 rounded overflow-auto max-h-32">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              Refresh Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ConfirmProvider>
        <AdminConfirmProvider>
          <HashRouter>
            <Routes>
              <Route path="/setup" element={<SetupGate />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/*" element={<ProtectedApp />} />
            </Routes>
            <Toaster richColors position="top-right" />
          </HashRouter>
        </AdminConfirmProvider>
      </ConfirmProvider>
    </ErrorBoundary>
  );
}

function SetupGate() {
  const setupCompleted = useStore((state) => state.setupCompleted);
  if (!shouldRequireInitialSetup(setupCompleted)) return <Navigate to="/login" replace />;
  return <SetupPage />;
}

function ProtectedApp() {
  const user = useStore((state) => state.user);
  const setupCompleted = useStore((state) => state.setupCompleted);

  if (shouldRequireInitialSetup(setupCompleted)) {
    return <Navigate to="/setup" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<ProjectHomePage />} />
          <Route path="/dianggarkan" element={<DianggarkanPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/input-data" element={<InputDataPage />} />
          <Route path="/pemasukan" element={<PemasukanPage />} />
          <Route path="/pengeluaran" element={<PengeluaranPage />} />
          <Route path="/laporan" element={<LaporanBulananPage />} />
          <Route path="/realisasi" element={<RealisasiPage />} />
          <Route path="/pendapatan-perbulan" element={<PendapatanPerbulanPage />} />
          <Route path="/pengeluaran-perbulan" element={<PengeluaranPerbulanPage />} />
          <Route path="/komp-pendapatan" element={<KomponenPendapatanPage />} />
          <Route path="/komp-belanja" element={<KomponenBelanjaPage />} />
          <Route path="/batang-tubuh" element={<BatangTubuhPage />} />
          <Route path="/rekonsiliasi" element={<RekonsiliasiPage />} />
          <Route path="/sub-seksi" element={<SubSeksiPage />} />
          <Route path="/laporan-semester" element={<LaporanSemesterPage />} />
          <Route path="/doorscrieft" element={<DoorscrieftInputPage />} />
          <Route path="/bukti-transaksi" element={can(user.role, 'attachment') ? <BuktiTransaksiPage /> : <Navigate to="/" replace />} />
          <Route path="/cek-data" element={<CekDataPage />} />
          <Route path="/bantuan" element={<BantuanPage />} />
          <Route path="/audit-log" element={can(user.role, 'settings') ? <AuditLogPage /> : <Navigate to="/" replace />} />
          <Route path="/pengaturan" element={can(user.role, 'settings') ? <PengaturanPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="rounded-md border bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        Memuat halaman...
      </div>
    </div>
  );
}

