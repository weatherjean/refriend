import { useState, useEffect, useCallback } from 'react';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { useAuth } from '../context/AuthContext';
import { useFeed } from '../context/FeedContext';

export function HomePage() {
  const { user } = useAuth();
  const { feedType } = useFeed();
  const [postList, setPostList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  // For logged-in users, use the toggle; for guests, show public timeline
  const isHotFeed = user && feedType === 'hot';

  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true);
      setPostList([]);
      setNextCursor(null);
      try {
        if (isHotFeed) {
          const { posts } = await postsApi.getHot(30);
          setPostList(posts);
          // Hot feed doesn't have pagination currently
        } else {
          const timeline = user ? 'home' : 'public';
          const { posts, next_cursor } = await postsApi.getTimeline(timeline);
          setPostList(posts);
          setNextCursor(next_cursor);
        }
      } catch (err) {
        console.error('Failed to load posts:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPosts();
  }, [user, isHotFeed]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || isHotFeed) return;
    setLoadingMore(true);
    try {
      const timeline = user ? 'home' : 'public';
      const { posts, next_cursor } = await postsApi.getTimeline(timeline, { before: nextCursor });
      setPostList(prev => [...prev, ...posts]);
      setNextCursor(next_cursor);
    } catch (err) {
      console.error('Failed to load more posts:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [user, nextCursor, loadingMore, isHotFeed]);

  if (loading) {
    return <LoadingSpinner />;
  }

  const getTitle = () => {
    if (!user) return 'Public Timeline';
    return isHotFeed ? 'Hot' : 'New';
  };

  const getEmptyDescription = () => {
    if (!user) return 'Be the first to post!';
    return isHotFeed ? 'No hot posts right now.' : 'Follow some users to see posts here.';
  };

  return (
    <div>
      <h4 className="mb-4">{getTitle()}</h4>

      {postList.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No posts yet."
          description={getEmptyDescription()}
        />
      ) : (
        <>
          {postList.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {nextCursor && !isHotFeed && (
            <LoadMoreButton loading={loadingMore} onClick={loadMore} />
          )}
        </>
      )}
    </div>
  );
}
