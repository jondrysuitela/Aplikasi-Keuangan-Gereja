import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/stores';
import { pendingCount } from '@/lib/syncOutbox';

export function SyncStatusBadge() {
  const user = useStore((s) => s.user);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState(() => pendingCount());
  const [syncing, setSyncing] = useState(false);


  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPending(pendingCount());
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  // syncing indicator: read from store if exists later; for now keep false.
  useEffect(() => {
    // placeholder: actual syncing state handled in syncWorker lock.
    // We keep it simple here.
  }, []);

  const label = useMemo(() => {
    if (!user) return 'Offline';
    if (!online) return 'Offline';
    if (pending > 0) return syncing ? 'Menyinkronkan...' : `Online • ${pending} pending`;
    return 'Online • Semua data tersinkron';
  }, [online, pending, syncing, user]);

  if (!user) return null;

  const colorClass = !online
    ? 'bg-red-100 text-red-700 border-red-200'
    : pending > 0
      ? 'bg-blue-100 text-blue-700 border-blue-200'
      : 'bg-emerald-100 text-emerald-700 border-emerald-200';

  return (
    <div className={`ml-auto ${colorClass} border px-3 py-1.5 rounded-full text-xs font-medium`}>
      {label}
    </div>
  );
}

