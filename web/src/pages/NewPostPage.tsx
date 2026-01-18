import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { posts } from '../api';
import { useAuth } from '../context/AuthContext';

export function NewPostPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user) {
    return (
      <div className="alert alert-warning">
        You must be logged in to create a post.
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { post } = await posts.create(content);
      navigate(`/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto" style={{ maxWidth: 600 }}>
      <h3 className="mb-4">New Post</h3>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">Content</label>
          <textarea
            className="form-control"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            required
          />
          <div className="form-text">Use #hashtags to categorize your post</div>
        </div>

        <button type="submit" className="btn btn-primary w-100" disabled={loading}>
          {loading ? 'Posting...' : 'Post'}
        </button>
      </form>
    </div>
  );
}
