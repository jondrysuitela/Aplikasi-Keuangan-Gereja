import type { ReactNode } from 'react';
import { AlertTriangle, Ban, Database, FileSearch, Lock, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AppStateTone = 'empty' | 'search' | 'error' | 'locked' | 'access';

type AppStateMessageProps = {
  tone?: AppStateTone;
  title: string;
  detail?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  compact?: boolean;
};

const toneIcon: Record<AppStateTone, ReactNode> = {
  empty: <Database className='h-5 w-5' />,
  search: <SearchX className='h-5 w-5' />,
  error: <AlertTriangle className='h-5 w-5' />,
  locked: <Lock className='h-5 w-5' />,
  access: <Ban className='h-5 w-5' />,
};

const toneClass: Record<AppStateTone, string> = {
  empty: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  search: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900/60',
  error: 'bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900/60',
  locked: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900/60',
  access: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900/60',
};

export function AppStateMessage({
  tone = 'empty',
  title,
  detail,
  icon,
  actionLabel,
  onAction,
  className,
  compact = false,
}: AppStateMessageProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 text-center shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-800',
        compact ? 'min-h-28 py-5' : 'min-h-40 py-8',
        className,
      )}
    >
      <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-md', toneClass[tone])}>
        {icon || toneIcon[tone] || <FileSearch className='h-5 w-5' />}
      </div>
      <p className='font-semibold text-slate-900 dark:text-white'>{title}</p>
      {detail && <p className='mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400'>{detail}</p>}
      {actionLabel && onAction && (
        <Button variant='outline' size='sm' className='mt-4' onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
