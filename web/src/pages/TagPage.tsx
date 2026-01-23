import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { tags, Post } from '../api';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PostList } from '../components/PostList';
import { usePagination } from '../hooks';

export function TagPage() {
  const { tag } = useParams<{ tag: string }>();

  const fetchPosts = useCallback(async (cursor?: number) => {
    const { posts, next_cursor } = await tags.get(tag!, cursor ? { before: cursor } : undefined);
    return { items: posts, next_cursor };
  }, [tag]);

  const {
    items: posts,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
  } = usePagination<Post>({ fetchFn: fetchPosts, key: tag });

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  return (
    <div>
      <PageHeader title={`#${tag}`} icon="hash" />
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
