import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { communities, media, type Community, type CommunityModerationInfo } from '../../api';
import { AdminManagement } from './AdminManagement';
import { BanManagement } from './BanManagement';
import { ConfirmModal } from '../ConfirmModal';
import { AlertMessage } from '../AlertMessage';
import { LoadingButton } from '../LoadingButton';
import { useAvatarUpload, useMessage } from '../../hooks';

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
  const { message, showSuccess, showError, clear: clearMessage } = useMessage();

  const {
    preview: avatarPreview,
    data: avatarData,
    error: avatarError,
    triggerSelect,
    inputProps,
    reset: resetAvatar,
  } = useAvatarUpload({ initialPreview: community.avatar_url });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await communities.delete(community.name!);
      navigate('/communities');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    clearMessage();
    try {
      let avatarUrl = community.avatar_url;

      if (avatarData) {
        const { url } = await media.upload(avatarData);
        avatarUrl = url;
      }

      const { community: updated } = await communities.update(community.name!, {
        bio: bio || undefined,
        avatar_url: avatarUrl || undefined,
        require_approval: requireApproval,
      });
      onUpdate(updated);
      resetAvatar();
      showSuccess('Settings saved!');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save');
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
          <AlertMessage message={message} onDismiss={clearMessage} />
          {avatarError && (
            <div className="alert alert-danger py-2">{avatarError}</div>
          )}

          {/* Avatar */}
          <div className="mb-4">
            <label className="form-label">Community Avatar</label>
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded overflow-hidden"
                style={{
                  width: 80,
                  height: 80,
                  backgroundColor: '#e9ecef',
                  cursor: 'pointer',
                }}
                onClick={triggerSelect}
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-100">
                    <i className="bi bi-people-fill text-muted fs-3"></i>
                  </div>
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={triggerSelect}
                >
                  <i className="bi bi-upload me-1"></i> Upload Photo
                </button>
                <div className="form-text">Image will be resized to 100x100</div>
              </div>
              <input {...inputProps} />
            </div>
          </div>

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

          <LoadingButton
            loading={saving}
            loadingText="Saving..."
            onClick={handleSave}
          >
            Save Changes
          </LoadingButton>
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
