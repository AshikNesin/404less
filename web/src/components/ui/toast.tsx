// Toast — non-blocking feedback. Renders bottom-right; auto-dismisses.
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };
const ToastCtx = createContext<(kind: Toast['kind'], message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-card px-3.5 py-2.5 text-[0.8125rem] shadow-lg',
              t.kind === 'success' && 'border-success/30',
              t.kind === 'error' && 'border-destructive/30',
              t.kind === 'info' && 'border-border',
            )}
          >
            {t.kind === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
            {t.kind === 'error' && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />}
            {t.kind === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 break-words">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
