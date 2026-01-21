import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { communities } from '../api';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/PageHeader';

export function CreateCommunityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="text-center py-5">
        <i className="bi bi-lock-fill fs-1 mb-3 d-block text-muted"></i>
        <p className="text-muted">You need to be logged in to create a community.</p>
        <Link to="/login" className="btn btn-primary">Log in</Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim().toLowerCase();
    if (!trimmedName) {
      setError('Community name is required');
      return;
    }

    if (!/^[a-z0-9_]+$/.test(trimmedName)) {
      setError('Name can only contain lowercase letters, numbers, and underscores');
      return;
    }

    if (trimmedName.length > 50) {
      setError('Name must be 50 characters or less');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { community } = await communities.create(trimmedName, bio.trim() || undefined, requireApproval);
      navigate(`/c/${community.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create community');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Create a Community" icon="plus-lg" />

      <div className="card">
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert alert-danger py-2">
                <i className="bi bi-exclamation-circle-fill me-2"></i>{error}
              </div>
            )}

            <div className="mb-3">
              <label htmlFor="name" className="form-label">Name <span className="text-danger">*</span></label>
              <div className="input-group">
                <span className="input-group-text">@</span>
                <input
                  type="text"
                  className="form-control"
                  id="name"
                  placeholder="my_community"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  maxLength={50}
                  required
                />
              </div>
              <div className="form-text">
                Lowercase letters, numbers, and underscores only. This cannot be changed later.
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="bio" className="form-label">Description</label>
              <textarea
                className="form-control"
                id="bio"
                rows={3}
                placeholder="What is this community about?"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
              />
              <div className="form-text">{bio.length}/500 characters</div>
            </div>

            <div className="mb-4">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="requireApproval"
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="requireApproval">
                  Require post approval
                </label>
              </div>
              <div className="form-text">
                When enabled, posts must be approved by admins before appearing in the community.
              </div>
            </div>

            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Creating...
                  </>
                ) : (
                  <>
                    <i className="bi bi-plus-lg me-2"></i>
                    Create Community
                  </>
                )}
              </button>
              <Link to="/communities" className="btn btn-outline-secondary">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
