import { ReactNode, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUsername } from '../utils';
import { tags, users, notifications as notificationsApi, TrendingUser } from '../api';
import { TagBadge } from './TagBadge';
import { SettingsDrawer } from './SettingsDrawer';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, actor, logout, setActor } = useAuth();
  const navigate = useNavigate();
  const [popularTags, setPopularTags] = useState<{ name: string; count: number }[]>([]);
  const [trendingUsers, setTrendingUsers] = useState<TrendingUser[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    tags.getPopular()
      .then(({ tags }) => setPopularTags(tags))
      .catch(() => {});
    users.getTrending()
      .then(({ users }) => setTrendingUsers(users))
      .catch(() => {});
  }, []);

  // Fetch unread notification count
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    const fetchCount = () => {
      notificationsApi.getUnreadCount()
        .then(({ count }) => setUnreadCount(count))
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const username = actor ? getUsername(actor.handle) : '';

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <div className="row">
        {/* Left Sidebar */}
        <div className="col-lg-4 sidebar py-4 px-3">
          {/* Branding */}
          <Link to="/" className="d-flex align-items-center mb-4 text-decoration-none text-reset">
            <i className="bi bi-people-fill fs-3 text-primary me-2"></i>
            <span className="fs-4 fw-bold">Refriend</span>
          </Link>

          {/* Navigation */}
          <div className="list-group sidebar-nav mb-4">
            <Link to="/" className="list-group-item list-group-item-action">
              <i className="bi bi-house me-2"></i> Home
            </Link>
            <Link to="/hot" className="list-group-item list-group-item-action">
              <i className="bi bi-fire me-2 text-danger"></i> Hot
            </Link>
            <Link to="/search" className="list-group-item list-group-item-action">
              <i className="bi bi-search me-2"></i> Search
            </Link>
            <Link to="/explore" className="list-group-item list-group-item-action">
              <i className="bi bi-hash me-2"></i> Tags
            </Link>
            {user && actor && (
              <>
                <Link to="/notifications" className="list-group-item list-group-item-action d-flex align-items-center">
                  <i className="bi bi-bell me-2"></i> Notifications
                  {unreadCount > 0 && (
                    <span className="badge bg-danger rounded-pill ms-auto">{unreadCount > 99 ? '99+' : unreadCount}</span>
                  )}
                </Link>
                <Link to={`/u/${username}`} className="list-group-item list-group-item-action">
                  <i className="bi bi-person me-2"></i> Profile
                </Link>
              </>
            )}
          </div>

          {/* New Post Button */}
          {user && (
            <Link to="/new" className="btn btn-primary w-100 mb-4">
              <i className="bi bi-plus-lg me-1"></i> New Post
            </Link>
          )}

          {/* Popular Tags */}
          {popularTags.length > 0 && (
            <div className="card mb-4">
              <div className="card-body">
                <h6 className="card-title mb-3">Popular Tags</h6>
                <div className="d-flex flex-wrap gap-2">
                  {popularTags.map((tag) => (
                    <TagBadge key={tag.name} tag={tag.name} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Trending Users */}
          {trendingUsers.length > 0 && (
            <div className="card mb-4">
              <div className="card-body">
                <h6 className="card-title mb-3">
                  <i className="bi bi-graph-up-arrow me-1"></i> Rising
                </h6>
                <div className="d-flex flex-column gap-2">
                  {trendingUsers.map((u) => (
                    <Link
                      key={u.id}
                      to={`/u/${u.handle}`}
                      className="d-flex align-items-center text-decoration-none text-reset"
                    >
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="rounded-circle me-2"
                          style={{ width: 28, height: 28, objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          className="rounded-circle bg-secondary d-flex align-items-center justify-content-center me-2"
                          style={{ width: 28, height: 28, fontSize: 12 }}
                        >
                          {(u.name || u.handle)[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-grow-1 text-truncate" style={{ minWidth: 0 }}>
                        <div className="small fw-semibold text-truncate">{u.name || getUsername(u.handle)}</div>
                      </div>
                      <span className="badge bg-success ms-2">+{u.new_followers}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* User / Auth */}
          {user ? (
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center mb-3">
                  {actor?.avatar_url ? (
                    <img
                      src={actor.avatar_url}
                      alt=""
                      className="rounded-circle flex-shrink-0"
                      style={{ width: 32, height: 32, objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="avatar avatar-sm flex-shrink-0">{username[0]?.toUpperCase()}</div>
                  )}
                  <span
                    className="ms-2 text-truncate"
                    style={{ minWidth: 0 }}
                    title={actor?.handle}
                  >
                    {actor?.handle}
                  </span>
                </div>
                <div className="d-flex gap-2">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="btn btn-outline-secondary btn-sm flex-grow-1"
                  >
                    <i className="bi bi-gear me-1"></i> Settings
                  </button>
                  <button onClick={handleLogout} className="btn btn-outline-secondary btn-sm flex-grow-1">
                    <i className="bi bi-box-arrow-right me-1"></i> Logout
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body text-center">
                <p className="small mb-3">Join Refriend to post and participate</p>
                <Link to="/register" className="btn btn-primary btn-sm w-100 mb-2">Sign up</Link>
                <Link to="/login" className="btn btn-outline-secondary btn-sm w-100">Login</Link>
              </div>
            </div>
          )}

          <div className="text-muted small text-center mt-3">
            Refriend &middot; Federated
          </div>
        </div>

        {/* Main Content */}
        <div className="col-lg-8 py-4 px-3">
          {children}
        </div>
      </div>

      {/* Settings Drawer */}
      {showSettings && actor && (
        <SettingsDrawer
          actor={actor}
          onClose={() => setShowSettings(false)}
          onSave={(updated) => setActor(updated)}
        />
      )}
    </div>
  );
}
