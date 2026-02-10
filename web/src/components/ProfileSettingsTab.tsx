import { useState, useEffect } from 'react';
import { Actor, profile, auth, notifications, NotificationPreferences } from '../api';
import { Avatar } from './Avatar';
import { AlertMessage } from './AlertMessage';
import { LoadingButton } from './LoadingButton';
import { useAvatarUpload, useMessage } from '../hooks';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface ProfileSettingsTabProps {
  actor: Actor;
  onUpdate: (actor: Actor) => void;
  onLogout: () => void;
}

export function ProfileSettingsTab({ actor, onUpdate, onLogout }: ProfileSettingsTabProps) {
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

  // Push notifications
  const pushNotifications = usePushNotifications(true);

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const { message: prefsMessage, showSuccess: showPrefsSuccess, showError: showPrefsError, clear: clearPrefsMessage } = useMessage();

  useEffect(() => {
    notifications.getPreferences().then(setNotifPrefs).catch(() => {});
  }, []);

  const handleSavePreferences = async () => {
    if (!notifPrefs) return;
    setSavingPrefs(true);
    clearPrefsMessage();
    try {
      const updated = await notifications.updatePreferences(notifPrefs);
      setNotifPrefs(updated);
      showPrefsSuccess('Notification preferences saved');
    } catch (err) {
      showPrefsError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { message: deleteMessage, showError: showDeleteError, clear: clearDeleteMessage } = useMessage();

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
    if (!deletePassword) {
      showDeleteError('Password is required');
      return;
    }

    setDeletingAccount(true);
    clearDeleteMessage();

    try {
      await auth.deleteAccount(deletePassword);
      setShowDeleteConfirm(false);
      onLogout();
    } catch (err) {
      showDeleteError(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteConfirm(false);
    setDeletePassword('');
    clearDeleteMessage();
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
              maxLength={200}
            />
            <div className="form-text">{bio.length}/200 characters</div>
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

      {/* Push Notifications Card */}
      {pushNotifications.supported && (
        <div className="card mb-4">
          <div className="card-header">
            <h6 className="mb-0">Push Notifications</h6>
          </div>
          <div className="card-body">
            {pushNotifications.permission === 'denied' ? (
              <p className="text-muted small mb-0">
                Notifications are blocked by your browser. To re-enable, update the notification permission in your browser's site settings.
              </p>
            ) : pushNotifications.subscribed ? (
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <span className="text-success me-2"><i className="bi bi-check-circle-fill"></i></span>
                  Push notifications are enabled
                </div>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={pushNotifications.unsubscribe}
                  disabled={pushNotifications.loading}
                >
                  {pushNotifications.loading ? 'Disabling...' : 'Disable'}
                </button>
              </div>
            ) : (
              <div className="d-flex align-items-center justify-content-between">
                <span className="text-muted small">Get notified about replies, likes, and follows even when the app is closed.</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={pushNotifications.subscribe}
                  disabled={pushNotifications.loading}
                >
                  {pushNotifications.loading ? 'Enabling...' : 'Enable'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notification Preferences Card */}
      {notifPrefs && (
        <div className="card mb-4">
          <div className="card-header">
            <h6 className="mb-0">Notification Preferences</h6>
          </div>
          <div className="card-body">
            <AlertMessage message={prefsMessage} onDismiss={clearPrefsMessage} />
            <p className="text-muted small mb-3">Choose which notifications you receive.</p>

            <div className="mb-2">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="prefLikes"
                  checked={notifPrefs.likes}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, likes: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="prefLikes">
                  Likes <span className="text-muted small">— Someone likes your post</span>
                </label>
              </div>
            </div>

            <div className="mb-2">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="prefReplies"
                  checked={notifPrefs.replies}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, replies: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="prefReplies">
                  Replies <span className="text-muted small">— Someone replies to your post</span>
                </label>
              </div>
            </div>

            <div className="mb-2">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="prefMentions"
                  checked={notifPrefs.mentions}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, mentions: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="prefMentions">
                  Mentions <span className="text-muted small">— Someone mentions you</span>
                </label>
              </div>
            </div>

            <div className="mb-2">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="prefBoosts"
                  checked={notifPrefs.boosts}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, boosts: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="prefBoosts">
                  Boosts <span className="text-muted small">— Someone boosts your post</span>
                </label>
              </div>
            </div>

            <div className="mb-3">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="prefFollows"
                  checked={notifPrefs.follows}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, follows: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="prefFollows">
                  Follows <span className="text-muted small">— Someone follows you</span>
                </label>
              </div>
            </div>

            <LoadingButton
              loading={savingPrefs}
              loadingText="Saving..."
              onClick={handleSavePreferences}
            >
              Save Preferences
            </LoadingButton>
          </div>
        </div>
      )}

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
      {showDeleteConfirm && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete Account</h5>
                <button type="button" className="btn-close" onClick={handleCloseDeleteModal}></button>
              </div>
              <div className="modal-body">
                <AlertMessage message={deleteMessage} onDismiss={clearDeleteMessage} />
                <p className="text-muted">
                  This action cannot be undone. All your posts, followers, and data will be permanently removed.
                </p>
                <div className="mb-3">
                  <label htmlFor="deletePassword" className="form-label">Enter your password to confirm</label>
                  <input
                    type="password"
                    className="form-control"
                    id="deletePassword"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Your password"
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseDeleteModal}>
                  Cancel
                </button>
                <LoadingButton
                  variant="danger"
                  loading={deletingAccount}
                  loadingText="Deleting..."
                  disabled={!deletePassword}
                  onClick={handleDeleteAccount}
                >
                  Delete Forever
                </LoadingButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
