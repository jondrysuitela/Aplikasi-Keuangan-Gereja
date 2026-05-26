import * as React from 'react';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState, useCallback } from 'react';

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  draggable?: boolean;
}

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children, draggable = false }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, origLeft: 0, origTop: 0 });
  const [panelRect, setPanelRect] = useState<{ left: number; top: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPanelRect({
        left: dragStart.current.origLeft + dx,
        top: dragStart.current.origTop + dy,
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        if (panelRef.current) {
          const rect = panelRef.current.getBoundingClientRect();
          setPanelRect({ left: rect.left, top: rect.top });
        }
      });
    } else {
      setPanelRect(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      style={{ pointerEvents: 'auto' }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-xl dark:bg-slate-800 dark:border-slate-700 transition-shadow"
        style={{
          pointerEvents: 'auto',
          ...(isDragging && panelRect
            ? { position: 'fixed', left: panelRect.left, top: panelRect.top, margin: 0 }
            : {}),
        }}
      >
        {draggable && (
          <div
            className="h-6 flex cursor-grab items-center justify-center active:cursor-grabbing"
            onMouseDown={handleMouseDown}
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const DialogContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className='relative'>{children}</div>
);

const DialogHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className='mb-4'>{children}</div>
);

const DialogFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className='mt-4 flex justify-end gap-2'>{children}</div>
);

const DialogTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className='text-lg font-semibold dark:text-white'>{children}</h2>
);

const DialogDescription: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className='text-sm text-gray-500 dark:text-slate-400'>{children}</p>
);

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
