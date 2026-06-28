import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Lock, AlertTriangle, CheckCircle2, Eye, ShieldCheck, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { churchLogoUrl } from '@/lib/assets';
import { useAppVersion } from '@/lib/appVersion';
import { hashPassword, verifyPassword } from '@/lib/password';
import { roleLabel } from '@/lib/permissions';
import { shouldRequireInitialSetup } from '@/lib/setupMode';
import type { User, UserRole } from '@/types';

const roleVisuals: Record<UserRole | 'default', {
  label: string;
  caption: string;
  Icon: typeof ShieldCheck;
  pageBg: string;
  button: string;
  badge: string;
  ring: string;
}> = {
  admin: {
    label: 'Admin',
    caption: 'Akses penuh untuk pengaturan, backup, restore, dan keamanan.',
    Icon: ShieldCheck,
    pageBg: 'from-slate-950 via-blue-950 to-slate-900',
    button: 'bg-blue-700 hover:bg-blue-800',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    ring: 'ring-blue-500/25',
  },
  bendahara: {
    label: 'Bendahara',
    caption: 'Ruang kerja input, import, export, dan backup operasional.',
    Icon: Wallet,
    pageBg: 'from-emerald-950 via-teal-900 to-slate-950',
    button: 'bg-emerald-700 hover:bg-emerald-800',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    ring: 'ring-emerald-500/25',
  },
  guest: {
    label: 'Guest',
    caption: 'Akses baca tanpa password untuk melihat laporan dan export.',
    Icon: Eye,
    pageBg: 'from-violet-950 via-purple-900 to-slate-950',
    button: 'bg-violet-700 hover:bg-violet-800',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    ring: 'ring-violet-500/25',
  },
  default: {
    label: 'Pilih Role',
    caption: 'Masukkan username untuk menampilkan akses yang sesuai.',
    Icon: Lock,
    pageBg: 'from-purple-700 via-purple-800 to-fuchsia-900',
    button: 'bg-purple-700 hover:bg-purple-800',
    badge: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    ring: 'ring-purple-500/25',
  },
};

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginRole, setLoginRole] = useState<UserRole | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);
  const appVersion = useAppVersion();
  const navigate = useNavigate();
  const { setUser, setupCompleted, adminUsername, adminPassword, adminPasswordHash, adminRecoveryCodeHash, setAdminCredentialsHash, userAccounts, guestLoginEnabled, appName, appSubtitle, loginBackgroundImage, addAuditLog } = useStore();

  useEffect(() => {
    if (shouldRequireInitialSetup(setupCompleted)) {
      navigate('/setup', { replace: true });
      return undefined;
    }
    const anyWin = window as unknown as { electronAPI?: { onCloseRequested?: (cb: () => void) => () => void; forceClose?: () => Promise<{ success: boolean }> } };
    const cleanup = anyWin.electronAPI?.onCloseRequested?.(() => {
      anyWin.electronAPI?.forceClose?.();
    });
    return cleanup;
  }, [navigate, setupCompleted]);
  const trimmedUsername = username.trim();
  const hintedAccount = useMemo(() => {
    return userAccounts.find((item) => item.username.toLowerCase() === trimmedUsername.toLowerCase());
  }, [trimmedUsername, userAccounts]);
  const hintedRole = hintedAccount?.role || (trimmedUsername === adminUsername ? 'admin' : null);
  const visual = roleVisuals[loginRole || hintedRole || 'default'];
  const RoleIcon = visual.Icon;

  const completeLogin = (user: User, auditAction: string, auditDetail: string, auditId: string) => {
    setLoginRole(user.role);
    setIsLoggingIn(true);
    window.setTimeout(() => {
      setUser(user);
      addAuditLog(auditAction, 'User', auditDetail, auditId);
      navigate('/');
    }, 1100);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const account = userAccounts.find((item) => item.username === trimmedUsername);

    if (account && await verifyPassword(password, account.passwordHash)) {
      completeLogin({
        id: account.id,
        username: account.username,
        name: account.name,
        role: account.role,
        createdAt: new Date(),
      }, 'Login', `${account.name} (${roleLabel(account.role)})`, account.id);
      return;
    }

    if (trimmedUsername === adminUsername && adminPassword && password === adminPassword) {
      const passwordHash = await hashPassword(password);
      setAdminCredentialsHash(adminUsername, passwordHash);
      completeLogin({
        id: 'admin',
        username: adminUsername,
        name: 'Administrator',
        role: 'admin',
        createdAt: new Date(),
      }, 'Login Legacy', 'Administrator', 'admin');
      return;
    }

    if (trimmedUsername === adminUsername && adminPasswordHash && await verifyPassword(password, adminPasswordHash)) {
      completeLogin({
        id: 'admin',
        username: adminUsername,
        name: 'Administrator',
        role: 'admin',
        createdAt: new Date(),
      }, 'Login', 'Administrator', 'admin');
    } else {
      setError('Username atau password salah');
    }
  };

  const handleGuestLogin = () => {
    if (!guestLoginEnabled) return;
    completeLogin({
      id: 'guest',
      username: 'guest',
      name: 'Guest',
      role: 'guest',
      createdAt: new Date(),
    }, 'Login Guest', 'Guest', 'guest');
  };

  const handleRecoveryReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adminRecoveryCodeHash) {
      toast.error('Kode pemulihan belum pernah dibuat. Reset password harus dilakukan dari Pengaturan saat admin masih login.');
      return;
    }
    if (username.trim() !== adminUsername) {
      toast.error('Username admin tidak sesuai.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast.error('Konfirmasi password baru tidak sama.');
      return;
    }
    setIsRecovering(true);
    try {
      const recoveryOk = await verifyPassword(recoveryCode.trim().toUpperCase(), adminRecoveryCodeHash);
      if (!recoveryOk) {
        toast.error('Kode pemulihan salah.');
        return;
      }
      setAdminCredentialsHash(adminUsername, await hashPassword(newPassword));
      addAuditLog('Reset Password Admin', 'User', 'Reset via kode pemulihan', 'admin');
      setPassword('');
      setRecoveryCode('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setShowRecovery(false);
      toast.success('Password admin berhasil direset. Silakan login dengan password baru.');
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <div className={`relative min-h-screen overflow-hidden bg-gradient-to-br ${visual.pageBg} p-4 transition-colors duration-700 sm:p-6 lg:p-10`}>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.20),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(255,214,179,0.18),transparent_30%)]' />
      <div className='pointer-events-none absolute inset-0 opacity-70'>
        <div className='absolute left-[12%] top-[16%] h-32 w-32 rounded-full border border-white/20 animate-[loginRoleOrbit_7s_linear_infinite]' />
        <div className='absolute bottom-[12%] right-[16%] h-44 w-44 rounded-full border border-white/15 animate-[loginRoleOrbit_9s_linear_infinite_reverse]' />
      </div>

      <div className='relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center justify-center sm:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-5rem)]'>
        <div className={`grid w-full overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/35 ring-1 ${visual.ring} transition-all duration-500 lg:min-h-[620px] lg:grid-cols-[0.42fr_0.58fr]`}>
          <section className='flex items-center justify-center bg-white px-6 py-10 sm:px-10 lg:px-14'>
            <div className='w-full max-w-sm'>
              <div className='mb-8 text-center'>
                <div className='login-logo-stage relative mx-auto mb-5 h-32 w-32'>
                  <div className='login-logo-halo absolute inset-2 rounded-full bg-white' />
                  <img src={churchLogoUrl} alt='GPM' className='login-logo-mark relative mx-auto h-28 w-28 translate-y-2' />
                </div>
                <h1 className='text-2xl font-bold leading-tight text-slate-950'>{appName}</h1>
                <p className='mt-1 text-sm text-slate-500'>{appSubtitle}</p>
              </div>

              <div className={`mb-5 flex items-start gap-3 rounded-md border p-3 transition-colors duration-500 ${visual.badge}`}>
                {hintedRole ? <RoleIcon className='mt-0.5 h-4 w-4 flex-shrink-0' /> : <AlertTriangle className='mt-0.5 h-4 w-4 flex-shrink-0' />}
                <div>
                  <p className='text-xs font-bold'>{hintedRole ? `Masuk sebagai ${visual.label}` : 'Gunakan akun sesuai role'}</p>
                  <p className='mt-0.5 text-xs opacity-85'>{hintedRole ? visual.caption : 'admin atau bendahara'}</p>
                </div>
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
                <div className='flex justify-end'>
                  <button
                    type='button'
                    className='text-xs font-semibold text-slate-500 underline-offset-2 hover:text-blue-700 hover:underline'
                    onClick={() => setShowRecovery(true)}
                  >
                    Lupa password admin?
                  </button>
                </div>
                <Button type='submit' className={`w-full transition-colors duration-500 ${visual.button}`} disabled={isLoggingIn}>
                  {isLoggingIn ? <CheckCircle2 className='mr-2 h-4 w-4 animate-pulse' /> : <RoleIcon className='mr-2 h-4 w-4' />}
                  {isLoggingIn ? `Membuka ${roleVisuals[loginRole || 'default'].label}...` : 'Masuk'}
                </Button>
                {guestLoginEnabled && (
                  <Button
                    type='button'
                    variant='outline'
                    className='w-full'
                    disabled={isLoggingIn}
                    onClick={handleGuestLogin}
                  >
                    <Eye className='mr-2 h-4 w-4' />
                    Masuk sebagai Guest
                  </Button>
                )}
              </form>

              <div className='mt-8 border-t border-slate-200 pt-4 text-center'>
                <p className='text-xs text-slate-500'>Aplikasi ini dibuat dengan bantuan AI</p>
                <p className='mt-1 text-xs text-slate-400'>v{appVersion} — Jondry Suitela</p>
              </div>
            </div>
          </section>

          {showRecovery && (
            <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4' onClick={() => setShowRecovery(false)}>
              <form
                className='w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl'
                onClick={(e) => e.stopPropagation()}
                onSubmit={handleRecoveryReset}
              >
                <div className='flex items-start justify-between gap-4'>
                  <div>
                    <h2 className='text-lg font-bold text-slate-950'>Reset Password Admin</h2>
                    <p className='mt-1 text-sm text-slate-500'>Masukkan kode pemulihan yang dibuat saat setup atau dari Pengaturan.</p>
                  </div>
                  <button type='button' className='rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700' onClick={() => setShowRecovery(false)}>
                    <X className='h-5 w-5' />
                  </button>
                </div>
                <div className='mt-5 space-y-4'>
                  <Input label='Username Admin' value={username} onChange={(e) => setUsername(e.target.value)} placeholder={adminUsername} required />
                  <Input label='Kode Pemulihan' value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())} placeholder='XXXX-XXXX-XXXX' required />
                  <Input label='Password Baru' type='password' value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  <Input label='Konfirmasi Password Baru' type='password' value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} required />
                </div>
                <div className='mt-6 flex justify-end gap-2'>
                  <Button type='button' variant='outline' onClick={() => setShowRecovery(false)}>Batal</Button>
                  <Button type='submit' disabled={isRecovering}>{isRecovering ? 'Memproses...' : 'Reset Password'}</Button>
                </div>
              </form>
            </div>
          )}

          <section className='relative hidden min-h-[460px] bg-slate-100 lg:block'>
            {loginBackgroundImage ? (
              <img
                src={loginBackgroundImage}
                alt='Background login'
                className='h-full w-full object-cover'
              />
            ) : (
              <div className='grid h-full place-items-center bg-slate-100'>
                <div className='text-center text-slate-500'>
                  <Building2 className='mx-auto mb-4 h-16 w-16 text-slate-400' />
                  <p className='text-sm font-semibold text-slate-700'>Background belum diatur</p>
                  <p className='mt-1 text-xs'>Admin dapat mengatur foto dari setup atau Pengaturan.</p>
                </div>
              </div>
            )}
            <div className='absolute inset-0 bg-gradient-to-br from-slate-950/45 via-slate-900/20 to-transparent' />
            <div className='absolute bottom-10 left-10 right-10 rounded-lg border border-white/20 bg-white/10 p-5 text-white backdrop-blur-md'>
              <div className='flex items-center gap-3'>
                <div className='grid h-11 w-11 place-items-center rounded-md bg-white/18'>
                  <RoleIcon className='h-6 w-6' />
                </div>
                <div>
                  <p className='text-sm font-semibold'>{visual.label}</p>
                  <p className='mt-1 text-xs text-white/75'>{visual.caption}</p>
                </div>
              </div>
            </div>
          </section>

          <section className='relative min-h-64 bg-slate-100 lg:hidden'>
            {loginBackgroundImage ? (
              <img
                src={loginBackgroundImage}
                alt='Background login'
                className='h-full w-full object-cover'
              />
            ) : (
              <div className='grid h-full place-items-center text-center text-slate-500'>
                <Building2 className='mx-auto mb-2 h-8 w-8' />
                <p className='text-xs'>Background belum diatur</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {isLoggingIn && (
        <div className='fixed inset-0 z-50 grid place-items-center bg-slate-950/70 backdrop-blur-sm'>
          <div className='relative flex h-64 w-64 flex-col items-center justify-center rounded-2xl border border-white/20 bg-white/95 text-center shadow-2xl'>
            <div className='absolute inset-6 rounded-full border border-slate-200 animate-[loginRoleRing_1.2s_ease-out_infinite]' />
            <div className={`grid h-20 w-20 place-items-center rounded-2xl text-white shadow-lg ${visual.button.replace('hover:bg-blue-800', '').replace('hover:bg-emerald-800', '').replace('hover:bg-violet-800', '').replace('hover:bg-purple-800', '')}`}>
              <RoleIcon className='h-10 w-10 animate-[loginRolePop_.7s_cubic-bezier(.2,.8,.2,1)_both]' />
            </div>
            <p className='mt-5 text-lg font-bold text-slate-950'>Masuk sebagai {roleVisuals[loginRole || 'default'].label}</p>
            <p className='mt-1 text-xs text-slate-500'>Menyiapkan akses dan data kerja</p>
          </div>
        </div>
      )}

      <style>{`
        .login-logo-stage {
          animation: loginLogoStageIn 700ms cubic-bezier(.2,.8,.2,1) both;
        }
        .login-logo-stage::before,
        .login-logo-stage::after {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 999px;
          border: 2px solid rgba(59,130,246,.34);
          pointer-events: none;
        }
        .login-logo-stage::before {
          animation: loginRoleRing 1.5s ease-out infinite;
        }
        .login-logo-stage::after {
          inset: -12px;
          border-color: rgba(14,165,233,.22);
          animation: loginRoleRing 1.9s ease-out infinite .25s;
        }
        .login-logo-halo {
          animation: loginLogoPulse 1.8s ease-in-out infinite;
          box-shadow: 0 18px 48px rgba(15, 23, 42, .18), inset 0 0 0 1px rgba(148, 163, 184, .22);
        }
        .login-logo-mark {
          filter: drop-shadow(0 14px 20px rgba(15,23,42,.24));
          animation: loginLogoEntrance 900ms cubic-bezier(.2,.8,.2,1) both, loginLogoFloat 2.1s ease-in-out 950ms infinite;
        }
        @keyframes loginLogoStageIn {
          from { opacity: 0; transform: translateY(10px) scale(.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes loginLogoEntrance {
          0% { opacity: 0; transform: translateY(18px) scale(.72) rotate(-8deg); }
          65% { opacity: 1; transform: translateY(0) scale(1.08) rotate(2deg); }
          100% { opacity: 1; transform: translateY(8px) scale(1) rotate(0deg); }
        }
        @keyframes loginLogoFloat {
          0%, 100% { transform: translateY(8px) scale(1); }
          50% { transform: translateY(-4px) scale(1.035); }
        }
        @keyframes loginLogoPulse {
          0%, 100% { transform: scale(.86); opacity: .55; }
          50% { transform: scale(1.16); opacity: .95; }
        }
        @keyframes loginRoleOrbit {
          from { transform: rotate(0deg) translateX(8px) rotate(0deg); }
          to { transform: rotate(360deg) translateX(8px) rotate(-360deg); }
        }
        @keyframes loginRoleRing {
          0% { transform: scale(.78); opacity: .75; }
          100% { transform: scale(1.18); opacity: 0; }
        }
        @keyframes loginRolePop {
          from { opacity: 0; transform: scale(.74) rotate(-8deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
