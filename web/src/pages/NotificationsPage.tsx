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

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'like': return <i className="bi bi-heart-fill text-danger"></i>;
      case 'boost': return <i className="bi bi-arrow-repeat text-success"></i>;
      case 'follow': return <i className="bi bi-person-plus-fill text-primary"></i>;
      case 'reply': return <i className="bi bi-chat-fill text-info"></i>;
      case 'mention': return <i className="bi bi-at text-warning"></i>;
      default: return <i className="bi bi-bell"></i>;
    }
  };

  const getNotificationText = (n: Notification) => {
    const actorName = n.actor.name || n.actor.handle;
    switch (n.type) {
      case 'like': return <><strong>{actorName}</strong> liked your post</>;
      case 'boost': return <><strong>{actorName}</strong> boosted your post</>;
      case 'follow': return <><strong>{actorName}</strong> followed you</>;
      case 'reply': return <><strong>{actorName}</strong> replied to your post</>;
      case 'mention': return <><strong>{actorName}</strong> mentioned you</>;
      default: return <><strong>{actorName}</strong> interacted with you</>;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-4">
        <i className="bi bi-bell me-2"></i>
        Notifications
      </h4>

      {notifications.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="bi bi-bell fs-1 mb-3 d-block"></i>
          <p>No notifications yet</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {notifications.map((n) => (
            <div key={n.id} className="card">
              <div className="card-body">
                <div className="d-flex align-items-start gap-3">
                  <div className="fs-4">
                    {getNotificationIcon(n.type)}
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                      <Link to={`/actor/${n.actor.id}`} className="text-decoration-none d-flex align-items-center gap-2">
                        {n.actor.avatar_url ? (
                          <img
                            src={n.actor.avatar_url}
                            alt=""
                            className="rounded-circle"
                            style={{ width: 32, height: 32, objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            className="rounded-circle bg-secondary d-flex align-items-center justify-content-center text-white"
                            style={{ width: 32, height: 32, fontSize: 12 }}
                          >
                            {(n.actor.name || n.actor.handle)[0]?.toUpperCase()}
                          </div>
                        )}
                      </Link>
                      <span>
                        {getNotificationText(n)}
                      </span>
                      <span className="text-muted small ms-auto">
                        {formatTimeAgo(n.created_at)}
                      </span>
                    </div>
                    {n.post && (
                      <Link
                        to={`/posts/${n.post.id}`}
                        className="text-decoration-none text-muted small d-block text-truncate mt-2"
                        style={{ maxWidth: '100%' }}
                      >
                        <span dangerouslySetInnerHTML={{ __html: n.post.content }} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
