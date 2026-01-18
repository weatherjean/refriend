import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { tags } from '../api';

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
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
      <h4 className="mb-4">Explore Tags</h4>

      <div className="card mb-4">
        <div className="card-body">
          <form onSubmit={handleSearch}>
            <label htmlFor="tagInput" className="form-label">
              Search for a hashtag
            </label>
            <div className="input-group">
              <span className="input-group-text">#</span>
              <input
                type="text"
                className="form-control"
                id="tagInput"
                placeholder="Enter a tag name..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={!tagInput.trim() || searchLoading}>
                {searchLoading ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <><i className="bi bi-search me-1"></i> Search</>
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
        {isSearching ? `Results for "#${tagInput.trim().replace(/^#/, '')}"` : 'Trending Tags'}
      </h5>

      {loading && !isSearching ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary"></div>
        </div>
      ) : displayTags.length === 0 ? (
        <div className="text-center text-muted py-4">
          <i className="bi bi-hash fs-1 mb-3 d-block"></i>
          {isSearching ? (
            <p>No tags found matching "#{tagInput.trim().replace(/^#/, '')}"</p>
          ) : (
            <>
              <p>No trending tags yet.</p>
              <p className="small">Start posting with hashtags to see trends!</p>
            </>
          )}
        </div>
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
