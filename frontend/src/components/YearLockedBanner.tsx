import { Lock } from 'lucide-react';

type YearLockedBannerProps = {
  tahun: number;
  detail?: string;
};

export function YearLockedBanner({ tahun, detail }: YearLockedBannerProps) {
  return (
    <div className='rounded-md border border-amber-200 bg-gradient-to-br from-white to-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm ring-1 ring-amber-100 dark:border-amber-900/60 dark:from-slate-900 dark:to-amber-950/35 dark:text-amber-200 dark:ring-amber-900/30'>
      <div className='flex items-start gap-3'>
        <span className='rounded-md bg-amber-100 p-2 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'>
          <Lock className='h-4 w-4 shrink-0' />
        </span>
        <div>
          <p className='font-semibold'>Tahun {tahun} sudah ditutup.</p>
          <p className='mt-0.5 text-xs text-amber-700 dark:text-amber-300'>
            {detail || 'Data hanya bisa dilihat. Buka kunci dari Pengaturan jika perlu revisi.'}
          </p>
        </div>
      </div>
    </div>
  );
}
