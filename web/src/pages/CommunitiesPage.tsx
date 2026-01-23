import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { communities, type Community } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { SearchForm } from '../components/SearchForm';
import { CommunityAvatar } from '../components/Avatar';
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
        placeholder="Search communities..."
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
        <div className="row g-3">
          {displayCommunities.map((community) => (
            <div key={community.id} className="col-12 col-sm-6">
              <Link
                to={`/c/${community.name}`}
                className="card h-100 text-decoration-none"
              >
                <div className="card-body">
                  <div className="d-flex align-items-center mb-2">
                    <CommunityAvatar src={community.avatar_url} size={48} className="flex-shrink-0" />
                    <div className="ms-3 min-width-0">
                      <h6 className="mb-0 fw-bold text-body">{community.name}</h6>
                      <small className="text-muted d-block text-truncate">{community.handle}</small>
                    </div>
                  </div>
                  {community.bio && (
                    <p className="mb-2 text-muted small community-bio-truncate">
                      {community.bio.replace(/<[^>]*>/g, '')}
                    </p>
                  )}
                  <div className="d-flex gap-2 flex-wrap">
                    {user && !isSearching && (
                      <span className="badge bg-success">Joined</span>
                    )}
                    <span className="badge bg-secondary">
                      {community.member_count} {community.member_count === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
