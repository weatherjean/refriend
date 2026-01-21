import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { search, follows, users, Actor, Post } from '../api';
import { useAuth } from '../context/AuthContext';
import { getUsername } from '../utils';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { PostCard } from '../components/PostCard';
import { PageHeader } from '../components/PageHeader';

export function SearchPage() {
  const { user, actor: currentActor } = useAuth();
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [userResults, setUserResults] = useState<Actor[]>([]);
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [postsLowConfidence, setPostsLowConfidence] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'posts'>('users');
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

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearched(true);
    setMessage('');
    try {
      const { users: userRes, posts: postRes, postsLowConfidence: lowConf } = await search.query(searchQuery.trim());
      setUserResults(userRes || []);
      setPostResults(postRes || []);
      setPostsLowConfidence(lowConf || false);
      // Switch to posts tab if we have post results but no user results
      if (postRes?.length > 0 && (!userRes || userRes.length === 0)) {
        setActiveTab('posts');
      } else {
        setActiveTab('users');
      }
    } catch (err) {
      console.error('Search failed:', err);
      setUserResults([]);
      setPostResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Auto-search if query param is provided
  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
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

  const handleClear = () => {
    setQuery('');
    setSearched(false);
    setUserResults([]);
    setPostResults([]);
    setPostsLowConfidence(false);
  };

  return (
    <div>
      <PageHeader title="Search" icon="search" />

      <div className="card mb-4">
        <div className="card-body">
          <form onSubmit={handleSearch}>
            <label htmlFor="searchInput" className="form-label">
              Search users, communities, and posts
            </label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input
                type="text"
                className="form-control"
                id="searchInput"
                placeholder="Enter a name, @user@domain, or keywords..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={!query.trim() || searching}>
                {searching ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  'Search'
                )}
              </button>
              {searched && (
                <button type="button" className="btn btn-outline-secondary" onClick={handleClear}>
                  <i className="bi bi-x-lg"></i>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {message && (
        <div className="alert alert-info alert-dismissible">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage('')}></button>
        </div>
      )}

      {!searched && (
        <div className="text-muted">
          <h6>Search Tips</h6>
          <ul className="small mb-2">
            <li><strong>Users:</strong> Enter a name or username to find people</li>
            <li><strong>Communities:</strong> Search for community names to find and join groups</li>
            <li><strong>Remote accounts:</strong> Use @user@domain.com format to find users on other servers</li>
            <li><strong>Posts:</strong> Enter 3+ characters to search post content</li>
          </ul>
          <p className="small mb-0">
            Results are limited to 20 matches per category. Be more specific if you don't find what you're looking for.
          </p>
        </div>
      )}

      {searched && (
        <>
          {userResults.length === 0 && postResults.length === 0 ? (
            <EmptyState icon="search" title={`No results found for "${query}"`} />
          ) : (
            <>
              {/* Tabs */}
              <ul className="nav nav-tabs mb-3">
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                  >
                    Users & Communities {userResults.length > 0 && <span className="badge bg-secondary ms-1">{userResults.length}</span>}
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === 'posts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('posts')}
                  >
                    Posts {postResults.length > 0 && <span className="badge bg-secondary ms-1">{postResults.length}</span>}
                  </button>
                </li>
              </ul>

              {/* Users & Communities tab */}
              {activeTab === 'users' && (
                userResults.length === 0 ? (
                  <EmptyState icon="person" title="No users or communities found" />
                ) : (
                  <div className="list-group">
                    {userResults.map((actor) => {
                      const username = getUsername(actor.handle);
                      const isCommunity = actor.actor_type === 'Group';
                      const profileLink = isCommunity ? `/c/${username}` : `/u/${actor.handle}`;
                      const isFollowing = followingSet.has(actor.id);
                      const isSelf = currentActor?.id === actor.id;

                      return (
                        <div key={actor.id} className="list-group-item">
                          <div className="d-flex align-items-center">
                            <Link to={profileLink} className="text-decoration-none text-reset d-flex align-items-center flex-grow-1">
                              <Avatar
                                src={actor.avatar_url}
                                name={username}
                                size="md"
                                className="me-3"
                              />
                              <div className="flex-grow-1">
                                <div className="fw-semibold">
                                  {actor.name || username}
                                  {isCommunity && (
                                    <span className="badge bg-info ms-2" style={{ fontSize: '0.65em', verticalAlign: 'middle' }}>
                                      <i className="bi bi-people-fill me-1"></i>Community
                                    </span>
                                  )}
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
                                  isCommunity ? 'Joined' : 'Following'
                                ) : (
                                  isCommunity ? 'Join' : 'Follow'
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* Posts tab */}
              {activeTab === 'posts' && (
                postResults.length === 0 ? (
                  <EmptyState icon="file-text" title="No posts found" description="Post search requires at least 3 characters" />
                ) : (
                  <div>
                    {postsLowConfidence && (
                      <div className="alert alert-secondary small py-2 mb-3">
                        <i className="bi bi-info-circle-fill me-2"></i>
                        No exact matches found. Showing loosely related posts.
                      </div>
                    )}
                    {postResults.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
