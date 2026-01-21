import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { notifications as notificationsApi, Notification } from '../api';
import { formatTimeAgo } from '../utils';
import { Avatar } from '../components/Avatar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageHeader } from '../components/PageHeader';

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const { notifications } = await notificationsApi.getAll();
      setNotifications(notifications);
      // Mark all as read when viewing
      if (notifications.some(n => !n.read)) {
        await notificationsApi.markAsRead();
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const getNotificationText = (type: Notification['type']) => {
    switch (type) {
      case 'like': return 'liked your post';
      case 'boost': return 'boosted your post';
      case 'follow': return 'followed you';
      case 'reply': return 'replied to your post';
      case 'mention': return 'mentioned you';
      default: return 'interacted with you';
    }
  };

  const getNotificationLink = (n: Notification) => {
    if (n.post) return `/posts/${n.post.id}`;
    return `/actor/${n.actor.id}`;  // For follows, link to the actor
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await notificationsApi.delete();
      setNotifications([]);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        icon="bell-fill"
        actions={notifications.length > 0 ? (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="btn btn-outline-secondary btn-sm"
          >
            Clear all
          </button>
        ) : undefined}
      />

      {notifications.length === 0 ? (
        <EmptyState icon="bell-fill" title="No notifications yet" />
      ) : (
        <div className="d-flex flex-column gap-2">
          {notifications.map((n) => (
            <Link
              key={n.id}
              to={getNotificationLink(n)}
              className="card text-decoration-none text-reset"
            >
              <div className="card-body py-3">
                <div className="d-flex align-items-center gap-3">
                  <Avatar
                    src={n.actor.avatar_url}
                    name={n.actor.name || n.actor.handle}
                    size="md"
                    className="flex-shrink-0"
                  />
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div>
                      <strong>{n.actor.name || n.actor.handle}</strong>
                      {' '}{getNotificationText(n.type)}
                    </div>
                    {n.post && (
                      <div
                        className="text-muted small text-truncate mt-1"
                        dangerouslySetInnerHTML={{ __html: n.post.content }}
                      />
                    )}
                  </div>
                  <span className="text-muted small flex-shrink-0">
                    {formatTimeAgo(n.created_at)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Clear Confirmation Modal */}
      <ConfirmModal
        show={showClearConfirm}
        title="Clear Notifications"
        message="Are you sure you want to clear all notifications? This action cannot be undone."
        confirmText={clearing ? 'Clearing...' : 'Clear All'}
        confirmVariant="danger"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
