import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { tags } from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { SearchForm } from '../components/SearchForm';
import { useSearch } from '../hooks';

type TagItem = { name: string; count: number };

export function ExplorePage() {
  const initialFetch = useCallback(async () => {
    const { tags: trendingTags } = await tags.getTrending();
    return trendingTags;
  }, []);

  const searchFn = useCallback(async (query: string) => {
    const cleanQuery = query.replace(/^#/, '');
    const { tags: results } = await tags.search(cleanQuery);
    return results;
  }, []);

  const {
    query: tagInput,
    setQuery: setTagInput,
    displayItems: displayTags,
    loading,
    searchLoading,
    isSearching,
    search: handleSearch,
    clear: handleClear,
  } = useSearch<TagItem>({ initialFetch, searchFn });

  return (
    <div>
      <PageHeader title="Tags" icon="hash" />

      <SearchForm
        placeholder="Enter a tag name..."
        label="Search for a hashtag"
        icon="hash"
        value={tagInput}
        onChange={setTagInput}
        onSubmit={handleSearch}
        onClear={handleClear}
        loading={searchLoading}
        showClear={isSearching}
      />

      <h5 className="mb-3">
        {isSearching ? `Results for "#${tagInput.trim().replace(/^#/, '')}"` : 'Trending Tags'}
      </h5>

      {loading && !isSearching ? (
        <LoadingSpinner size="sm" className="py-4" />
      ) : displayTags.length === 0 ? (
        <EmptyState
          icon="hash"
          title={isSearching ? `No tags found matching "#${tagInput.trim().replace(/^#/, '')}"` : 'No trending tags yet.'}
          description={isSearching ? undefined : 'Start posting with hashtags to see trends!'}
        />
      ) : (
        <div className="list-group">
          {displayTags.map((tag, index) => (
            <Link
              key={tag.name}
              to={`/tags/${encodeURIComponent(tag.name)}`}
              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            >
              <div>
                {!isSearching && <span className="text-muted me-2">#{index + 1}</span>}
                <span className="fw-semibold">#{tag.name}</span>
              </div>
              <span className="badge bg-primary rounded-pill">
                {tag.count} {tag.count === 1 ? 'post' : 'posts'}
              </span>
            </Link>
          ))}
        </div>
      )}

      {!isSearching && (
        <div className="text-muted small text-center mt-4">
          Trending tags are based on posts from the last 48 hours
        </div>
      )}
    </div>
  );
}
