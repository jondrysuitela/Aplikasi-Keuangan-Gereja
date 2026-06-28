import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, Church, ImagePlus, Landmark, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateRecoveryCode, hashPassword } from '@/lib/password';
import { churchLogoUrl } from '@/lib/assets';

type OrganizationLevel = 'klasis' | 'jemaat';

const compressSetupBackground = (file: File): Promise<string> => new Promise((resolve, reject) => {
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

export function SetupPage() {
  const navigate = useNavigate();
  const {
    setOrganizationLevel,
    setNamaJemaat,
    setKopGereja,
    setKopKlas,
    setPenandatanganKiriJabatan,
    setPenandatanganKiriNama,
    setPenandatanganKananJabatan,
    setPenandatanganKananNama,
    setAppName,
    setAppSubtitle,
    setLoginBackgroundImage,
    setAdminCredentialsHash,
    setAdminRecoveryCodeHash,
    setSetupCompleted,
    addAuditLog,
  } = useStore();

  const [level, setLevel] = useState<OrganizationLevel>('jemaat');
  const [namaGereja, setNamaGereja] = useState('Gereja Protestan Maluku');
  const [namaKlasis, setNamaKlasis] = useState('');
  const [namaJemaat, setNamaJemaatLocal] = useState('');
  const [appName, setAppNameLocal] = useState('Aplikasi Keuangan');
  const [namaKetua, setNamaKetua] = useState('');
  const [namaBendahara, setNamaBendahara] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [recoveryCode, setRecoveryCode] = useState(() => generateRecoveryCode());
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const subtitle = useMemo(() => {
    if (level === 'jemaat') return namaJemaat.trim() || 'Tingkat Jemaat';
    return namaKlasis.trim() || 'Tingkat Klasis';
  }, [level, namaJemaat, namaKlasis]);

  const handleUploadBackground = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        setBackgroundImage(await compressSetupBackground(file));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Gagal upload background.');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanGereja = namaGereja.trim();
    const cleanKlasis = namaKlasis.trim();
    const cleanJemaat = namaJemaat.trim();
    const cleanAdmin = adminUsername.trim();
    const cleanAppName = appName.trim() || 'Aplikasi Keuangan';
    const cleanKetua = namaKetua.trim();
    const cleanBendahara = namaBendahara.trim();

    if (!cleanGereja || !cleanKlasis) {
      toast.error('Nama gereja dan nama klasis wajib diisi.');
      return;
    }
    if (level === 'jemaat' && !cleanJemaat) {
      toast.error('Nama jemaat wajib diisi untuk penggunaan tingkat Jemaat.');
      return;
    }
    if (!cleanAdmin || adminPassword.length < 6) {
      toast.error('Username admin wajib diisi dan password minimal 6 karakter.');
      return;
    }
    if (adminPassword !== adminPasswordConfirm) {
      toast.error('Konfirmasi password admin tidak sama.');
      return;
    }

    setSubmitting(true);
    try {
      setOrganizationLevel(level);
      setKopGereja(cleanGereja);
      setKopKlas(cleanKlasis);
      setNamaJemaat(level === 'jemaat' ? cleanJemaat : cleanKlasis);
      setPenandatanganKiriJabatan(level === 'jemaat' ? 'Ketua Majelis Jemaat' : 'Ketua Klasis');
      setPenandatanganKiriNama(cleanKetua);
      setPenandatanganKananJabatan(level === 'jemaat' ? 'Bendahara Jemaat' : 'Bendahara Klasis');
      setPenandatanganKananNama(cleanBendahara);
      setAppName(cleanAppName);
      setAppSubtitle(subtitle);
      setLoginBackgroundImage(backgroundImage);
      setAdminCredentialsHash(cleanAdmin, await hashPassword(adminPassword));
      setAdminRecoveryCodeHash(await hashPassword(recoveryCode));
      setSetupCompleted(true);
      addAuditLog('Setup Awal Aplikasi', 'Aplikasi', `${level === 'jemaat' ? cleanJemaat : cleanKlasis}`, level);
      toast.success('Setup awal selesai. Silakan login sebagai admin.');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Setup awal gagal disimpan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='min-h-screen bg-slate-100 p-4 text-slate-950 dark:bg-slate-950 dark:text-white sm:p-6 lg:p-10'>
      <div className='mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 lg:grid-cols-[0.46fr_0.54fr]'>
        <section className='flex flex-col justify-between bg-slate-950 p-8 text-white lg:p-10'>
          <div>
            <img src={churchLogoUrl} alt='Logo' className='h-20 w-20' />
            <h1 className='mt-8 text-3xl font-bold'>Setup Awal Aplikasi</h1>
            <p className='mt-3 max-w-sm text-sm leading-6 text-slate-300'>
              Tentukan apakah aplikasi ini dipakai di tingkat Klasis atau Jemaat, lalu isi identitas operasional yang akan dipakai laporan.
            </p>
          </div>
          <div className='mt-8 grid gap-3 text-sm'>
            <SetupNote title='Identitas organisasi' detail='Kop laporan dan nama aplikasi mengikuti data ini.' />
            <SetupNote title='Akun admin' detail='Akun ini dipakai untuk login pertama setelah setup.' />
            <SetupNote title='Background opsional' detail='Tidak ada foto default. Upload hanya kalau dibutuhkan.' />
          </div>
        </section>

        <section className='overflow-y-auto p-6 lg:p-8'>
          <form onSubmit={handleSubmit} className='space-y-6'>
            <div>
              <p className='text-sm font-semibold text-slate-500 dark:text-slate-400'>Level Penggunaan</p>
              <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                <LevelButton
                  active={level === 'klasis'}
                  title='Klasis'
                  detail='Dipakai untuk pengelolaan tingkat Klasis.'
                  tone='emerald'
                  onClick={() => setLevel('klasis')}
                />
                <LevelButton
                  active={level === 'jemaat'}
                  title='Jemaat'
                  detail='Dipakai sampai tingkat Jemaat.'
                  tone='blue'
                  onClick={() => setLevel('jemaat')}
                />
              </div>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <Input label='Nama Gereja/Sinode' value={namaGereja} onChange={(e) => setNamaGereja(e.target.value)} placeholder='Gereja Protestan Maluku' required />
              <Input label='Nama Klasis' value={namaKlasis} onChange={(e) => setNamaKlasis(e.target.value)} placeholder='Contoh: Klasis Pulau Ambon Timur' required />
              {level === 'jemaat' && (
                <Input label='Nama Jemaat' value={namaJemaat} onChange={(e) => setNamaJemaatLocal(e.target.value)} placeholder='Contoh: Jemaat GPM Suli' required />
              )}
              <Input label='Nama Aplikasi' value={appName} onChange={(e) => setAppNameLocal(e.target.value)} placeholder='Aplikasi Keuangan' />
            </div>

            <div className='rounded-lg border border-slate-200 p-4 dark:border-slate-700'>
              <div className='flex items-start gap-3'>
                <CheckCircle2 className='mt-1 h-5 w-5 text-emerald-600' />
                <div>
                  <p className='font-semibold'>Tanda Tangan Laporan</p>
                  <p className='text-sm text-slate-500 dark:text-slate-400'>
                    Nama ini akan dipakai otomatis pada template cetak dan laporan.
                  </p>
                </div>
              </div>
              <div className='mt-4 grid gap-4 sm:grid-cols-2'>
                <Input
                  label={level === 'jemaat' ? 'Nama Ketua Majelis Jemaat' : 'Nama Ketua Klasis'}
                  value={namaKetua}
                  onChange={(e) => setNamaKetua(e.target.value)}
                  placeholder={level === 'jemaat' ? 'Contoh: Pdt. Nama Ketua' : 'Contoh: Nama Ketua Klasis'}
                />
                <Input
                  label={level === 'jemaat' ? 'Nama Bendahara Jemaat' : 'Nama Bendahara Klasis'}
                  value={namaBendahara}
                  onChange={(e) => setNamaBendahara(e.target.value)}
                  placeholder={level === 'jemaat' ? 'Contoh: Nama Bendahara Jemaat' : 'Contoh: Nama Bendahara Klasis'}
                />
              </div>
            </div>

            <div className='rounded-lg border border-slate-200 p-4 dark:border-slate-700'>
              <div className='flex items-start gap-3'>
                <ShieldCheck className='mt-1 h-5 w-5 text-blue-600' />
                <div>
                  <p className='font-semibold'>Akun Admin Pertama</p>
                  <p className='text-sm text-slate-500 dark:text-slate-400'>Gunakan password yang mudah diingat tapi tidak terlalu pendek.</p>
                </div>
              </div>
              <div className='mt-4 grid gap-4 sm:grid-cols-3'>
                <Input label='Username' value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} required />
                <Input label='Password' type='password' value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
                <Input label='Konfirmasi' type='password' value={adminPasswordConfirm} onChange={(e) => setAdminPasswordConfirm(e.target.value)} required />
              </div>
              <div className='mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30'>
                <p className='text-sm font-semibold text-amber-900 dark:text-amber-100'>Kode Pemulihan Admin</p>
                <p className='mt-1 text-xs text-amber-700 dark:text-amber-300'>
                  Simpan kode ini di tempat aman. Kode hanya ditampilkan di setup dan dipakai kalau admin lupa password.
                </p>
                <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:items-center'>
                  <code className='rounded-md bg-white px-3 py-2 font-mono text-sm font-bold tracking-wide text-slate-900 dark:bg-slate-900 dark:text-white'>
                    {recoveryCode}
                  </code>
                  <div className='flex gap-2'>
                    <Button type='button' variant='outline' size='sm' onClick={() => navigator.clipboard?.writeText(recoveryCode).then(() => toast.success('Kode pemulihan disalin.')).catch(() => toast.error('Gagal menyalin kode.'))}>
                      Salin
                    </Button>
                    <Button type='button' variant='ghost' size='sm' onClick={() => setRecoveryCode(generateRecoveryCode())}>
                      Buat Ulang
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className='rounded-lg border border-slate-200 p-4 dark:border-slate-700'>
              <div className='grid gap-4 sm:grid-cols-[1fr_220px] sm:items-center'>
                <div>
                  <p className='font-semibold'>Background Login</p>
                  <p className='mt-1 text-sm text-slate-500 dark:text-slate-400'>
                    Opsional. Jika tidak diupload, login memakai tampilan netral tanpa foto bawaan.
                  </p>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <Button type='button' variant='outline' onClick={handleUploadBackground} disabled={uploading}>
                      <ImagePlus className='mr-2 h-4 w-4' />
                      {uploading ? 'Memproses...' : 'Upload Background'}
                    </Button>
                    <Button type='button' variant='ghost' onClick={() => setBackgroundImage(null)} disabled={!backgroundImage || uploading}>
                      Hapus
                    </Button>
                  </div>
                </div>
                <div className='h-32 overflow-hidden rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800'>
                  {backgroundImage ? (
                    <img src={backgroundImage} alt='Preview background' className='h-full w-full object-cover' />
                  ) : (
                    <div className='grid h-full place-items-center text-center text-xs text-slate-500 dark:text-slate-400'>
                      <div>
                        <Building2 className='mx-auto mb-2 h-6 w-6' />
                        Tanpa background
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className='flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-sm text-slate-500 dark:text-slate-400'>
                Setelah selesai, aplikasi akan masuk ke halaman login admin.
              </p>
              <Button type='submit' disabled={submitting}>
                <CheckCircle2 className='mr-2 h-4 w-4' />
                {submitting ? 'Menyimpan...' : 'Selesaikan Setup'}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function LevelButton({ active, title, detail, tone, onClick }: { active: boolean; title: string; detail: string; tone: 'blue' | 'emerald'; onClick: () => void }) {
  const Icon = title === 'Klasis' ? Landmark : Church;
  const activeClass = tone === 'emerald'
    ? 'border-emerald-400 bg-emerald-50 text-emerald-950 shadow-sm ring-2 ring-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-100 dark:ring-emerald-900/50'
    : 'border-blue-400 bg-blue-50 text-blue-950 shadow-sm ring-2 ring-blue-100 dark:border-blue-700 dark:bg-blue-950/35 dark:text-blue-100 dark:ring-blue-900/50';
  const iconClass = active
    ? tone === 'emerald'
      ? 'bg-emerald-600 text-white'
      : 'bg-blue-600 text-white'
    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
  const checkClass = tone === 'emerald'
    ? 'bg-emerald-600 text-white'
    : 'bg-blue-600 text-white';

  return (
    <button
      type='button'
      onClick={onClick}
      className={`relative overflow-hidden rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? activeClass
          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
      }`}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-start gap-3'>
          <span className={`rounded-md p-2 transition ${iconClass}`}>
            <Icon className='h-5 w-5' />
          </span>
          <div>
            <p className='font-semibold'>{title}</p>
            <p className={`mt-1 text-sm ${active ? 'text-current opacity-75' : 'text-slate-500 dark:text-slate-400'}`}>{detail}</p>
          </div>
        </div>
        <span className={`grid h-6 w-6 place-items-center rounded-full border text-xs transition ${
          active ? checkClass : 'border-slate-200 bg-white text-transparent dark:border-slate-700 dark:bg-slate-900'
        }`}>
          <CheckCircle2 className='h-4 w-4' />
        </span>
      </div>
    </button>
  );
}

function SetupNote({ title, detail }: { title: string; detail: string }) {
  return (
    <div className='rounded-lg border border-white/10 bg-white/5 p-3'>
      <p className='font-semibold'>{title}</p>
      <p className='mt-1 text-xs text-slate-300'>{detail}</p>
    </div>
  );
}
