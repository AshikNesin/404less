// Toast — non-blocking feedback. Renders bottom-right; auto-dismisses.
import { createContext, useCallback, useContext, useState } from 'react';
import { CircleCheck, TriangleAlert, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };
const ToastCtx = createContext<(kind: Toast['kind'], message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-fade-up pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-popover px-3.5 py-2.5 text-[0.8125rem] text-popover-foreground shadow-lg',
            )}
          >
            {t.kind === 'success' && <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />}
            {t.kind === 'error' && <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
            {t.kind === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-info" />}
            <span className="min-w-0 flex-1 break-words">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
