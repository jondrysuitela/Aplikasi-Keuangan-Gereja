import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAdminConfirm } from '@/components/ui/admin-confirm-dialog';
import { Database, Download, Upload, Trash2, Moon, Sun, Plus, Lock, Unlock, Edit3, Building2, Shield, Info, Palette, History, HardDrive, CheckCircle2, AlertCircle, RefreshCw, Eye, CalendarCheck, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAppVersion } from '@/lib/appVersion';
import { toast } from 'sonner';
import { createAutoBackup, listProjectBackups, readProjectBackup, restoreSnapshotData, saveProjectBackup, showBackupInFolder, type ProjectBackupInfo } from '@/lib/projectSnapshot';
import { getDoorscrieftValidationIssues, summarizeValidationForExport } from '@/lib/dataValidation';
import { generateRecoveryCode, hashPassword } from '@/lib/password';
import { roleLabel } from '@/lib/permissions';
import { getElectronAPI } from '@/lib/electron';
import { formatCurrency } from '@/lib/utils';
import { buildBatangTubuhFromMasterKode, buildSubSeksiFromMasterKode } from '@/lib/masterKodeStructure';
import type { UserAccount, UserRole } from '@/types';
import { AppStateMessage } from '@/components/AppStateMessage';

const STORAGE_KEY = 'keuangan-gereja-autosave';
const LEGACY_STORAGE_KEY = 'keuangan-gereja-storage';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function buildBackupPreview(rawData: string, fallbackName: string) {
  const snapshot = asRecord(JSON.parse(rawData));
  const lastSavedAt = snapshot.lastSavedAt ? new Date(String(snapshot.lastSavedAt)) : null;
  const savedText = lastSavedAt && !Number.isNaN(lastSavedAt.getTime())
    ? lastSavedAt.toLocaleString('id-ID')
    : 'Tidak tercatat';

  return [
    `File: ${fallbackName}`,
    `Jemaat: ${String(snapshot.namaJemaat || '-')}`,
    `Tahun aktif: ${String(snapshot.tahunAktif || '-')}`,
    `Doorscrieft: ${countArray(snapshot.doorscrieftTransaksis)} baris`,
    `Kode anggaran: ${countArray(snapshot.kodeAnggarans)} item`,
    `Batang Tubuh: ${countArray(snapshot.batangTubuhs)} kelompok`,
    `Audit log: ${countArray(snapshot.auditLogs)} aktivitas`,
    `Terakhir disimpan: ${savedText}`,
  ].join('\n');
}

const compressLoginBackground = (file: File): Promise<string> => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) {
    reject(new Error('File harus berupa gambar.'));
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('File gambar tidak bisa diproses.'));
    image.onload = () => {
      const maxWidth = 1920;
      const scale = Math.min(1, maxWidth / image.width);
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('Browser tidak mendukung pemrosesan gambar.'));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.src = String(reader.result || '');
  };
  reader.readAsDataURL(file);
});

