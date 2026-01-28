import { useCallback } from 'react';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { usePagination } from '../hooks';

export function HotPage() {
  const fetchPosts = useCallback(async (cursor?: number) => {
    const { posts, next_cursor } = await postsApi.getHot(cursor ? { offset: cursor, limit: 20 } : { limit: 20 });
    return { items: posts, next_cursor };
  }, []);

  const {
    items: postList,
    loading,
    loadingMore,
    hasMore,
    loadMore,
  } = usePagination<Post>({ fetchFn: fetchPosts, key: 'hot-page' });

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <h4 className="mb-4">
        <i className="bi bi-fire text-danger me-2"></i>
        Hot Posts
      </h4>

      {postList.length === 0 ? (
        <EmptyState icon="fire" title="No hot posts yet." description="Start interacting with posts!" />
      ) : (
        <>
          {postList.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMore && (
            <LoadMoreButton loading={loadingMore} onClick={loadMore} />
          )}
        </>
      )}
    </div>
  );
}
