import { useState } from 'react';
import { Actor, profile, auth } from '../api';
import { ConfirmModal } from './ConfirmModal';
import { Avatar } from './Avatar';
import { AlertMessage } from './AlertMessage';
import { LoadingButton } from './LoadingButton';
import { useAvatarUpload, useMessage } from '../hooks';

interface ProfileSettingsTabProps {
  actor: Actor;
  onUpdate: (actor: Actor) => void;
}

export function ProfileSettingsTab({ actor, onUpdate }: ProfileSettingsTabProps) {
  // Profile state
  const [name, setName] = useState(actor.name || '');
  const [bio, setBio] = useState(actor.bio || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const { message: profileMessage, showSuccess: showProfileSuccess, showError: showProfileError, clear: clearProfileMessage } = useMessage();

  // Avatar upload
  const {
    preview: avatarPreview,
    data: avatarData,
    error: avatarError,
    triggerSelect,
    inputProps,
  } = useAvatarUpload({ initialPreview: actor.avatar_url });

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const { message: passwordMessage, showSuccess: showPasswordSuccess, showError: showPasswordError, clear: clearPasswordMessage } = useMessage();

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    clearProfileMessage();

    try {
      let updatedActor = actor;

      if (avatarData) {
        const avatarResult = await profile.uploadAvatar(avatarData);
        updatedActor = avatarResult.actor;
      }

      const result = await profile.update({ name: name || undefined, bio: bio || undefined });
      updatedActor = result.actor;

      onUpdate(updatedActor);
      showProfileSuccess('Profile updated successfully');
    } catch (err) {
      showProfileError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    clearPasswordMessage();

    if (newPassword !== confirmPassword) {
      showPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      showPasswordError('Password must be at least 8 characters');
      return;
    }

    setSavingPassword(true);
    try {
      await auth.changePassword(currentPassword, newPassword);
      showPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    // TODO: Implement delete account API
    setShowDeleteConfirm(false);
  };

  return (
    <div>
      {/* Profile Settings Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h6 className="mb-0">Profile Settings</h6>
        </div>
        <div className="card-body">
          <AlertMessage message={profileMessage} onDismiss={clearProfileMessage} />
          {avatarError && (
            <div className="alert alert-danger py-2">{avatarError}</div>
          )}

          {/* Avatar */}
          <div className="mb-4">
            <label className="form-label">Avatar</label>
            <div className="d-flex align-items-center gap-3">
              <div
                className="rounded-circle overflow-hidden"
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
                  <Avatar name={actor.name || actor.handle} size="lg" />
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

          {/* Name */}
          <div className="mb-3">
            <label htmlFor="profileName" className="form-label">Display Name</label>
            <input
              type="text"
              className="form-control"
              id="profileName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
            />
          </div>

          {/* Bio */}
          <div className="mb-3">
            <label htmlFor="profileBio" className="form-label">Bio</label>
            <textarea
              className="form-control"
              id="profileBio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about yourself..."
              maxLength={500}
            />
            <div className="form-text">{bio.length}/500 characters</div>
          </div>

          <LoadingButton
            loading={savingProfile}
            loadingText="Saving..."
            onClick={handleSaveProfile}
          >
            Save Profile
          </LoadingButton>
        </div>
      </div>

      {/* Password Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h6 className="mb-0">Change Password</h6>
        </div>
        <div className="card-body">
          <AlertMessage message={passwordMessage} onDismiss={clearPasswordMessage} />

          <div className="mb-3">
            <label htmlFor="currentPassword" className="form-label">Current Password</label>
            <input
              type="password"
              className="form-control"
              id="currentPassword"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label htmlFor="newPassword" className="form-label">New Password</label>
            <input
              type="password"
              className="form-control"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div className="form-text">Must be at least 8 characters</div>
          </div>

          <div className="mb-3">
            <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
            <input
              type="password"
              className="form-control"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <LoadingButton
            loading={savingPassword}
            loadingText="Changing..."
            disabled={!currentPassword || !newPassword || !confirmPassword}
            onClick={handleChangePassword}
          >
            Change Password
          </LoadingButton>
        </div>
      </div>

      {/* Danger Zone Card */}
      <div className="card border-danger">
        <div className="card-header bg-danger text-white">
          <h6 className="mb-0">Danger Zone</h6>
        </div>
        <div className="card-body">
          <p className="text-muted small mb-3">
            Deleting your account will permanently remove all your posts, followers, and data.
            This action cannot be undone.
          </p>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete My Account
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        show={showDeleteConfirm}
        title="Delete Account"
        message="Are you sure you want to delete your account? This action cannot be undone. All your posts, followers, and data will be permanently removed."
        confirmText="Delete Forever"
        confirmVariant="danger"
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