export function PengaturanPage() {
  const { user, namaJemaat, setNamaJemaat, kopGereja, setKopGereja, kopKlas, setKopKlas, penandatanganKiriJabatan, setPenandatanganKiriJabatan, penandatanganKiriNama, setPenandatanganKiriNama, penandatanganKananJabatan, setPenandatanganKananJabatan, penandatanganKananNama, setPenandatanganKananNama, appName, setAppName, appSubtitle, setAppSubtitle, loginBackgroundImage, setLoginBackgroundImage, resetLoginBackgroundImage, guestLoginEnabled, setGuestLoginEnabled, tahunAktif, setTahunAktif, lockedYears, lockYear, unlockYear, auditLogs, addAuditLog, clearAuditLogs, activeProjectPath, setActiveProjectPath, lastSavedAt, setLastSavedAt, hasUnsavedChanges, setHasUnsavedChanges, doorscrieftTransaksis, kodeAnggarans } = useStore();
  const [darkMode, setDarkMode] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const confirm = useConfirm();
  const adminConfirm = useAdminConfirm();
  const [backups, setBackups] = useState<ProjectBackupInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [appInfo, setAppInfo] = useState<{ userDataPath?: string; isPackaged?: boolean } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{
    success?: boolean;
    currentVersion?: string;
    latestVersion?: string | null;
    status?: string;
    releaseDate?: string | null;
    installerPath?: string | null;
    installerExists?: boolean;
    error?: string;
  } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const appVersion = useAppVersion();
  const isCurrentYearLocked = lockedYears.includes(tahunAktif);
  const validationSummary = summarizeValidationForExport(
    getDoorscrieftValidationIssues(doorscrieftTransaksis, kodeAnggarans, tahunAktif),
  );
  const closeBookRows = doorscrieftTransaksis.filter((row) => {
    const tanggal = new Date(row.tanggal);
    return !Number.isNaN(tanggal.getTime()) && tanggal.getFullYear() === tahunAktif;
  });
  const closeBookIncome = closeBookRows.reduce((sum, row) => sum + Number(row.penerimaan || 0), 0);
  const closeBookExpense = closeBookRows.reduce((sum, row) => sum + Number(row.pengeluaran || 0), 0);
  const closeBookBalance = closeBookIncome - closeBookExpense;
  const closeBookReady = validationSummary.errors === 0 && closeBookRows.length > 0;
  const nextYear = tahunAktif + 1;

  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
  }, []);

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
    refreshAppHealth();
  }, []);

  const refreshAppHealth = async () => {
    setCheckingUpdate(true);
    try {
      const electronAPI = getElectronAPI();
      const [nextInfo, nextUpdate] = await Promise.all([
        electronAPI?.getAppInfo?.(),
        electronAPI?.getUpdateInfo?.(),
      ]);
      if (nextInfo) setAppInfo(nextInfo);
      if (nextUpdate) setUpdateInfo(nextUpdate);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleBackup = () => {
    const data = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (data) {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_keuangan_gereja_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addAuditLog('Download Backup JSON', 'Backup', a.download, a.download);
    }
  };

  const handleExportAuditLog = () => {
    if (auditLogs.length === 0) {
      toast.error('Belum ada audit log untuk diexport.');
      return;
    }

    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Waktu', 'User', 'Aksi', 'Entitas', 'Entity ID', 'Detail'],
      ...auditLogs.map((log) => [
        new Date(log.createdAt).toLocaleString('id-ID'),
        log.userId,
        log.action,
        log.entity,
        log.entityId,
        log.newValue || '',
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-keuangan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addAuditLog('Export Audit Log', 'Audit', a.download, a.download);
  };

  const handleNativeBackup = async () => {
    const result = await saveProjectBackup(`${namaJemaat.replace(/\s+/g, '_')}_${tahunAktif}_backup.gpm`);
    if (result.success) {
      addAuditLog('Backup Project', 'Project', result.path || '', result.path || '');
      await refreshBackups();
      toast.success('Backup project berhasil dibuat.');
    } else if (!result.canceled) {
      toast.error(result.error || 'Backup project hanya tersedia di mode Electron.');
    }
  };

  const handleRestoreBackup = async (backup: ProjectBackupInfo) => {
    const result = await readProjectBackup(backup.path);
    if (!result.success || !result.data) {
      toast.error(result.error || 'Gagal membaca file backup.');
      return;
    }

    let preview: string;
    try {
      preview = buildBackupPreview(result.data, backup.name);
    } catch {
      toast.error('File backup tidak valid.');
      return;
    }

    const lanjut = await confirm({
      title: 'Pulihkan backup project?',
      description: `${preview}\n\nData saat ini akan dibuat auto-backup terlebih dahulu sebelum backup ini dipulihkan.`,
      confirmText: 'Pulihkan Backup',
      tone: 'warning',
    });
    if (!lanjut) return;
    const verified = await adminConfirm({
      title: 'Verifikasi Admin',
      description: 'Restore backup akan mengganti data project aktif. Masukkan password admin untuk melanjutkan.',
      confirmText: 'Pulihkan',
      tone: 'warning',
    });
    if (!verified) return;
    await createAutoBackup('sebelum-restore-backup-history');

    try {
      restoreSnapshotData(result.data);
      setActiveProjectPath(result.path || backup.path);
      setLastSavedAt(new Date());
      setHasUnsavedChanges(false);
      addAuditLog('Restore Backup Project', 'Project', backup.name, backup.path);
      toast.success('Backup berhasil dipulihkan.');
      window.location.hash = '#/';
    } catch {
      toast.error('File backup tidak valid.');
    }
  };

  const handleRestore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        try {
          JSON.parse(text);
          const verified = await adminConfirm({
            title: 'Verifikasi Admin',
            description: `File ${file.name} akan mengganti data lokal aplikasi. Masukkan password admin untuk melanjutkan.`,
            confirmText: 'Restore Data',
            tone: 'warning',
          });
          if (!verified) return;
          await createAutoBackup('sebelum-restore-pengaturan');
          localStorage.setItem(STORAGE_KEY, text);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          addAuditLog('Restore Data', 'Backup', file.name, file.name);
          toast.success('Data berhasil direstore. Aplikasi akan dimuat ulang.');
          window.location.reload();
        } catch {
          toast.error('File tidak valid.');
        }
      }
    };
    input.click();
  };

  const handleClearData = async () => {
    const lanjut = await confirm({
      title: 'Hapus semua data lokal?',
      description: 'Tindakan ini akan membuat auto-backup terlebih dahulu, lalu menghapus data lokal aplikasi dari perangkat ini.',
      confirmText: 'Hapus Data',
      tone: 'danger',
    });
    if (!lanjut) return;
    const verified = await adminConfirm({
      title: 'Verifikasi Admin',
      description: 'Semua data lokal akan dihapus dari perangkat ini. Masukkan password admin untuk melanjutkan.',
      confirmText: 'Hapus Data',
      tone: 'danger',
    });
    if (!verified) return;
    await createAutoBackup('sebelum-hapus-data-pengaturan');
    addAuditLog('Hapus Semua Data', 'Database', 'Semua data lokal dihapus');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.location.reload();
  };

  const handleToggleYearLock = async () => {
    if (isCurrentYearLocked) {
      const lanjut = await confirm({
        title: `Buka kunci tahun ${tahunAktif}?`,
        description: 'Data tahun ini bisa diedit kembali setelah kunci dibuka.',
        confirmText: 'Buka Kunci',
      });
      if (!lanjut) return;
      const verified = await adminConfirm({
        title: 'Verifikasi Admin',
        description: `Tahun ${tahunAktif} akan bisa diedit kembali. Masukkan password admin untuk membuka kunci.`,
        confirmText: 'Buka Kunci',
        tone: 'warning',
      });
      if (!verified) return;
      unlockYear(tahunAktif);
      addAuditLog('Buka Kunci Tahun', 'Tahun', String(tahunAktif), String(tahunAktif));
      toast.success(`Tahun ${tahunAktif} dibuka kembali.`);
      return;
    }

    const lanjut = await confirm({
      title: `Kunci tahun ${tahunAktif}?`,
      description: 'Setelah dikunci, data tahun ini tidak bisa ditambah, diedit, dihapus, atau diimport sampai dibuka kembali.',
      confirmText: 'Kunci Tahun',
      tone: 'warning',
    });
    if (!lanjut) return;
    lockYear(tahunAktif);
    addAuditLog('Kunci Tahun', 'Tahun', String(tahunAktif), String(tahunAktif));
    toast.success(`Tahun ${tahunAktif} dikunci.`);
  };

  const handleCloseBook = async (openNextYear: boolean) => {
    if (!closeBookReady) {
      toast.error('Tutup buku belum siap.', {
        description: validationSummary.errors > 0
          ? `${validationSummary.errors} error data harus dibereskan dulu.`
          : `Belum ada transaksi pada tahun ${tahunAktif}.`,
      });
      return;
    }

    const lanjut = await confirm({
      title: `Tutup buku tahun ${tahunAktif}?`,
      description: `Aplikasi akan membuat backup otomatis, mengunci tahun ${tahunAktif}, dan saldo akhir tercatat ${formatCurrency(closeBookBalance)}.`,
      confirmText: openNextYear ? `Tutup & Buka ${nextYear}` : 'Tutup Buku',
      tone: 'warning',
    });
    if (!lanjut) return;
    const verified = await adminConfirm({
      title: 'Verifikasi Admin',
      description: `Tutup buku akan mengunci tahun ${tahunAktif}. Masukkan password admin untuk melanjutkan.`,
      confirmText: 'Tutup Buku',
      tone: 'warning',
    });
    if (!verified) return;

    await createAutoBackup(`tutup-buku-${tahunAktif}`);
    lockYear(tahunAktif);
    if (openNextYear) setTahunAktif(nextYear);
    addAuditLog(
      openNextYear ? 'Tutup Buku dan Buka Tahun Baru' : 'Tutup Buku',
      'Tahun',
      `Tahun ${tahunAktif}, saldo akhir ${closeBookBalance}`,
      String(tahunAktif),
    );
    toast.success(openNextYear ? `Tahun ${tahunAktif} ditutup. Tahun aktif berpindah ke ${nextYear}.` : `Tahun ${tahunAktif} ditutup.`);
  };

  const handleUploadLoginBackground = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setUploadingBackground(true);
      try {
        const compressed = await compressLoginBackground(file);
        setLoginBackgroundImage(compressed);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Gagal upload foto background.');
      } finally {
        setUploadingBackground(false);
      }
    };
    input.click();
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>Control Center</p>
          <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Pengaturan Operasional</h1>
          <p className='text-slate-500 dark:text-slate-400'>Kelola identitas gereja, akses pengguna, project, backup, dan keamanan tahun anggaran.</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' size='sm' onClick={refreshAppHealth} disabled={checkingUpdate}>
            <RefreshCw className='mr-2 h-4 w-4' /> {checkingUpdate ? 'Mengecek...' : 'Refresh Status'}
          </Button>
          <Button variant='outline' size='sm' onClick={handleNativeBackup}>
            <HardDrive className='mr-2 h-4 w-4' /> Backup Project
          </Button>
        </div>
      </div>

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <ControlMetric
          title='Project'
          value={activeProjectPath ? 'File aktif' : 'Belum disimpan'}
          detail={lastSavedAt ? `Simpan terakhir ${new Date(lastSavedAt).toLocaleString('id-ID')}` : 'Belum ada penyimpanan manual'}
          ok={Boolean(activeProjectPath) && !hasUnsavedChanges}
        />
        <ControlMetric
          title='Akses'
          value={roleLabel(user?.role)}
          detail={guestLoginEnabled ? 'Guest login aktif' : 'Guest login nonaktif'}
          ok={user?.role === 'admin'}
        />
        <ControlMetric
          title='Tahun Aktif'
          value={String(tahunAktif)}
          detail={isCurrentYearLocked ? 'Terkunci untuk perubahan data' : 'Terbuka untuk input dan import'}
          ok={!isCurrentYearLocked}
        />
        <ControlMetric
          title='Validasi'
          value={validationSummary.errors > 0 ? `${validationSummary.errors} error` : 'Siap'}
          detail={`${validationSummary.warnings} peringatan data`}
          ok={validationSummary.errors === 0}
        />
      </div>

      <div className='flex flex-wrap gap-2 rounded-md border bg-white p-2 dark:border-slate-700 dark:bg-slate-800'>
        {[
          ['Kesehatan', 'health'],
          ['Profil Gereja', 'profile'],
          ['User & Akses', 'access'],
          ['Project & Backup', 'project'],
          ['Master Data', 'master'],
          ['Audit', 'audit'],
        ].map(([label, target]) => (
          <Button
            key={target}
            variant='ghost'
            size='sm'
            onClick={() => document.getElementById(`settings-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {label}
          </Button>
        ))}
      </div>

      <Card id='settings-health'>
        <CardHeader>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <CardTitle className='flex items-center gap-2'>
                <Shield className='h-5 w-5 text-slate-500' />
                Kesehatan Aplikasi
              </CardTitle>
              <CardDescription>Status project, backup, validasi data, dan versi aplikasi</CardDescription>
            </div>
            <Button variant='outline' size='sm' onClick={refreshAppHealth} disabled={checkingUpdate}>
              <RefreshCw className='mr-2 h-4 w-4' /> {checkingUpdate ? 'Mengecek...' : 'Cek Pembaruan'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <HealthItem
              ok={!hasUnsavedChanges}
              title='Status Simpan'
              detail={hasUnsavedChanges ? 'Ada perubahan belum disimpan' : activeProjectPath ? 'Project tersimpan' : 'Belum ada file project'}
            />
            <HealthItem
              ok={validationSummary.errors === 0}
              title='Validasi Data'
              detail={`${validationSummary.errors} error, ${validationSummary.warnings} peringatan`}
            />
            <HealthItem
              ok={backups.length > 0}
              title='Backup Otomatis'
              detail={backups.length > 0 ? `${backups.length} backup tersedia` : 'Belum ada backup otomatis'}
            />
            <HealthItem
              ok={updateInfo?.status !== 'update-available' && updateInfo?.installerExists !== false}
              title='Versi Aplikasi'
              detail={
                updateInfo?.status === 'update-available'
                  ? `Versi ${updateInfo.latestVersion} tersedia`
                  : updateInfo?.status === 'not-found'
                    ? `v${appVersion}, metadata update belum ditemukan`
                    : `v${appVersion}${updateInfo?.installerExists === false ? ', installer tidak ditemukan' : ''}`
              }
            />
          </div>
          <div className='mt-3 grid gap-2 rounded-md border bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:grid-cols-2'>
            <p><span className='font-semibold'>Folder data:</span> {appInfo?.userDataPath || 'Tidak tersedia di mode browser'}</p>
            <p><span className='font-semibold'>Mode:</span> {appInfo?.isPackaged ? 'Production' : 'Development'}</p>
            <p><span className='font-semibold'>Latest:</span> {updateInfo?.latestVersion || '-'}</p>
            <p><span className='font-semibold'>Installer:</span> {updateInfo?.installerPath ? `${updateInfo.installerExists ? 'Ada' : 'Tidak ditemukan'} - ${updateInfo.installerPath}` : '-'}</p>
          </div>
        </CardContent>
      </Card>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Identitas Gereja */}
        <Card id='settings-profile'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Building2 className='h-5 w-5 text-slate-500' />
              Identitas Gereja
            </CardTitle>
            <CardDescription>Informasi nama gereja, klasis, dan jemaat</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <label className='text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block'>Nama Gereja</label>
              <Input
                value={kopGereja}
                onChange={(e) => setKopGereja(e.target.value)}
                placeholder='Gereja Protestan Maluku'
              />
            </div>
            <div>
              <label className='text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block'>Nama Klasis</label>
              <Input
                value={kopKlas}
                onChange={(e) => setKopKlas(e.target.value)}
                placeholder='KLASIS PULAU AMBON TIMUR'
              />
            </div>
            <div>
              <label className='text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block'>Nama Jemaat</label>
              <Input
                value={namaJemaat}
                onChange={(e) => setNamaJemaat(e.target.value)}
                placeholder='GPM Suli'
              />
            </div>
            <div className='border-t border-slate-200 pt-4 dark:border-slate-700'>
              <div className='mb-3'>
                <p className='text-sm font-medium text-slate-700 dark:text-slate-200'>Template Tanda Tangan Laporan</p>
                <p className='text-xs text-slate-500 dark:text-slate-400'>Dipakai otomatis pada preview dan cetak laporan.</p>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                <div>
                  <label className='mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300'>Jabatan kiri</label>
                  <Input
                    value={penandatanganKiriJabatan}
                    onChange={(e) => setPenandatanganKiriJabatan(e.target.value)}
                    placeholder='Ketua Majelis Jemaat'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300'>Nama kiri</label>
                  <Input
                    value={penandatanganKiriNama}
                    onChange={(e) => setPenandatanganKiriNama(e.target.value)}
                    placeholder='Nama Ketua Majelis'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300'>Jabatan kanan</label>
                  <Input
                    value={penandatanganKananJabatan}
                    onChange={(e) => setPenandatanganKananJabatan(e.target.value)}
                    placeholder='Bendahara Jemaat'
                  />
                </div>
                <div>
                  <label className='mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300'>Nama kanan</label>
                  <Input
                    value={penandatanganKananNama}
                    onChange={(e) => setPenandatanganKananNama(e.target.value)}
                    placeholder='Nama Bendahara'
                  />
                </div>
              </div>
              <div className='mt-4 grid grid-cols-2 gap-4 rounded border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200'>
                <div>
                  <p>Mengetahui,</p>
                  <p className='font-semibold'>{penandatanganKiriJabatan || 'Ketua Majelis Jemaat'}</p>
                  <div className='h-10' />
                  <p className='border-t border-slate-300 pt-1 font-semibold dark:border-slate-600'>{penandatanganKiriNama || '\u00A0'}</p>
                </div>
                <div>
                  <p>Disusun oleh,</p>
                  <p className='font-semibold'>{penandatanganKananJabatan || 'Bendahara Jemaat'}</p>
                  <div className='h-10' />
                  <p className='border-t border-slate-300 pt-1 font-semibold dark:border-slate-600'>{penandatanganKananNama || '\u00A0'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Aplikasi */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Palette className='h-5 w-5 text-slate-500' />
              Tampilan Aplikasi
            </CardTitle>
            <CardDescription>Nama, tema, dan tahun aktif aplikasi</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <label className='text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block'>Nama Aplikasi</label>
              <Input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder='Aplikasi Keuangan'
              />
            </div>
            <div>
              <label className='text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block'>Subjudul Aplikasi</label>
              <Input
                value={appSubtitle}
                onChange={(e) => setAppSubtitle(e.target.value)}
                placeholder='Jemaat GPM Suli'
              />
            </div>

            <div className='pt-2 border-t dark:border-slate-700'>
              <div className='mb-3'>
                <p className='text-sm font-medium text-slate-700 dark:text-slate-200'>Background Login</p>
                <p className='text-xs text-slate-500'>Upload foto untuk mengganti background halaman login</p>
              </div>
              <div className='overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-purple-700 to-fuchsia-900 p-2 dark:border-slate-700'>
                <div className='grid h-36 overflow-hidden rounded-md bg-white shadow-sm sm:grid-cols-[0.42fr_0.58fr]'>
                  <div className='flex items-center justify-center bg-white p-3'>
                    <div className='space-y-2 text-center'>
                      <div className='mx-auto h-8 w-8 rounded-md bg-purple-700' />
                      <p className='text-xs font-semibold text-slate-900'>Halaman Login</p>
                      <p className='text-[10px] text-slate-500'>Form di kiri</p>
                    </div>
                  </div>
                  <div className='relative min-h-20'>
                    {loginBackgroundImage ? (
                      <img
                        src={loginBackgroundImage}
                        alt='Preview foto login'
                        className='h-full w-full object-cover'
                      />
                    ) : (
                      <div className='grid h-full place-items-center bg-slate-100 text-center text-xs text-slate-500'>
                        Tanpa background
                      </div>
                    )}
                  </div>
                </div>
                <div className='mt-2 px-1'>
                  <p className='text-sm font-semibold text-white'>{loginBackgroundImage ? 'Foto custom aktif' : 'Background belum diatur'}</p>
                  <p className='text-xs text-white/75'>Login tetap netral jika tidak ada foto custom</p>
                </div>
              </div>
              <div className='mt-3 flex flex-wrap gap-2'>
                <Button variant='outline' size='sm' onClick={handleUploadLoginBackground} disabled={uploadingBackground}>
                  <Upload className='h-4 w-4 mr-2' /> {uploadingBackground ? 'Memproses...' : 'Upload Foto'}
                </Button>
                <Button variant='outline' size='sm' onClick={resetLoginBackgroundImage} disabled={!loginBackgroundImage || uploadingBackground}>
                  Hapus Background
                </Button>
              </div>
            </div>

            <div className='flex items-center justify-between pt-2 border-t'>
              <div>
                <p className='text-sm font-medium text-slate-700'>Tema Gelap</p>
                <p className='text-xs text-slate-500'>Aktifkan mode tampilan gelap</p>
              </div>
              <Button variant='outline' size='sm' onClick={toggleDarkMode}>
                {darkMode ? <Moon className='h-4 w-4 mr-2' /> : <Sun className='h-4 w-4 mr-2' />}
                {darkMode ? 'Dark' : 'Light'}
              </Button>
            </div>

          </CardContent>
        </Card>

        {/* Admin & Keamanan */}
        <Card id='settings-access'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5 text-slate-500' />
              Admin & Keamanan
            </CardTitle>
            <CardDescription>Ubah username dan password untuk login</CardDescription>
          </CardHeader>
          <CardContent className='space-y-5'>
            <AdminForm />
            <AdminRecoveryCodePanel />
            <div className='rounded-md border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900'>
              <div className='flex items-center justify-between gap-4'>
                <div className='flex items-start gap-3'>
                  <div className='mt-0.5 rounded-md bg-violet-50 p-2 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'>
                    <Eye className='h-4 w-4' />
                  </div>
                  <div>
                    <p className='text-sm font-medium text-slate-900 dark:text-white'>Login Guest tanpa password</p>
                    <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>
                      Guest hanya bisa melihat data dan export laporan. Tidak bisa input, import, backup, restore, atau membuka pengaturan.
                    </p>
                  </div>
                </div>
                <Button
                  variant={guestLoginEnabled ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => {
                    const next = !guestLoginEnabled;
                    setGuestLoginEnabled(next);
                    addAuditLog(next ? 'Aktifkan Guest Login' : 'Nonaktifkan Guest Login', 'User', 'Guest', 'guest');
                    toast.success(next ? 'Login Guest diaktifkan.' : 'Login Guest dinonaktifkan.');
                  }}
                >
                  {guestLoginEnabled ? 'Aktif' : 'Nonaktif'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5 text-slate-500' />
              Akun & Role
            </CardTitle>
            <CardDescription>Kelola akun lokal untuk admin dan bendahara</CardDescription>
          </CardHeader>
          <CardContent>
            <UserAccountsPanel />
          </CardContent>
        </Card>

        {/* Tutup Buku */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <CalendarCheck className='h-5 w-5 text-slate-500' />
              Tutup Buku Tahunan
            </CardTitle>
            <CardDescription>Finalisasi tahun berjalan, kunci data, dan lanjutkan ke tahun anggaran berikutnya</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-3 sm:grid-cols-3'>
              <YearCloseMetric label='Pendapatan' value={formatCurrency(closeBookIncome)} />
              <YearCloseMetric label='Pengeluaran' value={formatCurrency(closeBookExpense)} />
              <YearCloseMetric label='Saldo Akhir' value={formatCurrency(closeBookBalance)} tone={closeBookBalance >= 0 ? 'good' : 'bad'} />
            </div>

            <div className='grid gap-2 rounded-md border bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900'>
              <YearCloseCheck
                ok={closeBookRows.length > 0}
                label={`${closeBookRows.length} transaksi tahun ${tahunAktif}`}
              />
              <YearCloseCheck
                ok={validationSummary.errors === 0}
                label={validationSummary.errors === 0 ? 'Tidak ada error validasi' : `${validationSummary.errors} error validasi perlu diperbaiki`}
              />
              <YearCloseCheck
                ok={isCurrentYearLocked}
                label={isCurrentYearLocked ? `Tahun ${tahunAktif} sudah terkunci` : `Tahun ${tahunAktif} masih terbuka`}
              />
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <Button
                variant='destructive'
                size='sm'
                onClick={() => handleCloseBook(false)}
                disabled={isCurrentYearLocked || !closeBookReady}
              >
                <Lock className='mr-2 h-4 w-4' />
                Tutup Buku
              </Button>
              <Button
                size='sm'
                onClick={() => handleCloseBook(true)}
                disabled={isCurrentYearLocked || !closeBookReady}
              >
                <ArrowRight className='mr-2 h-4 w-4' />
                Tutup & Buka {nextYear}
              </Button>
              <Button
                variant={isCurrentYearLocked ? 'outline' : 'secondary'}
                size='sm'
                onClick={handleToggleYearLock}
              >
                {isCurrentYearLocked ? <Unlock className='mr-2 h-4 w-4' /> : <Lock className='mr-2 h-4 w-4' />}
                {isCurrentYearLocked ? 'Buka Kunci Tahun' : 'Kunci Manual'}
              </Button>
            </div>

            {lockedYears.length > 0 && (
              <div className='rounded-md border bg-white p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'>
                Tahun terkunci: {lockedYears.join(', ')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database */}
        <Card id='settings-project'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Database className='h-5 w-5 text-slate-500' />
              Database
            </CardTitle>
            <CardDescription>Backup, restore, dan hapus data aplikasi</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-slate-700 dark:text-slate-200'>Backup Project</p>
                <p className='text-xs text-slate-500'>Simpan snapshot lengkap sebagai file .gpm</p>
              </div>
              <Button variant='outline' size='sm' onClick={handleNativeBackup}>
                <HardDrive className='h-4 w-4 mr-2' /> Simpan
              </Button>
            </div>

            <div className='rounded-md border bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'>
              <div className='grid gap-2 sm:grid-cols-2'>
                <p><span className='font-semibold'>Project aktif:</span> {activeProjectPath || 'Belum disimpan'}</p>
                <p><span className='font-semibold'>Simpan manual:</span> {lastSavedAt ? new Date(lastSavedAt).toLocaleString('id-ID') : 'Belum ada'}</p>
              </div>
            </div>

            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-slate-700'>Backup Data</p>
                <p className='text-xs text-slate-500'>Download semua data dalam format JSON</p>
              </div>
              <Button variant='outline' size='sm' onClick={handleBackup}>
                <Download className='h-4 w-4 mr-2' /> Download
              </Button>
            </div>

            <div className='flex items-center justify-between pt-2 border-t'>
              <div>
                <p className='text-sm font-medium text-slate-700'>Restore Data</p>
                <p className='text-xs text-slate-500'>Upload file backup untuk memulihkan data</p>
              </div>
              <Button variant='outline' size='sm' onClick={handleRestore}>
                <Upload className='h-4 w-4 mr-2' /> Upload
              </Button>
            </div>

            <div className='flex items-center justify-between pt-2 border-t'>
              <div>
                <p className='text-sm font-medium text-red-600'>Hapus Semua Data</p>
                <p className='text-xs text-slate-500'>Hapus seluruh data dari aplikasi secara permanen</p>
              </div>
              <Button variant='destructive' size='sm' onClick={handleClearData}>
                <Trash2 className='h-4 w-4 mr-2' /> Hapus
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <CardTitle className='flex items-center gap-2'>
                <HardDrive className='h-5 w-5 text-slate-500' />
                Riwayat Backup
              </CardTitle>
              <CardDescription>Backup otomatis disimpan sebelum aksi berisiko seperti import, restore, dan hapus data</CardDescription>
            </div>
            <div className='flex gap-2'>
              <Button variant='outline' size='sm' onClick={() => showBackupInFolder()}>
                Buka Folder
              </Button>
              <Button variant='outline' size='sm' onClick={refreshBackups} disabled={loadingBackups}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <p className='rounded-md border border-dashed p-4 text-sm text-slate-500 dark:border-slate-700'>
              {loadingBackups ? 'Memuat backup...' : 'Belum ada backup otomatis.'}
            </p>
          ) : (
            <div className='max-h-80 divide-y overflow-y-auto rounded-md border dark:divide-slate-700 dark:border-slate-700'>
              {backups.slice(0, 60).map((backup) => (
                <div key={backup.path} className='grid gap-3 px-3 py-3 text-sm lg:grid-cols-[1fr_170px_170px]'>
                  <div className='min-w-0'>
                    <p className='truncate font-medium text-slate-900 dark:text-white' title={backup.name}>{backup.name}</p>
                    <p className='mt-1 truncate text-xs text-slate-500' title={backup.path}>{backup.path}</p>
                  </div>
                  <div className='text-xs text-slate-500'>
                    <p>{new Date(backup.updatedAt).toLocaleString('id-ID')}</p>
                    <p>{Math.max(1, Math.round(backup.size / 1024))} KB</p>
                  </div>
                  <div className='flex flex-wrap justify-start gap-2 lg:justify-end'>
                    <Button variant='outline' size='sm' onClick={() => showBackupInFolder(backup.path)}>
                      Lokasi
                    </Button>
                    <Button size='sm' onClick={() => handleRestoreBackup(backup)}>
                      Pulihkan
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card id='settings-master'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Database className='h-5 w-5 text-slate-500' />
            Master Kode Anggaran
          </CardTitle>
          <CardDescription>Kelola dan audit kode anggaran yang dipakai Doorscrieft, Batang Tubuh, Realisasi, dan laporan</CardDescription>
        </CardHeader>
        <CardContent>
          <TambahKodeAnggaran />
        </CardContent>
      </Card>

      {/* Tentang Aplikasi */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Info className='h-5 w-5 text-slate-500' />
            Tentang Aplikasi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm'>
            <div className='flex justify-between py-2 border-b dark:border-slate-700'>
              <span className='text-slate-500'>Aplikasi</span>
              <span className='font-medium dark:text-white'>Keuangan Gereja</span>
            </div>
            <div className='flex justify-between py-2 border-b dark:border-slate-700'>
              <span className='text-slate-500'>Versi</span>
              <span className='font-medium dark:text-white'>{appVersion}</span>
            </div>
            <div className='flex justify-between py-2 border-b dark:border-slate-700'>
              <span className='text-slate-500'>Developer</span>
              <span className='font-medium dark:text-white'>Jondry Suitela</span>
            </div>
            <div className='flex justify-between py-2 border-b dark:border-slate-700'>
              <span className='text-slate-500'>User Aktif</span>
              <span className='font-medium dark:text-white'>{user?.name || 'Administrator'}</span>
            </div>
            <div className='flex justify-between py-2 border-b dark:border-slate-700'>
              <span className='text-slate-500'>Role</span>
              <span className='font-medium capitalize dark:text-white'>{user?.role || 'admin'}</span>
            </div>
            <div className='flex justify-between py-2 border-b dark:border-slate-700'>
              <span className='text-slate-500'>Jemaat</span>
              <span className='font-medium dark:text-white'>{namaJemaat}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id='settings-audit'>
        <CardHeader>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <CardTitle className='flex items-center gap-2'>
                <History className='h-5 w-5 text-slate-500' />
                Riwayat Aktivitas
              </CardTitle>
              <CardDescription>Catatan aktivitas penting seperti backup, restore, export, dan kunci tahun</CardDescription>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={async () => {
                const lanjut = await confirm({
                  title: 'Hapus riwayat aktivitas?',
                  description: 'Semua catatan aktivitas yang tampil di daftar ini akan dihapus dari data lokal.',
                  confirmText: 'Hapus Riwayat',
                  tone: 'danger',
                });
                if (!lanjut) return;
                const verified = await adminConfirm({
                  title: 'Verifikasi Admin',
                  description: 'Riwayat aktivitas akan dikosongkan. Masukkan password admin untuk melanjutkan.',
                  confirmText: 'Bersihkan',
                  tone: 'danger',
                });
                if (!verified) return;
                clearAuditLogs();
                toast.success('Riwayat aktivitas dihapus.');
              }}
              disabled={auditLogs.length === 0}
            >
              Bersihkan
            </Button>
            <Button variant='outline' size='sm' onClick={handleExportAuditLog} disabled={auditLogs.length === 0}>
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className='rounded-md border border-dashed p-4 text-sm text-slate-500 dark:border-slate-700'>Belum ada aktivitas tercatat.</p>
          ) : (
            <div className='max-h-80 divide-y overflow-y-auto rounded-md border dark:divide-slate-700 dark:border-slate-700'>
              {auditLogs.slice(0, 80).map((log) => (
                <div key={log.id} className='grid gap-1 px-3 py-2 text-sm sm:grid-cols-[180px_1fr_160px]'>
                  <p className='font-medium text-slate-900 dark:text-white'>{log.action}</p>
                  <p className='min-w-0 truncate text-slate-600 dark:text-slate-300' title={log.newValue || log.entity}>
                    {log.entity}{log.newValue ? ` - ${log.newValue}` : ''}
                  </p>
                  <p className='text-left text-xs text-slate-500 sm:text-right'>
                    {new Date(log.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ControlMetric({ title, value, detail, ok }: { title: string; value: string; detail: string; ok: boolean }) {
  return (
    <Card>
      <CardContent className='flex items-start justify-between gap-3 py-4'>
        <div className='min-w-0'>
          <p className='text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'>{title}</p>
          <p className='mt-1 truncate text-lg font-bold text-slate-900 dark:text-white'>{value}</p>
          <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>{detail}</p>
        </div>
        <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-green-600' : 'bg-amber-500'}`} />
      </CardContent>
    </Card>
  );
}

function HealthItem({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className='rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-800'>
      <div className='flex items-center gap-2'>
        {ok ? (
          <CheckCircle2 className='h-4 w-4 text-green-600' />
        ) : (
          <AlertCircle className='h-4 w-4 text-amber-600' />
        )}
        <p className='font-medium text-slate-900 dark:text-white'>{title}</p>
      </div>
      <p className='mt-2 text-xs text-slate-500 dark:text-slate-400'>{detail}</p>
    </div>
  );
}

function YearCloseMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className='rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900'>
      <p className='text-xs font-medium text-slate-500 dark:text-slate-400'>{label}</p>
      <p className={`mt-1 text-base font-bold ${
        tone === 'good'
          ? 'text-emerald-700 dark:text-emerald-300'
          : tone === 'bad'
            ? 'text-rose-700 dark:text-rose-300'
            : 'text-slate-900 dark:text-white'
      }`}>
        {value}
      </p>
    </div>
  );
}

function YearCloseCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className='flex items-center gap-2 text-slate-700 dark:text-slate-200'>
      {ok ? (
        <CheckCircle2 className='h-4 w-4 text-emerald-600' />
      ) : (
        <AlertCircle className='h-4 w-4 text-amber-600' />
      )}
      <span>{label}</span>
    </div>
  );
}

function MasterDataMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'good' | 'bad' | 'warn' | 'neutral' }) {
  return (
    <div className='rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900'>
      <p className='text-xs font-medium text-slate-500 dark:text-slate-400'>{label}</p>
      <p className={`mt-1 text-lg font-bold ${
        tone === 'good'
          ? 'text-emerald-700 dark:text-emerald-300'
          : tone === 'bad'
            ? 'text-rose-700 dark:text-rose-300'
            : tone === 'warn'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-slate-900 dark:text-white'
      }`}>
        {value}
      </p>
      <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>{detail}</p>
    </div>
  );
}

function AdminForm() {
  const { adminUsername, adminPassword, adminPasswordHash, setAdminCredentialsHash, addAuditLog } = useStore();
  const [username, setUsername] = useState(adminUsername);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (editing) return;
    setUsername(adminUsername);
    setPassword('');
  }, [adminUsername, editing]);

  const handleSave = async () => {
    if (!username.trim()) {
      toast.error('Username wajib diisi.');
      return;
    }
    if (!password && !adminPasswordHash) {
      toast.error('Password wajib diisi.');
      return;
    }
    const nextHash = password ? await hashPassword(password) : adminPasswordHash;
    setAdminCredentialsHash(username.trim(), nextHash);
    addAuditLog('Ubah Credential Admin', 'User', username.trim(), 'admin');
    setEditing(false);
    toast.success('Data admin disimpan.');
  };

  const handleCancel = () => {
    setUsername(adminUsername);
    setPassword('');
    setEditing(false);
  };

  return (
    <div className='space-y-3'>
      <div>
        <div className='mb-1 flex items-center justify-between gap-2'>
          <label className='text-sm font-medium text-slate-700 dark:text-slate-200'>Username</label>
          {!editing && <span className='text-xs text-slate-400'>Klik Ubah untuk mengedit</span>}
        </div>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={!editing}
          placeholder='Username'
        />
      </div>
      <div>
        <label className='text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block'>Password</label>
        <div className='flex gap-2'>
          <Input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!editing}
            placeholder={editing ? 'Isi untuk mengganti password' : 'Password tersimpan sebagai hash'}
          />
          <Button variant='outline' size='sm' onClick={() => setShowPw(!showPw)} type='button'>
            {showPw ? 'Sembunyi' : 'Lihat'}
          </Button>
        </div>
      </div>
      {editing ? (
        <div className='flex gap-2'>
          <Button size='sm' onClick={handleSave}>Simpan</Button>
          <Button variant='outline' size='sm' onClick={handleCancel}>Batal</Button>
        </div>
      ) : (
        <div className='space-y-2'>
          {adminPassword === 'admin123' && (
            <p className='rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700'>
              Password legacy default terdeteksi. Ubah password untuk menyimpan credential sebagai hash.
            </p>
          )}
          <Button variant='outline' size='sm' onClick={() => setEditing(true)}>
            <Edit3 className='h-4 w-4 mr-2' /> Ubah
          </Button>
        </div>
      )}
    </div>
  );
}

