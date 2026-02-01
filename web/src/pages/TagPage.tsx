import { useCallback, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { tags, Post } from '../api';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PostList } from '../components/PostList';
import { SortToggle } from '../components/SortToggle';
import { usePagination } from '../hooks';
import { useAuth } from '../context/AuthContext';

export function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  const { actor } = useAuth();
  const [sort, setSort] = useState<'new' | 'hot'>('new');
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  useEffect(() => {
    if (!actor || !tag) return;
    let cancelled = false;
    tags.isBookmarked(tag).then(({ bookmarked }) => {
      if (!cancelled) setBookmarked(bookmarked);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [actor, tag]);

  const handleToggleBookmark = useCallback(async () => {
    if (!tag || bookmarkLoading) return;
    setBookmarkLoading(true);
    try {
      if (bookmarked) {
        await tags.unbookmark(tag);
        setBookmarked(false);
      } else {
        await tags.bookmark(tag);
        setBookmarked(true);
      }
    } catch {
      // handled by global error handler
    } finally {
      setBookmarkLoading(false);
    }
  }, [tag, bookmarked, bookmarkLoading]);

  const fetchPosts = useCallback(async (cursor?: number) => {
    const { posts, next_cursor } = await tags.get(tag!, { before: cursor, sort });
    return { items: posts, next_cursor };
  }, [tag, sort]);

  const {
    items: posts,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  } = usePagination<Post>({ fetchFn: fetchPosts, key: `${tag}-${sort}` });

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  return (
    <div>
      <PageHeader
        title={`#${tag}`}
        actions={actor ? (
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={handleToggleBookmark}
            disabled={bookmarkLoading}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark this tag'}
          >
            <i className={`bi ${bookmarked ? 'bi-bookmark-fill' : 'bi-bookmark'}`}></i>
          </button>
        ) : undefined}
      />
      {posts.length > 0 && (
        <div className="d-flex justify-content-end mb-3">
          <SortToggle value={sort} onChange={setSort} />
        </div>
      )}
      <PostList
        posts={posts}
        emptyIcon="hash"
        emptyTitle="No posts with this hashtag yet."
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
