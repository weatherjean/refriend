import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';

interface ScrollLockContextValue {
  lockScroll: (id: string) => void;
  unlockScroll: (id: string) => void;
  isLocked: boolean;
  activeLocks: string[];
  forceUnlockAll: () => void;
}

const ScrollLockContext = createContext<ScrollLockContextValue | null>(null);

export function ScrollLockProvider({ children }: { children: ReactNode }) {
  const locksRef = useRef<Set<string>>(new Set());
  const [activeLocks, setActiveLocks] = useState<string[]>([]);
  const escapeCountRef = useRef(0);
  const escapeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const updateBodyScroll = useCallback(() => {
    if (locksRef.current.size > 0) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    setActiveLocks([...locksRef.current]);
  }, []);

  const lockScroll = useCallback((id: string) => {
    locksRef.current.add(id);
    updateBodyScroll();
  }, [updateBodyScroll]);

  const unlockScroll = useCallback((id: string) => {
    locksRef.current.delete(id);
    updateBodyScroll();
  }, [updateBodyScroll]);

  const forceUnlockAll = useCallback(() => {
    locksRef.current.clear();
    updateBodyScroll();
    console.debug('[ScrollLock] Force unlocked all locks');
  }, [updateBodyScroll]);

  // Triple-Escape emergency unlock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && locksRef.current.size > 0) {
        escapeCountRef.current++;

        clearTimeout(escapeTimeoutRef.current);
        escapeTimeoutRef.current = setTimeout(() => {
          escapeCountRef.current = 0;
        }, 500);

        if (escapeCountRef.current >= 3) {
          forceUnlockAll();
          escapeCountRef.current = 0;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(escapeTimeoutRef.current);
    };
  }, [forceUnlockAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <ScrollLockContext.Provider value={{
      lockScroll,
      unlockScroll,
      isLocked: activeLocks.length > 0,
      activeLocks,
      forceUnlockAll,
    }}>
      {children}
    </ScrollLockContext.Provider>
  );
}

export function useScrollLock() {
  const context = useContext(ScrollLockContext);
  if (!context) {
    throw new Error('useScrollLock must be used within ScrollLockProvider');
  }
  return context;
}

/**
 * Convenience hook that auto-locks/unlocks based on a boolean.
 * Automatically cleans up on unmount.
 */
export function useScrollLockEffect(id: string, shouldLock: boolean) {
  const { lockScroll, unlockScroll } = useScrollLock();

  useEffect(() => {
    if (shouldLock) {
      lockScroll(id);
    } else {
      unlockScroll(id);
    }
    return () => unlockScroll(id);
  }, [id, shouldLock, lockScroll, unlockScroll]);
}
