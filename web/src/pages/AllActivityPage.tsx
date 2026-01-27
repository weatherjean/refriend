import { useCallback } from 'react';
import { posts, Post } from '../api';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PostList } from '../components/PostList';
import { usePagination } from '../hooks';

export function AllActivityPage() {
  const fetchPosts = useCallback(async (cursor?: number) => {
    const { posts: items, next_cursor } = await posts.getAll({ before: cursor, limit: 20 });
    return { items, next_cursor };
  }, []);

  const {
    items: allPosts,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  } = usePagination<Post>({ fetchFn: fetchPosts, key: 'all-activity' });

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  return (
    <div>
      <PageHeader title="All Activity" />
      <p className="text-muted small mb-3">
        All posts ordered by newest first. For troubleshooting purposes.
      </p>
      <PostList
        posts={allPosts}
        emptyIcon="inbox"
        emptyTitle="No posts yet."
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
