import { useState, useEffect, useCallback } from 'react';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { useAuth } from '../context/AuthContext';

export function HomePage() {
  const { user } = useAuth();
  const [postList, setPostList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const timeline = user ? 'home' : 'public';

  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true);
      try {
        const { posts, next_cursor } = await postsApi.getTimeline(timeline);
        setPostList(posts);
        setNextCursor(next_cursor);
      } catch (err) {
        console.error('Failed to load posts:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPosts();
  }, [timeline]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { posts, next_cursor } = await postsApi.getTimeline(timeline, { before: nextCursor });
      setPostList(prev => [...prev, ...posts]);
      setNextCursor(next_cursor);
    } catch (err) {
      console.error('Failed to load more posts:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [timeline, nextCursor, loadingMore]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <h4 className="mb-4">
        {user ? 'Home Feed' : 'Public Timeline'}
      </h4>

      {postList.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={user ? 'No posts yet.' : 'No posts yet.'}
          description={user ? 'Follow some users to see posts here.' : 'Be the first to post!'}
        />
      ) : (
        <>
          {postList.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {nextCursor && (
            <LoadMoreButton loading={loadingMore} onClick={loadMore} />
          )}
        </>
      )}
    </div>
  );
}
