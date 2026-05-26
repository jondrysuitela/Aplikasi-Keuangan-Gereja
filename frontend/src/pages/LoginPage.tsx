import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, AlertTriangle } from 'lucide-react';
import { churchLogoUrl, loginBackgroundTwoUrl } from '@/lib/assets';
import { useAppVersion } from '@/lib/appVersion';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const appVersion = useAppVersion();
  const navigate = useNavigate();
  const { setUser, adminUsername, adminPassword, appName, appSubtitle, loginBackgroundImage } = useStore();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    if (username === adminUsername && password === adminPassword) {
      setUser({
        id: '1',
        username: adminUsername,
        name: 'Administrator',
        role: 'admin',
        createdAt: new Date(),
      });
      navigate('/');
    } else {
      setError('Username atau password salah');
    }
  };

  return (
    <div className='relative min-h-screen overflow-hidden bg-gradient-to-br from-purple-700 via-purple-800 to-fuchsia-900 p-4 sm:p-6 lg:p-10'>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.20),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(255,214,179,0.18),transparent_30%)]' />

      <div className='relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center justify-center sm:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-5rem)]'>
        <div className='grid w-full overflow-hidden rounded-2xl bg-white shadow-2xl shadow-purple-950/35 lg:min-h-[620px] lg:grid-cols-[0.42fr_0.58fr]'>
          <section className='flex items-center justify-center bg-white px-6 py-10 sm:px-10 lg:px-14'>
            <div className='w-full max-w-sm'>
              <div className='mb-8 text-center'>
                <img src={churchLogoUrl} alt='GPM' className='mx-auto mb-4 h-20 w-20' />
                <h1 className='text-2xl font-bold leading-tight text-slate-950'>{appName}</h1>
                <p className='mt-1 text-sm text-slate-500'>{appSubtitle}</p>
              </div>

              <div className='mb-5 flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3'>
                <AlertTriangle className='h-4 w-4 flex-shrink-0 text-yellow-600' />
                <p className='text-xs text-yellow-700'>Aplikasi ini masih dalam tahap pengembangan</p>
              </div>

              <form onSubmit={handleLogin} className='space-y-4'>
                <Input
                  label='Username'
                  type='text'
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                  placeholder='Masukkan username'
                  required
                />
                <Input
                  label='Password'
                  type='password'
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder='Masukkan password'
                  required
                />
                {error && (
                  <p className='text-sm text-red-600'>{error}</p>
                )}
                <Button type='submit' className='w-full bg-purple-700 hover:bg-purple-800'>
                  <Lock className='mr-2 h-4 w-4' /> Masuk
                </Button>
              </form>

              <div className='mt-8 border-t border-slate-200 pt-4 text-center'>
                <p className='text-xs text-slate-500'>Aplikasi ini dibuat dengan bantuan AI</p>
                <p className='mt-1 text-xs text-slate-400'>v{appVersion} — Jondry Suitela</p>
              </div>
            </div>
          </section>

          <section className='relative hidden min-h-[460px] bg-slate-100 lg:block'>
            <img
              src={loginBackgroundImage || loginBackgroundTwoUrl}
              alt='Gedung Gereja'
              className='h-full w-full object-cover'
            />
          </section>

          <section className='relative min-h-64 bg-slate-100 lg:hidden'>
            <img
              src={loginBackgroundImage || loginBackgroundTwoUrl}
              alt='Gedung Gereja'
              className='h-full w-full object-cover'
            />
          </section>
        </div>
      </div>
    </div>
  );
}
