import { ReactNode, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUsername } from '../utils';
import { tags } from '../api';
import { TagBadge } from './TagBadge';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, actor, logout } = useAuth();
  const navigate = useNavigate();
  const [popularTags, setPopularTags] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    tags.getPopular()
      .then(({ tags }) => setPopularTags(tags))
      .catch(() => {}); // Silently fail
  }, []);

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
            <Link to="/search" className="list-group-item list-group-item-action">
              <i className="bi bi-search me-2"></i> Search
            </Link>
            <Link to="/explore" className="list-group-item list-group-item-action">
              <i className="bi bi-hash me-2"></i> Tags
            </Link>
            {user && actor && (
              <Link to={`/u/${actor.handle}`} className="list-group-item list-group-item-action">
                <i className="bi bi-person me-2"></i> Profile
              </Link>
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

          {/* User / Auth */}
          {user ? (
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center mb-3">
                  <div className="avatar avatar-sm">{username[0]?.toUpperCase()}</div>
                  <span className="ms-2">{actor?.handle}</span>
                </div>
                <button onClick={handleLogout} className="btn btn-outline-secondary btn-sm w-100">
                  <i className="bi bi-box-arrow-right me-1"></i> Logout
                </button>
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
    </div>
  );
}
