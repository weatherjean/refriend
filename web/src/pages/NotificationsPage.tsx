import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { notifications as notificationsApi, Notification } from '../api';
import { formatTimeAgo } from '../utils';

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

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
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  const handleClearAll = async () => {
    if (!confirm('Clear all notifications?')) return;
    try {
      await notificationsApi.delete();
      setNotifications([]);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0">Notifications</h4>
        {notifications.length > 0 && (
          <button
            onClick={handleClearAll}
            className="btn btn-outline-secondary btn-sm"
          >
            Clear all
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-bell fs-1 mb-3 d-block"></i>
          <p>No notifications yet</p>
        </div>
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
                  {n.actor.avatar_url ? (
                    <img
                      src={n.actor.avatar_url}
                      alt=""
                      className="rounded-circle flex-shrink-0"
                      style={{ width: 40, height: 40, objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      className="rounded-circle bg-secondary d-flex align-items-center justify-content-center text-white flex-shrink-0"
                      style={{ width: 40, height: 40 }}
                    >
                      {(n.actor.name || n.actor.handle)[0]?.toUpperCase()}
                    </div>
                  )}
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
    </div>
  );
}
