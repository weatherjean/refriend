import { ReactNode, useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import { useScrollLockEffect } from '../context/ScrollLockContext';
import { getUsername } from '../utils';
import { tags, notifications as notificationsApi } from '../api';
import { TagBadge } from './TagBadge';
import { Avatar } from './Avatar';
import { ToastContainer } from './ToastContainer';
import { CookieBanner } from './CookieBanner';
import { PushPrompt } from './PushPrompt';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, actor, logout } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const [popularTags, setPopularTags] = useState<{ name: string; count: number }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  useEffect(() => {
    tags.getPopular()
      .then(({ tags }) => setPopularTags(tags))
      .catch(() => {});
  }, []);

  // Lock body scroll when mobile menu is open
  useScrollLockEffect('mobile-menu', mobileMenuOpen);

  // Fetch unread notification count
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    // Clear count immediately when on notifications page
    if (location.pathname === '/notifications') {
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
  }, [user, location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const username = actor ? getUsername(actor.handle) : '';

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      {/* Mobile top bar for status bar background */}
      <div className="mobile-top-bar d-lg-none" />

      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="row">
        {/* Left Sidebar */}
        <div className={`col-lg-4 sidebar py-4 px-3 ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          {/* Branding */}
          <Link to="/" className="d-flex align-items-center mb-2 text-decoration-none text-reset sidebar-logo" style={{ paddingLeft: '0.75rem' }} onClick={() => setMobileMenuOpen(false)}>
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

          <Link to="/guide" className="d-block text-muted small mb-3" style={{ paddingLeft: '0.75rem' }} onClick={() => setMobileMenuOpen(false)}>
            <i className="bi bi-book me-1"></i> Guide to Riff
          </Link>

          {/* Navigation */}
          <div className="list-group sidebar-nav mb-4">
            <Link to="/" className="list-group-item list-group-item-action" onClick={() => setMobileMenuOpen(false)}>
              <i className="bi bi-house-fill me-2"></i> Home
            </Link>
            <Link to="/explore" className="list-group-item list-group-item-action" onClick={() => setMobileMenuOpen(false)}>
              <i className="bi bi-hash me-2"></i> Tags
            </Link>
            <Link to="/feeds" className="list-group-item list-group-item-action" onClick={() => setMobileMenuOpen(false)}>
              <i className="bi bi-collection me-2"></i> Feeds
            </Link>
            {user && actor && (
              <>
                <Link to="/notifications" className="list-group-item list-group-item-action d-flex align-items-center" onClick={() => setMobileMenuOpen(false)}>
                  <i className="bi bi-bell-fill me-2"></i> Notifications
                  {unreadCount > 0 && (
                    <span className="badge bg-danger rounded-pill ms-auto">{unreadCount > 99 ? '99+' : unreadCount}</span>
                  )}
                </Link>
                <Link to="/following" className="list-group-item list-group-item-action" onClick={() => setMobileMenuOpen(false)}>
                  <i className="bi bi-people-fill me-2"></i> Following
                </Link>
                <Link to={`/a/${username}`} className="list-group-item list-group-item-action" onClick={() => setMobileMenuOpen(false)}>
                  <i className="bi bi-person-fill me-2"></i> Profile
                </Link>
              </>
            )}
          </div>

          {/* New Post Button */}
          {user && (
            <Link to="/new" className="btn btn-primary w-100 mb-4" onClick={() => setMobileMenuOpen(false)}>
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
                    <TagBadge key={tag.name} tag={tag.name} onClick={() => setMobileMenuOpen(false)} />
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
                    to="/settings"
                    className="btn btn-outline-secondary btn-sm flex-grow-1"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <i className="bi bi-gear-fill me-1"></i> Settings
                  </Link>
                  <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="btn btn-outline-secondary btn-sm flex-grow-1">
                    <i className="bi bi-box-arrow-right me-1"></i> Logout
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body text-center">
                <p className="small mb-3">Join Riff to post and participate</p>
                <Link to="/register" className="btn btn-primary btn-sm w-100 mb-2" onClick={() => setMobileMenuOpen(false)}>Sign up</Link>
                <Link to="/login" className="btn btn-outline-secondary btn-sm w-100" onClick={() => setMobileMenuOpen(false)}>Login</Link>
              </div>
            </div>
          )}

          <div className="sidebar-footer-links text-center mt-3 mb-3">
            <Link to="/install" onClick={() => setMobileMenuOpen(false)}>
              Install App
            </Link>
            <div>
              <Link to="/stats" onClick={() => setMobileMenuOpen(false)}>
                Server Stats
              </Link>
            </div>
            {user && (
              <div>
                <Link to="/all" onClick={() => setMobileMenuOpen(false)}>
                  All Activity
                </Link>
              </div>
            )}
            <div className="sidebar-footer-legal">
              <Link to="/policy" onClick={() => setMobileMenuOpen(false)}>Content Policy</Link>
              <span className="sidebar-footer-sep">·</span>
              <Link to="/privacy" onClick={() => setMobileMenuOpen(false)}>Privacy</Link>
              <span className="sidebar-footer-sep">·</span>
              <Link to="/terms" onClick={() => setMobileMenuOpen(false)}>Terms</Link>
            </div>
          </div>

          <div className="text-center mb-5 pb-5">
            <img src="/logo-mono.svg" alt="riff" height="24" style={{ opacity: 0.6 }} />
          </div>
        </div>

        {/* Main Content */}
        <div className="col-lg-8 main-content">
          {children}
        </div>
      </div>

      {/* Mobile Bottom Bar */}
      <nav className="mobile-bottom-bar d-lg-none">
        <div className="mobile-bottom-bar-icons">
          <a href="#" className="mobile-nav-item" onClick={(e) => {
            e.preventDefault();
            setMobileMenuOpen(false);
            if (location.pathname === '/') {
              document.querySelector('.page-slot')?.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              navigate('/');
            }
          }}>
            <img src="/icon.svg" alt="Home" height="24" />
          </a>
          <Link to="/search" className="mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
            <i className="bi bi-search"></i>
          </Link>
          {user && (
            <Link to="/new" className="mobile-nav-item mobile-nav-create" onClick={() => setMobileMenuOpen(false)}>
              <i className="bi bi-plus-lg"></i>
            </Link>
          )}
          {user && (
            <Link to="/notifications" className="mobile-nav-item" onClick={() => setMobileMenuOpen(false)}>
              <i className="bi bi-bell-fill"></i>
              {unreadCount > 0 && (
                <span className="mobile-nav-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
          )}
          <button
            className="mobile-nav-item"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            <i className={`bi ${mobileMenuOpen ? 'bi-x-lg' : 'bi-list'}`}></i>
          </button>
        </div>
        <div className="mobile-bottom-bar-spacer"></div>
      </nav>

      <ToastContainer />
      <CookieBanner />
      <PushPrompt />
    </div>
  );
}
