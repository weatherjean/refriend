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
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const { notifications, next_cursor } = await notificationsApi.getAll();
      setNotifications(notifications);
      setNextCursor(next_cursor);
      // Mark all as read when viewing
      if (notifications.some(n => !n.read)) {
        await notificationsApi.markAsRead();
      }
    } catch {
      // Error handled by global toast
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { notifications: moreNotifications, next_cursor } = await notificationsApi.getAll(50, nextCursor);
      setNotifications(prev => [...prev, ...moreNotifications]);
      setNextCursor(next_cursor);
    } catch {
      // Error handled by global toast
    } finally {
      setLoadingMore(false);
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

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'like': return { icon: 'heart-fill', color: 'text-danger' };
      case 'boost': return { icon: 'repeat', color: 'text-success' };
      case 'follow': return { icon: 'person-plus-fill', color: 'text-primary' };
      case 'reply': return { icon: 'chat-fill', color: 'text-info' };
      case 'mention': return { icon: 'at', color: 'text-warning' };
      default: return { icon: 'bell-fill', color: 'text-muted' };
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
    } catch {
      // Error handled by global toast
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
          {notifications.map((n) => {
            const { icon, color } = getNotificationIcon(n.type);
            return (
              <Link
                key={n.id}
                to={getNotificationLink(n)}
                className="card text-decoration-none text-reset"
              >
                <div className="card-body py-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Avatar with notification type badge */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar
                      src={n.actor.avatar_url}
                      name={n.actor.name || n.actor.handle}
                      size="md"
                    />
                    <div
                      className={`d-flex align-items-center justify-content-center rounded-circle bg-body ${color}`}
                      style={{
                        position: 'absolute',
                        width: 20,
                        height: 20,
                        bottom: -4,
                        right: -4,
                        border: '2px solid var(--bs-card-bg, var(--bs-body-bg))',
                      }}
                    >
                      <i className={`bi bi-${icon}`} style={{ fontSize: '0.65rem' }}></i>
                    </div>
                  </div>

                  {/* Text content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{n.actor.name || n.actor.handle}</strong>
                    {' '}{getNotificationText(n.type)}
                  </div>

                  {/* Timestamp */}
                  <div className="text-muted small" style={{ flexShrink: 0 }}>
                    {formatTimeAgo(n.created_at)}
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Load more button */}
          {nextCursor && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="btn btn-outline-secondary w-100 mt-2"
            >
              {loadingMore ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Loading...
                </>
              ) : (
                'Load more'
              )}
            </button>
          )}
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
