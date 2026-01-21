import { ReactNode, useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFeed } from '../context/FeedContext';
import { getUsername } from '../utils';
import { tags, notifications as notificationsApi } from '../api';
import { TagBadge } from './TagBadge';
import { Avatar } from './Avatar';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, actor, logout } = useAuth();
  const { feedType, setFeedType } = useFeed();
  const navigate = useNavigate();
  const [popularTags, setPopularTags] = useState<{ name: string; count: number }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  useEffect(() => {
    tags.getPopular()
      .then(({ tags }) => setPopularTags(tags))
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
          <Link to="/" className="d-flex align-items-center mb-4 text-decoration-none text-reset" style={{ paddingLeft: '0.75rem' }}>
            <img src="/icon.svg" alt="riff" height="36" />
          </Link>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="mb-3">
            <div className="input-group">
              <input
                type="text"
                className="form-control"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-outline-secondary">
                <i className="bi bi-search"></i>
              </button>
            </div>
          </form>

          {/* Navigation */}
          <div className="list-group sidebar-nav mb-4">
            <Link to="/" className="list-group-item list-group-item-action">
              <i className="bi bi-house-fill me-2"></i> Feed
            </Link>
            <Link to="/explore" className="list-group-item list-group-item-action">
              <i className="bi bi-hash me-2"></i> Tags
            </Link>
            <Link to="/communities" className="list-group-item list-group-item-action">
              <i className="bi bi-people-fill me-2"></i> Communities
            </Link>
            {user && actor && (
              <>
                <Link to="/notifications" className="list-group-item list-group-item-action d-flex align-items-center">
                  <i className="bi bi-bell-fill me-2"></i> Notifications
                  {unreadCount > 0 && (
                    <span className="badge bg-danger rounded-pill ms-auto">{unreadCount > 99 ? '99+' : unreadCount}</span>
                  )}
                </Link>
                <Link to={`/u/${username}`} className="list-group-item list-group-item-action">
                  <i className="bi bi-person-fill me-2"></i> Profile
                </Link>
              </>
            )}
          </div>

          {/* Feed Toggle (only for logged-in users) */}
          {user && (
            <div className="btn-group w-100 mb-4" role="group">
              <button
                type="button"
                className={`btn btn-sm ${feedType === 'new' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setFeedType('new')}
              >
                <i className="bi bi-clock-fill me-1"></i> New
              </button>
              <button
                type="button"
                className={`btn btn-sm ${feedType === 'hot' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setFeedType('hot')}
              >
                <i className="bi bi-fire me-1"></i> Hot
              </button>
            </div>
          )}

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

          {/* User / Auth */}
          {user ? (
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center mb-3">
                  <Avatar
                    src={actor?.avatar_url}
                    name={username}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  <span
                    className="ms-2 text-truncate"
                    style={{ minWidth: 0 }}
                    title={actor?.handle}
                  >
                    {actor?.handle}
                  </span>
                </div>
                <div className="d-flex gap-2">
                  <Link
                    to={`/u/${actor?.handle}`}
                    className="btn btn-outline-secondary btn-sm flex-grow-1"
                  >
                    <i className="bi bi-person-fill me-1"></i> Profile
                  </Link>
                  <button onClick={handleLogout} className="btn btn-outline-secondary btn-sm flex-grow-1">
                    <i className="bi bi-box-arrow-right me-1"></i> Logout
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body text-center">
                <p className="small mb-3">Join Riff to post and participate</p>
                <Link to="/register" className="btn btn-primary btn-sm w-100 mb-2">Sign up</Link>
                <Link to="/login" className="btn btn-outline-secondary btn-sm w-100">Login</Link>
              </div>
            </div>
          )}

          <div className="text-center mt-3">
            <img src="/logo-mono.svg" alt="riff" height="24" style={{ opacity: 0.6 }} />
          </div>
        </div>

        {/* Main Content */}
        <div className="col-lg-8 py-4 px-3">
          {children}
        </div>
      </div>

    </div>
  );
}
