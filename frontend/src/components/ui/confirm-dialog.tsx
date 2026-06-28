import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';

type ConfirmTone = 'default' | 'danger' | 'warning';

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
};

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((nextOptions: ConfirmOptions) => {
    setOptions(nextOptions);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const resolve = (value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  };

  const tone = options?.tone || 'default';
  const Icon = tone === 'danger' || tone === 'warning' ? AlertTriangle : Info;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={Boolean(options)} onOpenChange={(open) => { if (!open) resolve(false); }}>
        <DialogContent>
          <DialogHeader>
            <div className='flex items-start gap-3'>
              <div className={
                tone === 'danger'
                  ? 'rounded-md bg-red-50 p-2 text-red-600 dark:bg-red-950/40 dark:text-red-300'
                  : tone === 'warning'
                    ? 'rounded-md bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'rounded-md bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
              }>
                <Icon className='h-5 w-5' />
              </div>
              <div>
                <DialogTitle>{options?.title || 'Konfirmasi'}</DialogTitle>
                {options?.description && (
                  <DialogDescription>{options.description}</DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => resolve(false)}>
              {options?.cancelText || 'Batal'}
            </Button>
            <Button variant={tone === 'danger' ? 'destructive' : 'default'} onClick={() => resolve(true)}>
              {options?.confirmText || 'Lanjutkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used inside ConfirmProvider');
  }
  return confirm;
}
