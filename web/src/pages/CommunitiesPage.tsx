import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { communities, type Community } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { SearchForm } from '../components/SearchForm';
import { useSearch } from '../hooks';

export function CommunitiesPage() {
  const { user } = useAuth();

  const initialFetch = useCallback(async () => {
    if (user) {
      const { communities: list } = await communities.getJoined();
      return list;
    } else {
      const { communities: list } = await communities.list({ limit: 20 });
      return list;
    }
  }, [user]);

  const searchFn = useCallback(async (query: string) => {
    const { communities: results } = await communities.search(query);
    return results;
  }, []);

  const {
    query: searchInput,
    setQuery: setSearchInput,
    displayItems: displayCommunities,
    loading,
    searchLoading,
    isSearching,
    search: handleSearch,
    clear: handleClear,
  } = useSearch<Community>({ initialFetch, searchFn });

  return (
    <div>
      <PageHeader
        title="Communities"
        icon="people-fill"
        actions={user ? (
          <Link to="/communities/new" className="btn btn-primary btn-sm">
            <i className="bi bi-plus-lg me-1"></i> Create
          </Link>
        ) : undefined}
      />

      <SearchForm
        placeholder="Enter community name..."
        label="Search communities"
        value={searchInput}
        onChange={setSearchInput}
        onSubmit={handleSearch}
        onClear={handleClear}
        loading={searchLoading}
        showClear={isSearching}
      />

      <h5 className="mb-3">
        {isSearching ? `Results for "${searchInput.trim()}"` : (user ? 'Your Communities' : 'All Communities')}
      </h5>

      {loading && !isSearching ? (
        <LoadingSpinner size="sm" className="py-4" />
      ) : displayCommunities.length === 0 ? (
        <div className="text-center text-muted py-4">
          <EmptyState
            icon="people-fill"
            title={isSearching ? `No communities found matching "${searchInput.trim()}"` : (user ? 'No communities joined yet.' : 'No communities yet.')}
          />
          {!isSearching && user && (
            <p className="text-muted small mt-2">Search for communities to join, or create your own.</p>
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
                    <i className="bi bi-people-fill text-white fs-5"></i>
                  </div>
                )}
                <div className="flex-grow-1">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <h6 className="mb-0 fw-bold text-white">{community.name}</h6>
                      <small className="text-muted">{community.handle}</small>
                    </div>
                    <div className="d-flex gap-2 align-items-center">
                      {user && !isSearching && (
                        <span className="badge bg-success">Joined</span>
                      )}
                      <span className="badge bg-secondary">
                        {community.member_count} {community.member_count === 1 ? 'member' : 'members'}
                      </span>
                    </div>
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
    </div>
  );
}
