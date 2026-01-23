import { useState, useCallback, useRef, useEffect } from 'react';

export interface UsePaginationOptions<T> {
  fetchFn: (cursor?: number) => Promise<{ items: T[]; next_cursor: number | null }>;
  initialItems?: T[];
  autoLoad?: boolean;
  key?: string | number; // Change this to trigger a reload
}

export interface UsePaginationResult<T> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  reset: () => void;
  refresh: () => Promise<void>;
}

export function usePagination<T>({
  fetchFn,
  initialItems = [],
  autoLoad = true,
  key,
}: UsePaginationOptions<T>): UsePaginationResult<T> {
  const [items, setItems] = useState<T[]>(initialItems);
  const [loading, setLoading] = useState(autoLoad);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the current fetchFn to handle deps changes
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setItems([]);
    setNextCursor(null);
    try {
      const { items: newItems, next_cursor } = await fetchFnRef.current();
      setItems(newItems);
      setNextCursor(next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items: newItems, next_cursor } = await fetchFnRef.current(nextCursor);
      setItems(prev => [...prev, ...newItems]);
      setNextCursor(next_cursor);
    } catch {
      // Error handled by global toast
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  const reset = useCallback(() => {
    setItems([]);
    setNextCursor(null);
    setError(null);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  // Auto-load on mount or when key changes
  useEffect(() => {
    if (autoLoad) {
      load();
    }
  }, [autoLoad, load, key]);

  return {
    items,
    setItems,
    loading,
    loadingMore,
    hasMore: nextCursor !== null,
    error,
    loadMore,
    reset,
    refresh,
  };
}
