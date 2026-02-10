import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

const PUSH_DISMISSED_KEY = 'riff-push-prompt-dismissed';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function PushPrompt() {
  const { user } = useAuth();
  const { supported, permission, subscribed, loading, subscribe } = usePushNotifications(!!user);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if: not logged in, not supported, already subscribed, or already granted/denied
    if (!user || !supported || subscribed || permission === 'granted' || permission === 'denied') return;

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(PUSH_DISMISSED_KEY);
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < DISMISS_DURATION_MS) return;

    // Show after a brief delay so it's not aggressive
    const timer = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(timer);
  }, [user, supported, subscribed, permission]);

  // Hide when subscription completes
  useEffect(() => {
    if (subscribed) setVisible(false);
  }, [subscribed]);

  const handleDismiss = () => {
    localStorage.setItem(PUSH_DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleEnable = async () => {
    await subscribe();
    // subscribe() updates permission + subscribed state, which triggers hide via effects
  };

  if (!visible) return null;

  return (
    <div className="push-prompt">
      <div className="push-prompt-content">
        <div className="push-prompt-icon">
          <i className="bi bi-bell"></i>
        </div>
        <div className="push-prompt-text">
          <strong>Stay in the loop</strong>
          <span>Get notified when someone replies, likes, or follows you. You can change this later in <Link to="/settings">settings</Link>.</span>
        </div>
        <div className="push-prompt-actions">
          <button
            onClick={handleEnable}
            className="btn btn-primary btn-sm"
            disabled={loading}
          >
            {loading ? 'Enabling...' : 'Enable'}
          </button>
          <button
            onClick={handleDismiss}
            className="btn btn-link btn-sm text-muted"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
