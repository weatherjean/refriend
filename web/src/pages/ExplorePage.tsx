import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tags } from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { SearchForm } from '../components/SearchForm';

export function ExplorePage() {
  const [tagInput, setTagInput] = useState('');
  const [searchResults, setSearchResults] = useState<{ name: string; count: number }[] | null>(null);
  const [trending, setTrending] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const loadTrending = async () => {
      try {
        const { tags: trendingTags } = await tags.getTrending();
        setTrending(trendingTags);
      } catch (err) {
        console.error('Failed to load trending tags:', err);
      } finally {
        setLoading(false);
      }
    };
    loadTrending();
  }, []);

  const handleSearch = async () => {
    const query = tagInput.trim().replace(/^#/, '');
    if (!query) return;

    setSearchLoading(true);
    try {
      const { tags: results } = await tags.search(query);
      setSearchResults(results);
    } catch (err) {
      console.error('Failed to search tags:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleClear = () => {
    setTagInput('');
    setSearchResults(null);
  };

  const displayTags = searchResults !== null ? searchResults : trending;
  const isSearching = searchResults !== null;

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
