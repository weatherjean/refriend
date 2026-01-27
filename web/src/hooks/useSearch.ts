import { useState, useEffect, useCallback } from 'react';

interface UseSearchOptions<T> {
  initialFetch?: () => Promise<T[]>;
  searchFn: (query: string) => Promise<T[]>;
}

interface UseSearchResult<T> {
  query: string;
  setQuery: (query: string) => void;
  displayItems: T[];
  loading: boolean;
  searchLoading: boolean;
  isSearching: boolean;
  search: () => Promise<void>;
  clear: () => void;
}

export function useSearch<T>(options: UseSearchOptions<T>): UseSearchResult<T> {
  const { initialFetch, searchFn } = options;
  const [query, setQuery] = useState('');
  const [initialItems, setInitialItems] = useState<T[]>([]);
  const [searchResults, setSearchResults] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(!!initialFetch);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (!initialFetch) return;

    let cancelled = false;
    const load = async () => {
      try {
        const items = await initialFetch();
        if (!cancelled) setInitialItems(items);
      } catch {
        // Error handled by global toast
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [initialFetch]);

  const search = useCallback(async () => {
    let trimmed = query.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }

    // Convert Lemmy community syntax (!community@instance) to ActivityPub (@community@instance)
    if (trimmed.startsWith('!') && trimmed.includes('@')) {
      trimmed = '@' + trimmed.slice(1);
    }

    setSearchLoading(true);
    try {
      const results = await searchFn(trimmed);
      setSearchResults(results);
    } catch {
      // Error handled by global toast
    } finally {
      setSearchLoading(false);
    }
  }, [query, searchFn]);

  const clear = useCallback(() => {
    setQuery('');
    setSearchResults(null);
  }, []);

  const displayItems = searchResults !== null ? searchResults : initialItems;
  const isSearching = searchResults !== null;

  return {
    query,
    setQuery,
    displayItems,
    loading,
    searchLoading,
    isSearching,
    search,
    clear,
  };
}
