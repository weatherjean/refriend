import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { setGlobalErrorHandler } from '../api';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface ToastContextType {
  toasts: Toast[];
  toast: {
    success: (message: string) => void;
    error: (message: string | Error) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
  };
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const MAX_TOASTS = 5;
const DEFAULT_DISMISS_MS = 5000;
const ERROR_DISMISS_MS = 8000;
const MAX_MESSAGE_LENGTH = 200;

function formatErrorMessage(message: string | Error): string {
  const text = message instanceof Error ? message.message : message;
  // Strip stack traces (common patterns)
  const withoutStack = text.split(/\n\s*at\s/)[0].trim();
  // Truncate if too long
  if (withoutStack.length > MAX_MESSAGE_LENGTH) {
    return withoutStack.slice(0, MAX_MESSAGE_LENGTH) + '...';
  }
  return withoutStack;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: Toast['type'], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const dismissMs = type === 'error' ? ERROR_DISMISS_MS : DEFAULT_DISMISS_MS;

      setToasts((prev) => {
        const next = [...prev, { id, type, message }];
        // Keep only the most recent MAX_TOASTS (FIFO)
        return next.slice(-MAX_TOASTS);
      });

      setTimeout(() => dismiss(id), dismissMs);
    },
    [dismiss]
  );

  const showError = useCallback(
    (message: string | Error) => addToast('error', formatErrorMessage(message)),
    [addToast]
  );

  const toast = {
    success: useCallback((message: string) => addToast('success', message), [addToast]),
    error: showError,
    info: useCallback((message: string) => addToast('info', message), [addToast]),
    warning: useCallback((message: string) => addToast('warning', message), [addToast]),
  };

  // Register global error handler for API errors
  useEffect(() => {
    setGlobalErrorHandler(showError);
    return () => setGlobalErrorHandler(null);
  }, [showError]);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
