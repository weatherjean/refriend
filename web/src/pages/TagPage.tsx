import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { tags, Post } from '../api';
import { PostCard } from '../components/PostCard';

export function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  const [postList, setPostList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setPostList([]);
      setNextCursor(null);
      try {
        const { posts, next_cursor } = await tags.get(tag!);
        setPostList(posts);
        setNextCursor(next_cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load posts');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tag]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { posts, next_cursor } = await tags.get(tag!, { before: nextCursor });
      setPostList(prev => [...prev, ...posts]);
      setNextCursor(next_cursor);
    } catch (err) {
      console.error('Failed to load more posts:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [tag, nextCursor, loadingMore]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">{error}</div>
    );
  }

  return (
    <div>
      <h4 className="mb-4">#{tag}</h4>

      {postList.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-hash fs-1 mb-3 d-block"></i>
          <p>No posts with this hashtag yet.</p>
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