function AdminRecoveryCodePanel() {
  const { adminRecoveryCodeHash, adminRecoveryCodeCreatedAt, setAdminRecoveryCodeHash, addAuditLog } = useStore();
  const [newCode, setNewCode] = useState('');

  const handleGenerate = async () => {
    const code = generateRecoveryCode();
    setAdminRecoveryCodeHash(await hashPassword(code));
    setNewCode(code);
    addAuditLog('Buat Kode Pemulihan Admin', 'User', 'Kode pemulihan admin diperbarui', 'admin');
    toast.success('Kode pemulihan admin dibuat. Simpan kode ini sekarang.');
  };

  return (
    <div className='rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <p className='text-sm font-semibold text-amber-950 dark:text-amber-100'>Kode Pemulihan Admin</p>
          <p className='mt-1 text-xs text-amber-700 dark:text-amber-300'>
            Dipakai untuk reset password admin dari halaman login. Yang disimpan aplikasi hanya hash kode.
          </p>
          <p className='mt-2 text-xs text-amber-700 dark:text-amber-300'>
            Status: {adminRecoveryCodeHash ? `aktif${adminRecoveryCodeCreatedAt ? `, dibuat ${new Date(adminRecoveryCodeCreatedAt).toLocaleString('id-ID')}` : ''}` : 'belum dibuat'}
          </p>
        </div>
        <Button type='button' variant='outline' size='sm' onClick={handleGenerate}>
          {adminRecoveryCodeHash ? 'Buat Ulang' : 'Buat Kode'}
        </Button>
      </div>
      {newCode && (
        <div className='mt-3 rounded-md border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-slate-900'>
          <p className='text-xs font-semibold text-slate-600 dark:text-slate-300'>Kode baru, simpan sekarang:</p>
          <div className='mt-2 flex flex-col gap-2 sm:flex-row sm:items-center'>
            <code className='rounded-md bg-slate-100 px-3 py-2 font-mono text-sm font-bold tracking-wide text-slate-950 dark:bg-slate-950 dark:text-white'>{newCode}</code>
            <Button type='button' variant='outline' size='sm' onClick={() => navigator.clipboard?.writeText(newCode).then(() => toast.success('Kode pemulihan disalin.')).catch(() => toast.error('Gagal menyalin kode.'))}>
              Salin
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserAccountsPanel() {
  const { userAccounts, setUserAccounts, addAuditLog } = useStore();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: '',
    name: '',
    role: 'bendahara' as UserRole,
    password: '',
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({ username: '', name: '', role: 'bendahara', password: '' });
  };

  const startEdit = (account: UserAccount) => {
    setEditingId(account.id);
    setForm({
      username: account.username,
      name: account.name,
      role: account.role,
      password: '',
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const username = form.username.trim();
    const name = form.name.trim();
    if (!username || !name) {
      toast.error('Username dan nama wajib diisi.');
      return;
    }
    if (!editingId && !form.password) {
      toast.error('Password wajib diisi untuk akun baru.');
      return;
    }

    const duplicate = userAccounts.some((account) => account.username === username && account.id !== editingId);
    if (duplicate) {
      toast.error('Username sudah dipakai.');
      return;
    }

    const now = new Date();
    if (editingId) {
      const nextAccounts = await Promise.all(userAccounts.map(async (account) => {
        if (account.id !== editingId) return account;
        return {
          ...account,
          username,
          name,
          role: form.role,
          passwordHash: form.password ? await hashPassword(form.password) : account.passwordHash,
          mustChangePassword: form.password ? false : account.mustChangePassword,
          updatedAt: now,
        };
      }));
      setUserAccounts(nextAccounts);
      addAuditLog('Ubah Akun', 'User', `${name} (${roleLabel(form.role)})`, editingId);
    } else {
      const account: UserAccount = {
        id: Date.now().toString(36),
        username,
        name,
        role: form.role,
        passwordHash: await hashPassword(form.password),
        mustChangePassword: false,
        createdAt: now,
      };
      setUserAccounts([...userAccounts, account]);
      addAuditLog('Tambah Akun', 'User', `${name} (${roleLabel(form.role)})`, account.id);
    }

    resetForm();
    toast.success('Akun disimpan.');
  };

  const handleDelete = async (account: UserAccount) => {
    if (account.role === 'admin' && userAccounts.filter((item) => item.role === 'admin').length <= 1) {
      toast.error('Minimal harus ada satu akun admin.');
      return;
    }
    const lanjut = await confirm({
      title: `Hapus akun ${account.name}?`,
      description: 'Akun ini tidak bisa digunakan untuk login setelah dihapus.',
      confirmText: 'Hapus Akun',
      tone: 'danger',
    });
    if (!lanjut) return;
    setUserAccounts(userAccounts.filter((item) => item.id !== account.id));
    addAuditLog('Hapus Akun', 'User', account.name, account.id);
    toast.success('Akun dihapus.');
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        {userAccounts.map((account) => (
          <div key={account.id} className='flex items-center justify-between gap-3 rounded-md border p-3 text-sm dark:border-slate-700'>
            <div className='min-w-0'>
              <p className='font-medium text-slate-900 dark:text-white'>{account.name}</p>
              <p className='text-xs text-slate-500'>{account.username} - {roleLabel(account.role)}{account.mustChangePassword ? ' - password default' : ''}</p>
            </div>
            <div className='flex gap-2'>
              <Button variant='outline' size='sm' onClick={() => startEdit(account)}>Ubah</Button>
              <Button variant='destructive' size='sm' onClick={() => handleDelete(account)}>Hapus</Button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSave} className='rounded-md border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900'>
        <div className='grid gap-3 sm:grid-cols-2'>
          <Input
            label='Username'
            value={form.username}
            onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
            required
          />
          <Input
            label='Nama'
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <label className='text-sm font-medium text-slate-700 dark:text-slate-200'>
            Role
            <select
              className='mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white'
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
            >
              <option value='bendahara'>Bendahara</option>
              <option value='admin'>Admin</option>
            </select>
          </label>
          <Input
            label={editingId ? 'Password Baru' : 'Password'}
            type='password'
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder={editingId ? 'Kosongkan jika tidak diganti' : 'Password akun'}
            required={!editingId}
          />
        </div>
        <div className='mt-3 flex gap-2'>
          <Button type='submit'>{editingId ? 'Simpan Perubahan' : 'Tambah Akun'}</Button>
          {editingId && <Button type='button' variant='outline' onClick={resetForm}>Batal</Button>}
        </div>
      </form>
    </div>
  );
}

function TambahKodeAnggaran() {
  const { kodeAnggarans, setKodeAnggarans, addKodeAnggaran, updateKodeAnggaran, deleteKodeAnggaran, doorscrieftTransaksis, batangTubuhs, setBatangTubuhs, setSubSeksis } = useStore();
  const confirm = useConfirm();
  const adminConfirm = useAdminConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [editingKode, setEditingKode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [jenisFilter, setJenisFilter] = useState<'semua' | 'pendapatan' | 'pengeluaran' | 'judul' | 'isi'>('semua');
  const [form, setForm] = useState({ kodeAnggaran: '', mataAnggaran: '', jenisKode: 'isi' as 'judul' | 'isi' });
  useEffect(() => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.loadKodeAnggaran) return;
    electronAPI
      .loadKodeAnggaran()
      .then((items) => {
        if (Array.isArray(items)) setKodeAnggarans(items);
      })
      .catch(() => {});
  }, [setKodeAnggarans]);
  const normalizedCodes = kodeAnggarans.map((item) => String(item.kodeAnggaran || '').trim()).filter(Boolean);
  const duplicateCodes = normalizedCodes.filter((kode, index) => normalizedCodes.indexOf(kode) !== index);
  const isValidKode = (kode: string) => kode === 'I' || kode === 'II' || kode.startsWith('I.') || kode.startsWith('II.');
  const invalidCodes = kodeAnggarans.filter((item) => {
    const kode = String(item.kodeAnggaran || '').trim();
    return !kode || !isValidKode(kode);
  });
  const pendapatanCount = kodeAnggarans.filter((item) => {
    const kode = String(item.kodeAnggaran || '').trim();
    return kode === 'I' || kode.startsWith('I.');
  }).length;
  const pengeluaranCount = kodeAnggarans.filter((item) => {
    const kode = String(item.kodeAnggaran || '').trim();
    return kode === 'II' || kode.startsWith('II.');
  }).length;
  const judulCount = kodeAnggarans.filter((item) => item.jenisKode === 'judul' || item.aktifInput === false).length;
  const isiCount = kodeAnggarans.filter((item) => (item.jenisKode || 'isi') === 'isi' && item.aktifInput !== false).length;
  const filteredKodeAnggarans = kodeAnggarans
    .filter((item) => {
      const kode = String(item.kodeAnggaran || '').trim();
      if (jenisFilter === 'pendapatan' && kode !== 'I' && !kode.startsWith('I.')) return false;
      if (jenisFilter === 'pengeluaran' && kode !== 'II' && !kode.startsWith('II.')) return false;
      if (jenisFilter === 'judul' && item.jenisKode !== 'judul' && item.aktifInput !== false) return false;
      if (jenisFilter === 'isi' && ((item.jenisKode || 'isi') !== 'isi' || item.aktifInput === false)) return false;
      return true;
    })
    .filter((item) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return String(item.kodeAnggaran || '').toLowerCase().includes(q) || String(item.mataAnggaran || '').toLowerCase().includes(q);
    });
  const getUsage = (kode: string) => {
    const usedInDoorscrieft = doorscrieftTransaksis.some((row) => row.kodeAnggaran === kode);
    const usedInBatangTubuh = batangTubuhs.some((group) =>
      (group.detailRows || []).some((row) => row.kode === kode) ||
      (group.batangTubuh || []).some((bt) => (bt.detailRows || []).some((row) => row.kode === kode))
    );
    return { usedInDoorscrieft, usedInBatangTubuh, isUsed: usedInDoorscrieft || usedInBatangTubuh };
  };
  const persistKodeAnggaran = async (items: typeof kodeAnggarans, options?: { persistBatangTubuh?: boolean }) => {
    const electronAPI = getElectronAPI();
    if (electronAPI?.saveKodeAnggaran) {
      const result = await electronAPI.saveKodeAnggaran(items);
      if (result && !result.success) {
        throw new Error(result.error || 'Gagal menyimpan kode anggaran.');
      }
    }
    if (options?.persistBatangTubuh && electronAPI?.saveBatangTubuh) {
      const result = await electronAPI.saveBatangTubuh(useStore.getState().batangTubuhs);
      if (result && !result.success) {
        throw new Error(result.error || 'Gagal menyimpan sinkronisasi Batang Tubuh.');
      }
    }
  };
  const resetDialog = () => {
    setIsOpen(false);
    setEditingKode(null);
    setForm({ kodeAnggaran: '', mataAnggaran: '', jenisKode: 'isi' });
  };
  const startEdit = (item: { kodeAnggaran: string; mataAnggaran: string; jenisKode?: 'judul' | 'isi'; aktifInput?: boolean }) => {
    setEditingKode(item.kodeAnggaran);
    setForm({ kodeAnggaran: item.kodeAnggaran, mataAnggaran: item.mataAnggaran, jenisKode: item.jenisKode === 'judul' ? 'judul' : 'isi' });
    setIsOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const kodeAnggaran = form.kodeAnggaran.trim();
    const mataAnggaran = form.mataAnggaran.trim();
    if (!kodeAnggaran || !mataAnggaran) {
      toast.error('Kode dan Mata Anggaran wajib diisi.');
      return;
    }
    if (!isValidKode(kodeAnggaran)) {
      toast.error('Format kode anggaran belum valid.', {
        description: 'Gunakan awalan I untuk pendapatan atau II untuk pengeluaran.',
      });
      return;
    }

    const exists = kodeAnggarans.some((k) => k.kodeAnggaran === kodeAnggaran && k.kodeAnggaran !== editingKode);
    if (exists) {
      toast.error('Kode anggaran sudah ada.');
      return;
    }

    const isEditing = Boolean(editingKode);
    try {
      if (editingKode) {
        updateKodeAnggaran(editingKode, { kodeAnggaran, mataAnggaran, jenisKode: form.jenisKode, aktifInput: form.jenisKode === 'isi' });
      } else {
        addKodeAnggaran({ kodeAnggaran, mataAnggaran, jenisKode: form.jenisKode, aktifInput: form.jenisKode === 'isi' });
      }
      await persistKodeAnggaran(useStore.getState().kodeAnggarans, { persistBatangTubuh: isEditing });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan kode anggaran.');
      return;
    }
    useStore.getState().addAuditLog(editingKode ? 'Ubah Kode Anggaran' : 'Tambah Kode Anggaran', 'Kode Anggaran', `${kodeAnggaran} - ${mataAnggaran}`, kodeAnggaran);

    resetDialog();
    toast.success(editingKode ? 'Kode anggaran berhasil diperbarui.' : 'Kode anggaran berhasil ditambahkan dan disimpan.');
  };

  const handleDelete = async (kode: string) => {
    const usage = getUsage(kode);
    if (usage.isUsed) {
      toast.error('Kode anggaran tidak bisa dihapus.', {
        description: `Masih dipakai di ${usage.usedInDoorscrieft ? 'Doorscrieft' : 'Batang Tubuh'}.`,
      });
      return;
    }
    const lanjut = await confirm({
      title: `Hapus kode ${kode}?`,
      description: 'Kode yang dihapus tidak bisa dipakai lagi untuk input transaksi baru.',
      confirmText: 'Hapus Kode',
      tone: 'danger',
    });
    if (!lanjut) return;
    try {
      deleteKodeAnggaran(kode);
      await persistKodeAnggaran(useStore.getState().kodeAnggarans);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus kode anggaran.');
      return;
    }
    useStore.getState().addAuditLog('Hapus Kode Anggaran', 'Kode Anggaran', kode, kode);
    toast.success('Kode anggaran berhasil dihapus.');
  };

  const handleDownloadTemplate = async () => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.downloadKodeAnggaranTemplate) {
      toast.error('Template Master Kode Anggaran hanya tersedia di aplikasi desktop.');
      return;
    }
    try {
      const result = await electronAPI.downloadKodeAnggaranTemplate({ items: kodeAnggarans });
      if (!result?.success) {
        if (!result?.canceled) toast.error(result?.error || 'Gagal membuat template Master Kode Anggaran.');
        return;
      }
      toast.success('Template Master Kode Anggaran berhasil disimpan.', {
        description: result.path,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal membuat template Master Kode Anggaran.');
    }
  };

  const handleImportTemplate = async () => {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.importKodeAnggaranTemplate) {
      toast.error('Import Master Kode Anggaran hanya tersedia di aplikasi desktop.');
      return;
    }
    try {
      const result = await electronAPI.importKodeAnggaranTemplate();
      if (!result?.success) {
        if (!result?.canceled) toast.error(result?.error || 'Gagal import Master Kode Anggaran.');
        return;
      }
      const verified = await adminConfirm({
        title: 'Verifikasi Admin',
        description: 'Import template akan menimpa seluruh Master Kode Anggaran lama. Masukkan password admin untuk melanjutkan.',
        confirmText: 'Import Master',
        tone: 'warning',
      });
      if (!verified) return;
      if (Array.isArray(result.items)) {
        setKodeAnggarans(result.items);
      }
      useStore.getState().addAuditLog(
        'Import Master Kode Anggaran',
        'Kode Anggaran',
        `${result.imported || 0} baris mengganti master lama, total ${result.total || result.items?.length || 0} kode`,
        result.path || ''
      );
      toast.success('Import Master Kode Anggaran berhasil.', {
        description: `Master lama diganti. Total master sekarang ${result.total || result.items?.length || 0} kode.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal import Master Kode Anggaran.');
    }
  };

  const handleSyncAllFromMaster = async () => {
    const electronAPI = getElectronAPI();
    const latestMaster = useStore.getState().kodeAnggarans;
    if (!latestMaster.length) {
      toast.error('Master Kode Anggaran masih kosong.', {
        description: 'Import atau tambah kode anggaran dulu.',
      });
      return;
    }

    const nextBatangTubuhs = buildBatangTubuhFromMasterKode(latestMaster, useStore.getState().batangTubuhs);
    const nextSubSeksis = buildSubSeksiFromMasterKode(latestMaster);
    if (nextBatangTubuhs.length === 0 && nextSubSeksis.length === 0) {
      toast.error('Master belum bisa disinkronkan.', {
        description: 'Pastikan ada kode Judul dan kode Isi pada Master Kode Anggaran.',
      });
      return;
    }

    const lanjut = await confirm({
      title: 'Sinkronkan Master ke Sub Seksi dan Batang Tubuh?',
      description: 'Struktur akan mengikuti Master Kode Anggaran. Nilai anggaran dan program lama tetap dipertahankan selama kodenya sama.',
      confirmText: 'Sinkronkan Semua',
      tone: 'default',
    });
    if (!lanjut) return;
    const verified = await adminConfirm({
      title: 'Verifikasi Admin',
      description: 'Sinkronisasi akan memperbarui struktur Sub Seksi dan Batang Tubuh dari Master Kode Anggaran.',
      confirmText: 'Sinkronkan',
      tone: 'warning',
    });
    if (!verified) return;

    try {
      if (nextBatangTubuhs.length > 0) {
        setBatangTubuhs(nextBatangTubuhs);
        if (electronAPI?.saveBatangTubuh) {
          const result = await electronAPI.saveBatangTubuh(nextBatangTubuhs);
          if (!result?.success) throw new Error(result?.error || 'Gagal menyimpan Batang Tubuh.');
        }
      }
      if (nextSubSeksis.length > 0) {
        setSubSeksis(nextSubSeksis);
        if (electronAPI?.saveSubSeksi) {
          const result = await electronAPI.saveSubSeksi(nextSubSeksis);
          if (!result?.success) throw new Error(result?.error || 'Gagal menyimpan Sub Seksi.');
        }
      }
      useStore.getState().addAuditLog(
        'Sinkron Master Kode Anggaran',
        'Master Kode Anggaran',
        `${nextSubSeksis.length} sub seksi, ${nextBatangTubuhs.length} kelompok batang tubuh`,
        'master-kode-anggaran'
      );
      toast.success('Sinkronisasi Master selesai.', {
        description: `${nextSubSeksis.length} Sub Seksi dan ${nextBatangTubuhs.length} kelompok Batang Tubuh diperbarui.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal sinkronisasi Master.');
    }
  };

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <MasterDataMetric label='Total Kode' value={String(kodeAnggarans.length)} detail='Semua kode aktif' />
        <MasterDataMetric label='Pendapatan' value={String(pendapatanCount)} detail='Awalan I.' tone='good' />
        <MasterDataMetric label='Pengeluaran' value={String(pengeluaranCount)} detail='Awalan II.' tone='bad' />
        <MasterDataMetric
          label='Judul / Isi'
          value={`${judulCount} / ${isiCount}`}
          detail='Judul kelompok, Isi input uang'
          tone={duplicateCodes.length > 0 || invalidCodes.length > 0 ? 'warn' : 'good'}
        />
      </div>

      <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
        <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
          <Input
            className='lg:w-80'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Cari kode atau mata anggaran...'
          />
          <div className='inline-flex w-fit rounded-md border border-slate-200 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-900'>
            {[
              { key: 'semua', label: 'Semua', count: kodeAnggarans.length },
              { key: 'pendapatan', label: 'Pendapatan', count: pendapatanCount },
              { key: 'pengeluaran', label: 'Pengeluaran', count: pengeluaranCount },
              { key: 'judul', label: 'Judul', count: judulCount },
              { key: 'isi', label: 'Isi', count: isiCount },
            ].map((item) => (
              <button
                key={item.key}
                type='button'
                onClick={() => setJenisFilter(item.key as 'semua' | 'pendapatan' | 'pengeluaran' | 'judul' | 'isi')}
                className={`rounded px-3 py-1.5 font-medium transition ${
                  jenisFilter === item.key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {item.label} <span className='ml-1 text-xs opacity-80'>{item.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' onClick={handleDownloadTemplate}>
            <Download className='mr-2 h-4 w-4' /> Template Import
          </Button>
          <Button variant='outline' onClick={handleImportTemplate}>
            <Upload className='mr-2 h-4 w-4' /> Import Template
          </Button>
          <Button variant='outline' onClick={handleSyncAllFromMaster}>
            <RefreshCw className='mr-2 h-4 w-4' /> Sinkron Semua
          </Button>
          <Button onClick={() => { setEditingKode(null); setForm({ kodeAnggaran: '', mataAnggaran: '', jenisKode: 'isi' }); setIsOpen(true); }}>
            <Plus className='h-4 w-4 mr-2' /> Tambah Kode Anggaran
          </Button>
        </div>
      </div>

      {(duplicateCodes.length > 0 || invalidCodes.length > 0) && (
        <div className='rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'>
          <p className='font-semibold'>Master kode perlu dicek.</p>
          <p className='mt-1 text-xs'>Ditemukan {duplicateCodes.length} kode duplikat dan {invalidCodes.length} kode dengan format tidak standar.</p>
        </div>
      )}

      <div className='overflow-hidden rounded-md border border-slate-200 dark:border-slate-700'>
        <div className='grid grid-cols-[150px_1fr_100px_120px_140px] gap-3 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400'>
          <span>Kode</span>
          <span>Mata Anggaran</span>
          <span>Jenis</span>
          <span>Status</span>
          <span className='text-right'>Aksi</span>
        </div>
        <div className='max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700'>
          {filteredKodeAnggarans.length === 0 ? (
            <div className='p-3'>
              <AppStateMessage
                tone={kodeAnggarans.length === 0 ? 'empty' : 'search'}
                title={kodeAnggarans.length === 0 ? 'Belum ada kode anggaran' : 'Tidak ada kode anggaran yang cocok'}
                detail={kodeAnggarans.length === 0 ? 'Tambahkan kode anggaran pertama untuk mulai menghubungkan transaksi dan laporan.' : 'Ubah pencarian atau filter jenis kode anggaran.'}
                compact
              />
            </div>
          ) : filteredKodeAnggarans.map((item) => {
            const kode = String(item.kodeAnggaran || '').trim();
            const invalid = !kode || !isValidKode(kode);
            const duplicate = duplicateCodes.includes(kode);
            const isJudul = item.jenisKode === 'judul' || item.aktifInput === false;
            return (
              <div key={`${kode}-${item.mataAnggaran}`} className='grid grid-cols-[150px_1fr_100px_120px_140px] items-center gap-3 px-3 py-2 text-sm'>
                <span className='font-mono text-xs text-slate-700 dark:text-slate-200'>{kode || '-'}</span>
                <span className='truncate text-slate-900 dark:text-white'>{item.mataAnggaran || '-'}</span>
                <span className={`w-fit rounded px-2 py-0.5 text-xs font-semibold ${isJudul ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200'}`}>
                  {isJudul ? 'Judul' : 'Isi'}
                </span>
                <span className={`text-xs font-semibold ${invalid || duplicate ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                  {invalid ? 'Format' : duplicate ? 'Duplikat' : kode === 'I' || kode.startsWith('I.') ? 'Pendapatan' : 'Pengeluaran'}
                </span>
                <span className='flex justify-end gap-2'>
                  <Button variant='outline' size='sm' onClick={() => startEdit(item)}>Ubah</Button>
                  <Button variant='destructive' size='sm' onClick={() => handleDelete(kode)}>Hapus</Button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingKode ? 'Ubah Kode Anggaran' : 'Tambah Kode Anggaran'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className='space-y-4'>
            <Input
              label='Kode Anggaran'
              value={form.kodeAnggaran}
              onChange={(e) => setForm((prev) => ({ ...prev, kodeAnggaran: e.target.value }))}
              placeholder='Contoh: I.3.1...'
              required
            />
            <Input
              label='Mata Anggaran'
              value={form.mataAnggaran}
              onChange={(e) => setForm((prev) => ({ ...prev, mataAnggaran: e.target.value }))}
              placeholder='Nama mata anggaran'
              required
            />
            <label className='block text-sm font-medium text-slate-700 dark:text-slate-200'>
              Jenis Kode
              <select
                className='mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white'
                value={form.jenisKode}
                onChange={(e) => setForm((prev) => ({ ...prev, jenisKode: e.target.value as 'judul' | 'isi' }))}
              >
                <option value='isi'>Isi - bisa dipakai input uang</option>
                <option value='judul'>Judul - hanya kelompok laporan</option>
              </select>
            </label>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={resetDialog}>Batal</Button>
              <Button type='submit'>{editingKode ? 'Simpan Perubahan' : 'Simpan'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
