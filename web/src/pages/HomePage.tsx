import { useState, useCallback } from 'react';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { useAuth } from '../context/AuthContext';
import { useFeed } from '../context/FeedContext';
import { usePagination } from '../hooks';

export function HomePage() {
  const { user } = useAuth();
  const { feedType } = useFeed();
  const [refreshing, setRefreshing] = useState(false);

  // For logged-in users, use the toggle; for guests, show public timeline
  const isHotFeed = user && feedType === 'hot';

  const fetchPosts = useCallback(async (cursor?: number) => {
    if (!user) {
      // Not logged in - return empty (will show login prompt)
      return { items: [], next_cursor: null };
    }
    if (isHotFeed) {
      const { posts } = await postsApi.getHot(30);
      return { items: posts, next_cursor: null };
    }
    const { posts, next_cursor } = await postsApi.getTimeline(cursor ? { before: cursor } : undefined);
    return { items: posts, next_cursor };
  }, [user, isHotFeed]);

  const {
    items: posts,
    loading,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
  } = usePagination<Post>({ fetchFn: fetchPosts, key: `${user?.id ?? 'guest'}-${feedType}` });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const getTitle = () => {
    if (!user) return 'Welcome';
    return isHotFeed ? 'Hot' : 'New';
  };

  const getIcon = () => {
    if (!user) return 'house';
    return isHotFeed ? 'fire' : 'clock-fill';
  };

  const getEmptyDescription = () => {
    if (!user) return 'Sign in to see your timeline.';
    return isHotFeed ? 'No hot posts right now.' : 'Follow some users or join communities to see posts here.';
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        title={getTitle()}
        icon={getIcon()}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {posts.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No posts yet."
          description={getEmptyDescription()}
        />
      ) : (
        <>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMore && !isHotFeed && (
            <LoadMoreButton loading={loadingMore} onClick={loadMore} />
          )}
        </>
      )}
    </div>
  );
}
