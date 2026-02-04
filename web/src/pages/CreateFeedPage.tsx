import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { feeds as feedsApi } from '../api';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function CreateFeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user) {
    return <p className="text-muted">Please log in to create a feed.</p>;
  }

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setLoading(true);
    setError('');
    try {
      const { feed } = await feedsApi.create({
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
      });
      navigate(`/feeds/${feed.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Create Feed" icon="plus-circle" subtitle="Create a new curated feed." />

      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger py-2">{error}</div>}

        <div className="mb-3">
          <label className="form-label fw-semibold">Name</label>
          <input
            type="text"
            className="form-control"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            maxLength={100}
            placeholder="My Feed"
            disabled={loading}
          />
          <div className="d-flex justify-content-end mt-1">
            <small className="text-muted">{100 - name.length}</small>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">Slug</label>
          <div className="input-group">
            <span className="input-group-text">/feeds/</span>
            <input
              type="text"
              className="form-control"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
                setSlugManuallyEdited(true);
              }}
              maxLength={60}
              placeholder="my-feed"
              disabled={loading}
            />
          </div>
          <small className="text-muted">Lowercase letters, numbers, hyphens, underscores only.</small>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">Description (optional)</label>
          <textarea
            className="form-control"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="What is this feed about?"
            disabled={loading}
          />
          <div className="d-flex justify-content-end mt-1">
            <small className="text-muted">{500 - description.length}</small>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !name.trim() || !slug.trim()}
        >
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2"></span>
              Creating...
            </>
          ) : (
            'Create Feed'
          )}
        </button>
      </form>
    </div>
  );
}
