import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

interface Toast {
  id: number;
  message: string;
  link?: { to: string; label: string };
}

const ToastContext = createContext<(message: string, link?: Toast['link']) => void>(() => {});

/** Brief notifications, e.g. "BookLeaf replied to your ticket". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, link?: Toast['link']) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, message, link }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 6000);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
            <p>{toast.message}</p>
            {toast.link && (
              <Link to={toast.link.to} className="mt-1 inline-block font-medium text-brand-200 hover:underline">
                {toast.link.label} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
