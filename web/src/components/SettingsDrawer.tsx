import { useState, useRef } from 'react';
import { Actor, profile, auth } from '../api';
import { resizeAndConvertToWebP } from '../utils/imageUtils';

interface SettingsDrawerProps {
  actor: Actor;
  onClose: () => void;
  onSave: (actor: Actor) => void;
}

type SettingsTab = 'profile' | 'password' | 'account';

export function SettingsDrawer({ actor, onClose, onSave }: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Profile state
  const [name, setName] = useState(actor.name || '');
  const [bio, setBio] = useState(actor.bio || '');
  const [avatarPreview, setAvatarPreview] = useState(actor.avatar_url || '');
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    try {
      setError('');
      const webpData = await resizeAndConvertToWebP(file, 300);
      setAvatarPreview(webpData);
      setAvatarData(webpData);
    } catch (err) {
      setError('Failed to process image');
      console.error(err);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      let updatedActor = actor;

      if (avatarData) {
        const avatarResult = await profile.uploadAvatar(avatarData);
        updatedActor = avatarResult.actor;
      }

      const result = await profile.update({ name: name || undefined, bio: bio || undefined });
      updatedActor = result.actor;

      onSave(updatedActor);
      setSuccess('Profile updated successfully');
      setAvatarData(null); // Clear pending avatar data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      await auth.changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    // TODO: Implement delete account
    setError('Delete account is not yet implemented');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="offcanvas-backdrop fade show"
        onClick={onClose}
      ></div>

      {/* Drawer */}
      <div
        className="offcanvas offcanvas-end show"
        style={{ visibility: 'visible', width: 800 }}
        tabIndex={-1}
      >
        <div className="offcanvas-header border-bottom">
          <h5 className="offcanvas-title">Settings</h5>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            disabled={saving}
          ></button>
        </div>

        <div className="offcanvas-body p-0">
          {/* Tabs */}
          <div className="list-group list-group-flush border-bottom">
            <button
              className={`list-group-item list-group-item-action d-flex align-items-center ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => { setActiveTab('profile'); setError(''); setSuccess(''); }}
            >
              <i className="bi bi-person me-2"></i> Profile
            </button>
            <button
              className={`list-group-item list-group-item-action d-flex align-items-center ${activeTab === 'password' ? 'active' : ''}`}
              onClick={() => { setActiveTab('password'); setError(''); setSuccess(''); }}
            >
              <i className="bi bi-key me-2"></i> Change Password
            </button>
            <button
              className={`list-group-item list-group-item-action d-flex align-items-center text-danger ${activeTab === 'account' ? 'active' : ''}`}
              onClick={() => { setActiveTab('account'); setError(''); setSuccess(''); }}
            >
              <i className="bi bi-trash me-2"></i> Delete Account
            </button>
          </div>

          {/* Content */}
          <div className="p-3">
            {error && (
              <div className="alert alert-danger py-2">{error}</div>
            )}
            {success && (
              <div className="alert alert-success py-2">{success}</div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <>
                {/* Avatar */}
                <div className="mb-4 text-center">
                  <div
                    className="mx-auto mb-2 rounded-circle overflow-hidden"
                    style={{
                      width: 100,
                      height: 100,
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
                      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                        <i className="bi bi-camera fs-3"></i>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <i className="bi bi-upload me-1"></i> Upload Photo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <div className="form-text">Image will be resized to 300x300</div>
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
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-primary w-100"
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? (
                    <><span className="spinner-border spinner-border-sm me-1"></span> Saving...</>
                  ) : (
                    'Save Profile'
                  )}
                </button>
              </>
            )}

            {/* Password Tab */}
            {activeTab === 'password' && (
              <>
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
                  className="btn btn-primary w-100"
                  onClick={handleChangePassword}
                  disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                >
                  {saving ? (
                    <><span className="spinner-border spinner-border-sm me-1"></span> Changing...</>
                  ) : (
                    'Change Password'
                  )}
                </button>
              </>
            )}

            {/* Account Tab */}
            {activeTab === 'account' && (
              <>
                <div className="alert alert-warning">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  <strong>Danger Zone</strong>
                </div>

                <p className="text-muted small">
                  Deleting your account will permanently remove all your posts, followers, and data.
                  This action cannot be undone.
                </p>

                <button
                  type="button"
                  className="btn btn-danger w-100"
                  onClick={handleDeleteAccount}
                  disabled={saving}
                >
                  <i className="bi bi-trash me-1"></i> Delete My Account
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
