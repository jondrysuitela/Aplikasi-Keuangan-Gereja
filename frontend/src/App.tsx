import { Component, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { BatangTubuhPage } from '@/pages/BatangTubuhPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DoorscrieftInputPage } from '@/pages/DoorscrieftInputPage';
import { InputDataPage } from '@/pages/InputDataPage';
import { KomponenBelanjaPage } from '@/pages/KomponenBelanjaPage';
import { KomponenPendapatanPage } from '@/pages/KomponenPendapatanPage';
import { LaporanBulananPage } from '@/pages/LaporanBulananPage';
import { LoginPage } from '@/pages/LoginPage';
import { PemasukanPage } from '@/pages/PemasukanPage';
import { PendapatanPerbulanPage } from '@/pages/PendapatanPerbulanPage';
import { PengaturanPage } from '@/pages/PengaturanPage';
import { PengeluaranPage } from '@/pages/PengeluaranPage';
import { PengeluaranPerbulanPage } from '@/pages/PengeluaranPerbulanPage';
import { RealisasiPage } from '@/pages/RealisasiPage';
import { RekonsiliasiPage } from '@/pages/RekonsiliasiPage';
import { SubSeksiPage } from '@/pages/SubSeksiPage';
import { initSyncWorkerOnce } from '@/lib/syncWorkerInit';
import { useStore } from '@/stores';

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
  useEffect(() => {
    initSyncWorkerOnce();
  }, []);

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

function ProtectedApp() {
  const user = useStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
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
        <Route path="/doorscrieft" element={<DoorscrieftInputPage />} />
        <Route path="/pengaturan" element={<PengaturanPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
