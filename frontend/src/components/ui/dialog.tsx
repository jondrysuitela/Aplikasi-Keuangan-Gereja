import * as React from 'react';

interface DialogProps {
  open?: boolean;
  draggable?: boolean;
  placement?: 'center' | 'top';
  contentClassName?: string;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open, draggable = false, placement = 'center', contentClassName = '', onOpenChange, children }) => {
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const dragOffsetRef = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (!open) {
      setPosition(null);
      setDragging(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!dragging) return undefined;

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragOffsetRef.current) return;
      const nextX = event.clientX - dragOffsetRef.current.x;
      const nextY = event.clientY - dragOffsetRef.current.y;
      setPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      setDragging(false);
      dragOffsetRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const handleDialogMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onOpenChange?.(false);
      return;
    }
  };

  const handleContentMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!draggable) return;

    const handle = (event.target as HTMLElement).closest('[data-dialog-drag-handle]');
    if (!handle) return;

    const rect = event.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = placement === 'top'
      ? {
          x: event.clientX - (position?.x ?? rect.left),
          y: event.clientY - (position?.y ?? rect.top),
        }
      : {
          x: event.clientX - (position?.x ?? rect.left + rect.width / 2),
          y: event.clientY - (position?.y ?? rect.top + rect.height / 2),
        };
    setDragging(true);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] bg-black/50 px-4"
      onMouseDown={handleDialogMouseDown}
    >
      <div
        className={`fixed w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-xl dark:bg-slate-800 dark:border-slate-700 ${contentClassName}`}
        style={{
          top: position ? position.y : placement === 'top' ? '1.5rem' : '50%',
          left: position ? position.x : '50%',
          transform: position ? 'none' : placement === 'top' ? 'translateX(-50%)' : 'translate(-50%, -50%)',
          maxHeight: 'calc(100vh - 3rem)',
          overflow: 'auto',
        }}
        onMouseDown={handleContentMouseDown}
      >
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const DialogContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative">{children}</div>
);

const DialogHeader: React.FC<{ children: React.ReactNode; draggable?: boolean }> = ({ children, draggable = false }) => (
  <div
    className={`mb-4 ${draggable ? 'cursor-move select-none' : ''}`}
    data-dialog-drag-handle={draggable ? 'true' : undefined}
  >
    {children}
  </div>
);

const DialogFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-4 flex justify-end gap-2">{children}</div>
);

const DialogTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-lg font-semibold dark:text-white">{children}</h2>
);

const DialogDescription: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-gray-500 dark:text-slate-400">{children}</p>
);

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
