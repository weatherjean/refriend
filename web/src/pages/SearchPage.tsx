import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { search, follows, users, Actor } from '../api';
import { useAuth } from '../context/AuthContext';
import { getUsername } from '../utils';

export function SearchPage() {
  const { user, actor: currentActor } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Actor[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [followingInProgress, setFollowingInProgress] = useState<Set<string>>(new Set());
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  // Load who the current user is following
  useEffect(() => {
    const loadFollowing = async () => {
      if (!currentActor) return;
      try {
        const username = getUsername(currentActor.handle);
        const { following } = await users.getFollowing(username);
        setFollowingSet(new Set(following.map(a => a.id)));
      } catch {
        // Ignore
      }
    };
    loadFollowing();
  }, [currentActor]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setSearched(true);
    setMessage('');
    try {
      const { results } = await search.query(query.trim());
      setResults(results);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleFollow = async (actor: Actor) => {
    if (!user) return;

    setFollowingInProgress(prev => new Set(prev).add(actor.id));
    setMessage('');
    try {
      const isCurrentlyFollowing = followingSet.has(actor.id);
      if (isCurrentlyFollowing) {
        await follows.unfollow(actor.id);
        setFollowingSet(prev => {
          const next = new Set(prev);
          next.delete(actor.id);
          return next;
        });
        setMessage('Unfollowed');
      } else {
        const response = await follows.follow(actor.handle);
        setFollowingSet(prev => new Set(prev).add(actor.id));
        setMessage(response.message || 'Now following!');
      }
    } catch (err) {
      console.error('Follow/unfollow failed:', err);
      setMessage('Failed');
    } finally {
      setFollowingInProgress(prev => {
        const next = new Set(prev);
        next.delete(actor.id);
        return next;
      });
    }
  };

  return (
    <div>
      <h4 className="mb-4">Search</h4>

      <form onSubmit={handleSearch} className="mb-4">
        <div className="input-group">
          <input
            type="text"
            className="form-control"
            placeholder="Search users..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={searching}>
            {searching ? (
              <span className="spinner-border spinner-border-sm"></span>
            ) : (
              <i className="bi bi-search"></i>
            )}
          </button>
        </div>
        <div className="form-text">
          Search local users, or use @user@domain to find remote accounts
        </div>
      </form>

      {message && (
        <div className="alert alert-info alert-dismissible">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage('')}></button>
        </div>
      )}

      {searched && (
        <>
          {results.length === 0 ? (
            <div className="text-center text-muted py-5">
              <i className="bi bi-search fs-1 mb-3 d-block"></i>
              <p>No results found for "{query}"</p>
            </div>
          ) : (
            <div className="list-group">
              {results.map((actor) => {
                const username = getUsername(actor.handle);
                const profileLink = `/u/${actor.handle}`;
                const isFollowing = followingSet.has(actor.id);
                const isSelf = currentActor?.id === actor.id;

                return (
                  <div key={actor.id} className="list-group-item">
                    <div className="d-flex align-items-center">
                      <Link to={profileLink} className="text-decoration-none text-reset d-flex align-items-center flex-grow-1">
                        {actor.avatar_url ? (
                          <img
                            src={actor.avatar_url}
                            alt=""
                            className="rounded-circle me-3"
                            style={{ width: 40, height: 40, objectFit: 'cover' }}
                          />
                        ) : (
                          <div className="avatar avatar-sm me-3">
                            {username[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-grow-1">
                          <div className="fw-semibold">
                            {actor.name || username}
                          </div>
                          <small className="text-muted">{actor.handle}</small>
                        </div>
                        {!actor.is_local && (
                          <i className="bi bi-globe text-muted me-3"></i>
                        )}
                      </Link>
                      {user && !isSelf && (
                        <button
                          className={`btn btn-sm ${isFollowing ? 'btn-outline-secondary' : 'btn-outline-primary'}`}
                          onClick={() => handleFollow(actor)}
                          disabled={followingInProgress.has(actor.id)}
                        >
                          {followingInProgress.has(actor.id) ? (
                            <span className="spinner-border spinner-border-sm"></span>
                          ) : isFollowing ? (
                            'Following'
                          ) : (
                            'Follow'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
