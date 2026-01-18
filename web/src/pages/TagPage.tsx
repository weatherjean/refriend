import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { tags, Post } from '../api';
import { PostCard } from '../components/PostCard';

export function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  const [postList, setPostList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { posts } = await tags.get(tag!);
        setPostList(posts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load posts');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tag]);

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
        postList.map((post) => (
          <PostCard key={post.id} post={post} />
        ))
      )}
    </div>
  );
}
