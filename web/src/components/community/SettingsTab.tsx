import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { communities, type Community, type CommunityModerationInfo } from '../../api';
import { AdminManagement } from './AdminManagement';
import { BanManagement } from './BanManagement';
import { ConfirmModal } from '../ConfirmModal';

export function SettingsTab({
  community,
  moderation,
  onUpdate,
}: {
  community: Community;
  moderation: CommunityModerationInfo;
  onUpdate: (community: Community) => void;
}) {
  const navigate = useNavigate();
  const [bio, setBio] = useState(community.bio || '');
  const [requireApproval, setRequireApproval] = useState(community.require_approval);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await communities.delete(community.name!);
      navigate('/communities');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { community: updated } = await communities.update(community.name!, {
        bio: bio || undefined,
        require_approval: requireApproval,
      });
      onUpdate(updated);
      setMessage({ type: 'success', text: 'Settings saved!' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <h6 className="mb-0">Community Settings</h6>
        </div>
        <div className="card-body">
          {message && (
            <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} py-2`}>
              {message.text}
            </div>
          )}

          <div className="mb-3">
            <label className="form-label">Description</label>
            <textarea
              className="form-control"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              placeholder="What is this community about?"
            />
            <div className="form-text">{bio.length}/500 characters</div>
          </div>

          <div className="mb-3">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="requireApproval"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="requireApproval">
                Require post approval
              </label>
            </div>
            <div className="form-text">
              When enabled, posts must be approved by admins before appearing.
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>

      {/* Admin Management */}
      <AdminManagement communityName={community.name!} isOwner={moderation.isOwner} />

      {/* Ban Management */}
      <BanManagement communityName={community.name!} />

      {moderation.isOwner && (
        <div className="card border-danger">
          <div className="card-header bg-danger text-white">
            <h6 className="mb-0">Danger Zone</h6>
          </div>
          <div className="card-body">
            <p className="text-muted small mb-3">
              Deleting a community is permanent and cannot be undone. All community posts, settings, and member data will be removed.
            </p>
            <button
              className="btn btn-outline-danger btn-sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Community
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        show={showDeleteConfirm}
        title="Delete Community"
        message={`Are you sure you want to delete "${community.name}"? This action cannot be undone. All community data including posts, settings, and memberships will be permanently removed.`}
        confirmText={deleting ? 'Deleting...' : 'Delete Forever'}
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
