import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/stores';
import { hashPassword, verifyPassword } from '@/lib/password';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Input } from './input';

type AdminConfirmTone = 'default' | 'danger' | 'warning';

type AdminConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: AdminConfirmTone;
};

type AdminConfirmContextValue = (options: AdminConfirmOptions) => Promise<boolean>;

const AdminConfirmContext = createContext<AdminConfirmContextValue | null>(null);

export function AdminConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<AdminConfirmOptions | null>(null);
  const [password, setPassword] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const { adminUsername, adminPassword, adminPasswordHash, setAdminCredentialsHash } = useStore();

  const adminConfirm = useCallback((nextOptions: AdminConfirmOptions) => {
    setPassword('');
    setOptions(nextOptions);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const resolve = (value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPassword('');
    setIsChecking(false);
    setOptions(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      toast.error('Masukkan password admin dulu.');
      return;
    }

    setIsChecking(true);
    try {
      let verified = false;
      if (adminPasswordHash) {
        verified = await verifyPassword(trimmedPassword, adminPasswordHash);
      }
      if (!verified && adminPassword && trimmedPassword === adminPassword) {
        verified = true;
        setAdminCredentialsHash(adminUsername || 'admin', await hashPassword(trimmedPassword));
      }

      if (!verified) {
        toast.error('Password admin tidak sesuai.');
        setIsChecking(false);
        return;
      }

      resolve(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal memverifikasi password admin.');
      setIsChecking(false);
    }
  };

  const tone = options?.tone || 'default';

  return (
    <AdminConfirmContext.Provider value={adminConfirm}>
      {children}
      <Dialog open={Boolean(options)} onOpenChange={(open) => { if (!open && !isChecking) resolve(false); }}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <div className='flex items-start gap-3'>
                <div className={
                  tone === 'danger'
                    ? 'rounded-md bg-red-50 p-2 text-red-600 dark:bg-red-950/40 dark:text-red-300'
                    : tone === 'warning'
                      ? 'rounded-md bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'rounded-md bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
                }>
                  <ShieldCheck className='h-5 w-5' />
                </div>
                <div>
                  <DialogTitle>{options?.title || 'Verifikasi Admin'}</DialogTitle>
                  <DialogDescription>
                    {options?.description || 'Masukkan password admin untuk melanjutkan aksi berisiko ini.'}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className='py-4'>
              <Input
                autoFocus
                type='password'
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder='Password admin'
                disabled={isChecking}
              />
            </div>
            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => resolve(false)} disabled={isChecking}>
                {options?.cancelText || 'Batal'}
              </Button>
              <Button type='submit' variant={tone === 'danger' ? 'destructive' : 'default'} disabled={isChecking}>
                {isChecking ? 'Memeriksa...' : options?.confirmText || 'Verifikasi'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminConfirmContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminConfirm() {
  const adminConfirm = useContext(AdminConfirmContext);
  if (!adminConfirm) {
    throw new Error('useAdminConfirm must be used inside AdminConfirmProvider');
  }
  return adminConfirm;
}
