import { useState, useRef } from 'react';
import { Actor, profile, auth } from '../api';
import { resizeAndConvertToWebP } from '../utils/imageUtils';
import { ConfirmModal } from './ConfirmModal';
import { Avatar } from './Avatar';

interface ProfileSettingsTabProps {
  actor: Actor;
  onUpdate: (actor: Actor) => void;
}

export function ProfileSettingsTab({ actor, onUpdate }: ProfileSettingsTabProps) {
  // Profile state
  const [name, setName] = useState(actor.name || '');
  const [bio, setBio] = useState(actor.bio || '');
  const [avatarPreview, setAvatarPreview] = useState(actor.avatar_url || '');
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileMessage({ type: 'error', text: 'Please select an image file' });
      return;
    }

    try {
      setProfileMessage(null);
      const webpData = await resizeAndConvertToWebP(file, 100);
      setAvatarPreview(webpData);
      setAvatarData(webpData);
    } catch (err) {
      setProfileMessage({ type: 'error', text: 'Failed to process image' });
      console.error(err);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage(null);

    try {
      let updatedActor = actor;

      if (avatarData) {
        const avatarResult = await profile.uploadAvatar(avatarData);
        updatedActor = avatarResult.actor;
      }

      const result = await profile.update({ name: name || undefined, bio: bio || undefined });
      updatedActor = result.actor;

      onUpdate(updatedActor);
      setProfileMessage({ type: 'success', text: 'Profile updated successfully' });
      setAvatarData(null);
    } catch (err) {
      setProfileMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save profile' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }

    setSavingPassword(true);
    try {
      await auth.changePassword(currentPassword, newPassword);
      setPasswordMessage({ type: 'success', text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to change password' });
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
          {profileMessage && (
            <div className={`alert alert-${profileMessage.type === 'success' ? 'success' : 'danger'} py-2`}>
              {profileMessage.text}
            </div>
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
                onClick={() => fileInputRef.current?.click()}
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
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="bi bi-upload me-1"></i> Upload Photo
                </button>
                <div className="form-text">Image will be resized to 100x100</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
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

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Saving...
              </>
            ) : (
              'Save Profile'
            )}
          </button>
        </div>
      </div>

      {/* Password Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h6 className="mb-0">Change Password</h6>
        </div>
        <div className="card-body">
          {passwordMessage && (
            <div className={`alert alert-${passwordMessage.type === 'success' ? 'success' : 'danger'} py-2`}>
              {passwordMessage.text}
            </div>
          )}

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

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleChangePassword}
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
          >
            {savingPassword ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Changing...
              </>
            ) : (
              'Change Password'
            )}
          </button>
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
