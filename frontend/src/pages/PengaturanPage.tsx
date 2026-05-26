import { useStore } from '@/stores';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Settings, Database, Download, Upload, Trash2, Moon, Sun, Plus, Lock, Edit3, Building2, Shield, Info, Palette, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAppVersion } from '@/lib/appVersion';
import { loginBackgroundTwoUrl } from '@/lib/assets';

const STORAGE_KEY = 'keuangan-gereja-autosave';
const LEGACY_STORAGE_KEY = 'keuangan-gereja-storage';

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
  const { user, namaJemaat, setNamaJemaat, kopGereja, setKopGereja, kopKlas, setKopKlas, appName, setAppName, appSubtitle, setAppSubtitle, loginBackgroundImage, setLoginBackgroundImage, resetLoginBackgroundImage, adminUsername, adminPassword, setAdminCredentials } = useStore();
  const [darkMode, setDarkMode] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const appVersion = useAppVersion();

  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
  }, []);

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
          localStorage.setItem(STORAGE_KEY, text);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          alert('Data berhasil direstore. Silakan refresh halaman.');
          window.location.reload();
        } catch {
          alert('File tidak valid');
        }
      }
    };
    input.click();
  };

  const handleClearData = () => {
    if (confirm('Yakin hapus semua data? Tindakan ini tidak dapat dibatalkan.')) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.location.reload();
    }
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
        alert(error instanceof Error ? error.message : 'Gagal upload foto background.');
      } finally {
        setUploadingBackground(false);
      }
    };
    input.click();
  };

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold text-slate-900 dark:text-white'>Pengaturan</h1>
        <p className='text-slate-500'>Kelola aplikasi dan data</p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Identitas Gereja */}
        <Card>
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
                    <img
                      src={loginBackgroundImage || loginBackgroundTwoUrl}
                      alt='Preview foto login'
                      className='h-full w-full object-cover'
                    />
                  </div>
                </div>
                <div className='mt-2 px-1'>
                  <p className='text-sm font-semibold text-white'>{loginBackgroundImage ? 'Foto custom aktif' : 'Foto gereja default aktif'}</p>
                  <p className='text-xs text-white/75'>Login kiri, foto gereja kanan</p>
                </div>
              </div>
              <div className='mt-3 flex flex-wrap gap-2'>
                <Button variant='outline' size='sm' onClick={handleUploadLoginBackground} disabled={uploadingBackground}>
                  <Upload className='h-4 w-4 mr-2' /> {uploadingBackground ? 'Memproses...' : 'Upload Foto'}
                </Button>
                <Button variant='outline' size='sm' onClick={resetLoginBackgroundImage} disabled={!loginBackgroundImage || uploadingBackground}>
                  Reset Default
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
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5 text-slate-500' />
              Admin & Keamanan
            </CardTitle>
            <CardDescription>Ubah username dan password untuk login</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminForm />
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
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

      {/* Tambah Kode Anggaran */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Plus className='h-5 w-5 text-slate-500' />
            Tambah Kode Anggaran
          </CardTitle>
          <CardDescription>Tambah kode anggaran baru ke database</CardDescription>
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
    </div>
  );
}

function AdminForm() {
  const { adminUsername, adminPassword, setAdminCredentials } = useStore();
  const [username, setUsername] = useState(adminUsername);
  const [password, setPassword] = useState(adminPassword);
  const [showPw, setShowPw] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setUsername(adminUsername);
    setPassword(adminPassword);
  }, [adminUsername, adminPassword]);

  const handleSave = () => {
    if (!username.trim()) {
      alert('Username wajib diisi');
      return;
    }
    setAdminCredentials(username.trim(), password);
    setEditing(false);
  };

  const handleCancel = () => {
    setUsername(adminUsername);
    setPassword(adminPassword);
    setEditing(false);
  };

  return (
    <div className='space-y-3'>
      <div>
        <label className='text-sm font-medium text-slate-700 mb-1 block'>Username</label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={!editing}
          placeholder='Username'
        />
      </div>
      <div>
        <label className='text-sm font-medium text-slate-700 mb-1 block'>Password</label>
        <div className='flex gap-2'>
          <Input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!editing}
            placeholder='Password'
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
        <Button variant='outline' size='sm' onClick={() => setEditing(true)}>
          <Edit3 className='h-4 w-4 mr-2' /> Ubah
        </Button>
      )}
    </div>
  );
}

function TambahKodeAnggaran() {
  const { kodeAnggarans, addKodeAnggaran } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ kodeAnggaran: '', mataAnggaran: '' });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const kodeAnggaran = form.kodeAnggaran.trim();
    const mataAnggaran = form.mataAnggaran.trim();
    if (!kodeAnggaran || !mataAnggaran) {
      alert('Kode dan Mata Anggaran wajib diisi');
      return;
    }

    const exists = kodeAnggarans.some((k) => k.kodeAnggaran === kodeAnggaran);
    if (exists) {
      alert('Kode anggaran sudah ada');
      return;
    }

    addKodeAnggaran({ kodeAnggaran, mataAnggaran });

    const anyWin = window as unknown as { electronAPI?: { saveKodeAnggaran?: (items: Array<{ kodeAnggaran: string; mataAnggaran: string }>) => Promise<{ success: boolean }> } };
    if (anyWin?.electronAPI?.saveKodeAnggaran) {
      const updated = [...kodeAnggarans, { kodeAnggaran, mataAnggaran }];
      await anyWin.electronAPI.saveKodeAnggaran(updated);
    }

    setIsOpen(false);
    setForm({ kodeAnggaran: '', mataAnggaran: '' });
    alert('Kode anggaran berhasil ditambahkan dan disimpan ke database.');
  };

  return (
    <div className='flex items-center gap-3'>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className='h-4 w-4 mr-2' /> Tambah Kode Anggaran
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Kode Anggaran</DialogTitle>
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
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => setIsOpen(false)}>Batal</Button>
              <Button type='submit'>Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
