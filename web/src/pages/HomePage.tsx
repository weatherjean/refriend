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
    if (isHotFeed) {
      const { posts } = await postsApi.getHot(30);
      return { items: posts, next_cursor: null };
    }
    const timeline = user ? 'home' : 'public';
    const { posts, next_cursor } = await postsApi.getTimeline(timeline, cursor ? { before: cursor } : undefined);
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
    if (!user) return 'Public Timeline';
    return isHotFeed ? 'Hot' : 'New';
  };

  const getIcon = () => {
    if (!user) return 'globe';
    return isHotFeed ? 'fire' : 'clock-fill';
  };

  const getEmptyDescription = () => {
    if (!user) return 'Be the first to post!';
    return isHotFeed ? 'No hot posts right now.' : 'Follow some users to see posts here.';
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
