import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { communities, type Community } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { LoadMoreButton } from '../components/LoadMoreButton';

export function CommunitiesPage() {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<Community[] | null>(null);
  const [communityList, setCommunityList] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const loadCommunities = async () => {
      try {
        const { communities: list, next_cursor } = await communities.list({ limit: 20 });
        setCommunityList(list);
        setNextCursor(next_cursor);
      } catch (err) {
        console.error('Failed to load communities:', err);
      } finally {
        setLoading(false);
      }
    };
    loadCommunities();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) return;

    setSearchLoading(true);
    try {
      const { communities: results } = await communities.search(query);
      setSearchResults(results);
    } catch (err) {
      console.error('Failed to search communities:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleClear = () => {
    setSearchInput('');
    setSearchResults(null);
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { communities: more, next_cursor } = await communities.list({ limit: 20, before: nextCursor });
      setCommunityList(prev => [...prev, ...more]);
      setNextCursor(next_cursor);
    } catch (err) {
      console.error('Failed to load more communities:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const displayCommunities = searchResults !== null ? searchResults : communityList;
  const isSearching = searchResults !== null;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0">Communities</h4>
        {user && (
          <Link to="/communities/new" className="btn btn-primary btn-sm">
            <i className="bi bi-plus-lg me-1"></i> Create
          </Link>
        )}
      </div>

      <div className="card mb-4">
        <div className="card-body">
          <form onSubmit={handleSearch}>
            <label htmlFor="searchInput" className="form-label">
              Search communities
            </label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input
                type="text"
                className="form-control"
                id="searchInput"
                placeholder="Enter community name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={!searchInput.trim() || searchLoading}>
                {searchLoading ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  'Search'
                )}
              </button>
              {isSearching && (
                <button type="button" className="btn btn-outline-secondary" onClick={handleClear}>
                  <i className="bi bi-x-lg"></i>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <h5 className="mb-3">
        {isSearching ? `Results for "${searchInput.trim()}"` : 'All Communities'}
      </h5>

      {loading && !isSearching ? (
        <LoadingSpinner size="sm" className="py-4" />
      ) : displayCommunities.length === 0 ? (
        <div className="text-center text-muted py-4">
          <EmptyState
            icon="people"
            title={isSearching ? `No communities found matching "${searchInput.trim()}"` : 'No communities yet.'}
          />
          {!isSearching && user && (
            <Link to="/communities/new" className="btn btn-outline-primary btn-sm mt-3">
              Create the first community
            </Link>
          )}
        </div>
      ) : (
        <div className="list-group">
          {displayCommunities.map((community) => (
            <Link
              key={community.id}
              to={`/c/${community.name}`}
              className="list-group-item list-group-item-action"
            >
              <div className="d-flex align-items-center">
                {community.avatar_url ? (
                  <img
                    src={community.avatar_url}
                    alt=""
                    className="rounded me-3"
                    style={{ width: 48, height: 48, objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    className="rounded me-3 bg-secondary d-flex align-items-center justify-content-center"
                    style={{ width: 48, height: 48 }}
                  >
                    <i className="bi bi-people text-white fs-5"></i>
                  </div>
                )}
                <div className="flex-grow-1">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <h6 className="mb-0">{community.name}</h6>
                      <small className="text-muted">{community.handle}</small>
                    </div>
                    <span className="badge bg-primary rounded-pill">
                      {community.member_count} {community.member_count === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  {community.bio && (
                    <p className="mb-0 mt-1 text-muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {community.bio}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!isSearching && nextCursor && (
        <LoadMoreButton loading={loadingMore} onClick={loadMore} className="mt-4" />
      )}
    </div>
  );
}
