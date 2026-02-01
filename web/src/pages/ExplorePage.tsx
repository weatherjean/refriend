import { useCallback, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tags, Post } from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { SearchForm } from '../components/SearchForm';
import { PostList } from '../components/PostList';
import { useSearch, usePagination } from '../hooks';
import { useAuth } from '../context/AuthContext';

type TagItem = { name: string; count: number };
type TabType = 'trending' | 'feed' | 'bookmarked';

type TrendingPeriod = '48h' | 'alltime';

function TrendingTab({ bookmarkedNames, onToggleBookmark, isAuthed }: {
  bookmarkedNames: Set<string>;
  onToggleBookmark: (name: string, bookmarked: boolean) => void;
  isAuthed: boolean;
}) {
  const [period, setPeriod] = useState<TrendingPeriod>('48h');

  const initialFetch = useCallback(async () => {
    const { tags: result } = period === '48h'
      ? await tags.getTrending(30)
      : await tags.getPopular(30);
    return result;
  }, [period]);

  const searchFn = useCallback(async (query: string) => {
    const cleanQuery = query.replace(/^#/, '');
    const { tags: results } = await tags.search(cleanQuery);
    return results;
  }, []);

  const {
    query: tagInput,
    setQuery: setTagInput,
    displayItems: displayTags,
    loading,
    searchLoading,
    isSearching,
    search: handleSearch,
    clear: handleClear,
  } = useSearch<TagItem>({ initialFetch, searchFn, key: period });

  return (
    <>
      <SearchForm
        placeholder="Search tags..."
        value={tagInput}
        onChange={setTagInput}
        onSubmit={handleSearch}
        onClear={handleClear}
        loading={searchLoading}
        showClear={isSearching}
      />

      {!isSearching && (
        <div className="d-flex justify-content-end mb-3">
          <div className="btn-group btn-group-sm">
            <button
              className={`btn ${period === '48h' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setPeriod('48h')}
            >
              48h
            </button>
            <button
              className={`btn ${period === 'alltime' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setPeriod('alltime')}
            >
              All time
            </button>
          </div>
        </div>
      )}

      {isSearching && (
        <h5 className="mb-3">
          {`Results for "#${tagInput.trim().replace(/^#/, '')}"`}
        </h5>
      )}

      {loading && !isSearching ? (
        <LoadingSpinner size="sm" className="py-4" />
      ) : displayTags.length === 0 ? (
        <EmptyState
          icon="hash"
          title={isSearching ? `No tags found matching "#${tagInput.trim().replace(/^#/, '')}"` : 'No trending tags yet.'}
          description={isSearching ? undefined : 'Start posting with hashtags to see trends!'}
        />
      ) : (
        <div className="list-group">
          {displayTags.map((tag, index) => (
            <div
              key={tag.name}
              className="list-group-item d-flex justify-content-between align-items-center"
            >
              <Link
                to={`/tags/${encodeURIComponent(tag.name)}`}
                className="text-decoration-none flex-grow-1"
              >
                {!isSearching && <span className="text-muted me-2">{index + 1}</span>}
                <span className="fw-semibold">#{tag.name}</span>
              </Link>
              <div className="d-flex align-items-center gap-2">
                <span className="badge text-bg-secondary rounded-pill">
                  {tag.count} {tag.count === 1 ? 'post' : 'posts'}
                </span>
                {isAuthed && (
                  <button
                    className="btn btn-sm btn-link p-0 text-muted"
                    onClick={(e) => {
                      e.preventDefault();
                      onToggleBookmark(tag.name, bookmarkedNames.has(tag.name));
                    }}
                    title={bookmarkedNames.has(tag.name) ? 'Remove bookmark' : 'Bookmark tag'}
                  >
                    <i className={`bi ${bookmarkedNames.has(tag.name) ? 'bi-bookmark-fill' : 'bi-bookmark'}`}></i>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FeedTab() {
  const fetchPosts = useCallback(async (cursor?: number) => {
    const { posts, next_cursor } = await tags.getBookmarkFeed({ before: cursor });
    return { items: posts, next_cursor };
  }, []);

  const {
    items: posts,
    loading,
    loadingMore,
    hasMore,
    loadMore,
  } = usePagination<Post>({ fetchFn: fetchPosts });

  if (loading) {
    return <LoadingSpinner size="sm" className="py-4" />;
  }

  return (
    <PostList
      posts={posts}
      emptyIcon="bookmark"
      emptyTitle="No posts from bookmarked tags yet."
      emptyDescription="Bookmark some tags to see their posts here."
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}

function BookmarkedTab({ bookmarks, loading, onUnbookmark }: {
  bookmarks: TagItem[];
  loading: boolean;
  onUnbookmark: (name: string) => void;
}) {
  if (loading) {
    return <LoadingSpinner size="sm" className="py-4" />;
  }

  if (bookmarks.length === 0) {
    return (
      <EmptyState
        icon="bookmark"
        title="No bookmarked tags yet."
        description="Bookmark tags from the Trending tab or from tag pages."
      />
    );
  }

  return (
    <div className="list-group">
      {bookmarks.map((tag) => (
        <div
          key={tag.name}
          className="list-group-item d-flex justify-content-between align-items-center"
        >
          <Link
            to={`/tags/${encodeURIComponent(tag.name)}`}
            className="text-decoration-none flex-grow-1"
          >
            <span className="fw-semibold">#{tag.name}</span>
          </Link>
          <div className="d-flex align-items-center gap-2">
            <span className="badge text-bg-secondary rounded-pill">
              {tag.count} {tag.count === 1 ? 'post' : 'posts'}
            </span>
            <button
              className="btn btn-sm btn-link p-0 text-muted"
              onClick={() => onUnbookmark(tag.name)}
              title="Remove bookmark"
            >
              <i className="bi bi-bookmark-fill"></i>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExplorePage() {
  const { actor } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(actor ? 'feed' : 'trending');
  const [bookmarks, setBookmarks] = useState<TagItem[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [bookmarkedNames, setBookmarkedNames] = useState<Set<string>>(new Set());

  const loadBookmarks = useCallback(async () => {
    if (!actor) return;
    setBookmarksLoading(true);
    try {
      const { tags: bm } = await tags.getBookmarks();
      setBookmarks(bm);
      setBookmarkedNames(new Set(bm.map(t => t.name)));
    } catch {
      // handled by global error handler
    } finally {
      setBookmarksLoading(false);
    }
  }, [actor]);

  useEffect(() => {
    if (actor) {
      loadBookmarks();
    }
  }, [actor, loadBookmarks]);

  const handleToggleBookmark = useCallback(async (name: string, isBookmarked: boolean) => {
    try {
      if (isBookmarked) {
        await tags.unbookmark(name);
        setBookmarks(prev => prev.filter(t => t.name !== name));
        setBookmarkedNames(prev => { const next = new Set(prev); next.delete(name); return next; });
      } else {
        await tags.bookmark(name);
        setBookmarkedNames(prev => new Set(prev).add(name));
        // Reload bookmarks to get updated counts
        loadBookmarks();
      }
    } catch {
      // handled by global error handler
    }
  }, [loadBookmarks]);

  const handleUnbookmark = useCallback(async (name: string) => {
    try {
      await tags.unbookmark(name);
      setBookmarks(prev => prev.filter(t => t.name !== name));
      setBookmarkedNames(prev => { const next = new Set(prev); next.delete(name); return next; });
    } catch {
      // handled by global error handler
    }
  }, []);

  const tabItems: { key: TabType; label: string; show: boolean }[] = [
    { key: 'feed', label: 'Feed', show: !!actor },
    { key: 'trending', label: 'Trending', show: true },
    { key: 'bookmarked', label: 'Bookmarked', show: !!actor },
  ];

  return (
    <div>
      <PageHeader title="Tags" icon="hash" />

      <ul className="nav nav-tabs mb-3">
        {tabItems.filter(t => t.show).map(tab => (
          <li key={tab.key} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {activeTab === 'trending' && (
        <TrendingTab
          bookmarkedNames={bookmarkedNames}
          onToggleBookmark={handleToggleBookmark}
          isAuthed={!!actor}
        />
      )}
      {activeTab === 'feed' && actor && <FeedTab />}
      {activeTab === 'bookmarked' && actor && (
        <BookmarkedTab
          bookmarks={bookmarks}
          loading={bookmarksLoading}
          onUnbookmark={handleUnbookmark}
        />
      )}
    </div>
  );
}
