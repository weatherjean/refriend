import { useState, useEffect, useCallback } from 'react';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
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
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-4">
        {user ? 'Home Feed' : 'Public Timeline'}
      </h4>

      {postList.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-inbox fs-1 mb-3 d-block"></i>
          {user ? (
            <p>No posts yet. Follow some users to see posts here.</p>
          ) : (
            <p>No posts yet. Be the first to post!</p>
          )}
        </div>
      ) : (
        <>
          {postList.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {nextCursor && (
            <div className="text-center py-3">
              <button
                className="btn btn-outline-primary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <><span className="spinner-border spinner-border-sm me-1"></span> Loading...</>
                ) : (
                  'Load More'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
