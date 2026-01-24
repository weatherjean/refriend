import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { tags, Post } from '../api';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PostList } from '../components/PostList';
import { SortToggle } from '../components/SortToggle';
import { usePagination } from '../hooks';

export function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  const [sort, setSort] = useState<'new' | 'hot'>('new');

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
      <PageHeader title={`#${tag}`} />
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
