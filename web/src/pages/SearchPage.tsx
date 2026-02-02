import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { search, tags, ExternalCommunity, Actor, Post } from '../api';
import { getUsername, getProfileLink } from '../utils';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { PostCard } from '../components/PostCard';
import { SearchForm } from '../components/SearchForm';
import { TabContent } from '../components/TabContent';

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [userResults, setUserResults] = useState<Actor[]>([]);
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [tagResults, setTagResults] = useState<{ name: string; count: number }[]>([]);
  const [postsLowConfidence, setPostsLowConfidence] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'posts' | 'tags'>('users');

  // External community discovery
  const [externalResults, setExternalResults] = useState<Record<string, ExternalCommunity[]>>({});
  const [externalLoading, setExternalLoading] = useState<Record<string, boolean>>({});
  const [externalError, setExternalError] = useState<Record<string, string | null>>({});
  const [showLemmyInfo, setShowLemmyInfo] = useState(false);
  const navigate = useNavigate();

  const searchExternal = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setExternalLoading(prev => ({ ...prev, lemmy: true }));
    setExternalError(prev => ({ ...prev, lemmy: null }));
    try {
      const { communities } = await search.external(trimmed, 'lemmy');
      setExternalResults(prev => ({ ...prev, lemmy: communities }));
    } catch {
      setExternalError(prev => ({ ...prev, lemmy: 'Failed to search' }));
    } finally {
      setExternalLoading(prev => ({ ...prev, lemmy: false }));
    }
  };

  const getHandleFromActorId = (actorId: string): string => {
    // actor_id looks like https://lemmy.ml/c/memes → extract community@instance
    try {
      const url = new URL(actorId);
      const parts = url.pathname.split('/').filter(Boolean);
      const name = parts[parts.length - 1];
      return `${name}@${url.host}`;
    } catch {
      return actorId;
    }
  };

  const performSearch = async (searchQuery: string) => {
    let trimmed = searchQuery.trim();
    if (!trimmed) return;

    // Convert Lemmy community syntax (!community@instance) to ActivityPub (@community@instance)
    if (trimmed.startsWith('!') && trimmed.includes('@')) {
      trimmed = '@' + trimmed.slice(1);
    }

    setSearching(true);
    setSearched(true);
    setExternalResults({});
    setExternalError({});
    try {
      const cleanTag = trimmed.replace(/^#/, '');
      const [searchRes, tagRes] = await Promise.allSettled([
        search.query(trimmed),
        tags.search(cleanTag),
      ]);
      const userRes = searchRes.status === 'fulfilled' ? searchRes.value.users : [];
      const postRes = searchRes.status === 'fulfilled' ? searchRes.value.posts : [];
      const lowConf = searchRes.status === 'fulfilled' ? searchRes.value.postsLowConfidence : false;
      const tagList = tagRes.status === 'fulfilled' ? (tagRes.value.tags || []).slice(0, 20) : [];
      setUserResults(userRes || []);
      setPostResults(postRes || []);
      setTagResults(tagList);
      setPostsLowConfidence(lowConf || false);
      if (userRes?.length > 0) {
        setActiveTab('users');
      } else if (postRes?.length > 0) {
        setActiveTab('posts');
      } else if (tagList.length > 0) {
        setActiveTab('tags');
      } else {
        setActiveTab('users');
      }
    } catch {
      // Error handled by global toast
      setUserResults([]);
      setPostResults([]);
      setTagResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleClear = () => {
    setQuery('');
    setSearched(false);
    setUserResults([]);
    setPostResults([]);
    setTagResults([]);
    setPostsLowConfidence(false);
    setExternalResults({});
    setExternalError({});
  };

  return (
    <div>
      <SearchForm
        placeholder="Search users, communities, posts, tags..."
        value={query}
        onChange={setQuery}
        onSubmit={() => performSearch(query)}
        onClear={handleClear}
        loading={searching}
        showClear={searched}
      />

      {!searched && (
        <div className="text-muted">
          <h6>Search Tips</h6>
          <ul className="small mb-2">
            <li><strong>Users:</strong> Enter a name or username to find people</li>
            <li><strong>Communities:</strong> Search for community names to find and join groups</li>
            <li><strong>Remote accounts:</strong> Use @user@domain.com format to find users on other servers</li>
            <li><strong>Posts:</strong> Enter 3+ characters to search post content</li>
            <li><strong>Tags:</strong> Search for hashtags by name</li>
          </ul>
          <p className="small mb-0">
            Results are limited to 20 matches per category. Be more specific if you don't find what you're looking for.
          </p>
        </div>
      )}

      {searched && (
        <>
          {/* External community discovery */}
          <div className="mb-3">
            <div className="d-flex align-items-center gap-2">
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => searchExternal()}
                disabled={externalLoading['lemmy']}
              >
                {externalLoading['lemmy'] ? (
                  <span className="spinner-border spinner-border-sm me-1" />
                ) : (
                  <i className="bi bi-globe2 me-1"></i>
                )}
                Search Lemmy communities
              </button>
              <i
                className="bi bi-info-circle text-muted"
                style={{ cursor: 'pointer' }}
                onClick={() => setShowLemmyInfo(v => !v)}
              ></i>
            </div>
            {showLemmyInfo && (
              <p className="text-muted small mt-1 mb-0">
                lemmy.world federates with most Lemmy and PieFed instances, so this is a pretty exhaustive fediverse community search.
              </p>
            )}

            {(() => {
              const results = externalResults['lemmy'];
              const error = externalError['lemmy'];
              if (!results && !error) return null;
              return (
                <div className="mt-2">
                  <h6 className="text-muted small text-uppercase">
                    Lemmy Communities
                  </h6>
                  {error && (
                    <div className="alert alert-warning small py-2">{error}</div>
                  )}
                  {results && results.length === 0 && (
                    <p className="text-muted small">No communities found.</p>
                  )}
                  {results && results.length > 0 && (
                    <div className="list-group mb-2">
                      {results.map(community => {
                        const handle = getHandleFromActorId(community.actor_id);
                        return (
                          <button
                            key={community.actor_id}
                            className="list-group-item list-group-item-action"
                            onClick={() => navigate(`/a/${handle}`)}
                          >
                            <div className="d-flex align-items-center gap-3">
                              <Avatar src={community.icon} name={community.name} size="md" className="flex-shrink-0" />
                              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                <div className="d-flex align-items-center gap-1">
                                  <span className="fw-semibold text-truncate">{community.title}</span>
                                  <span className="badge" style={{ fontSize: '0.65em', backgroundColor: '#4ade80', color: '#000' }}>
                                    <i className="bi bi-people-fill me-1"></i>Group
                                  </span>
                                </div>
                                <small className="text-muted d-block text-truncate">{handle}</small>
                                {community.description && (
                                  <small className="text-muted d-none d-md-block text-truncate mt-1">
                                    {community.description.slice(0, 200)}
                                  </small>
                                )}
                                <small className="text-muted">
                                  {community.subscribers.toLocaleString()} subscribers
                                  {community.users_active_month > 0 && ` · ${community.users_active_month.toLocaleString()} active/mo`}
                                </small>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {userResults.length === 0 && postResults.length === 0 && tagResults.length === 0 ? (
            <EmptyState icon="search" title={`No results found for "${query}"`} />
          ) : (
            <>
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
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === 'tags' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tags')}
                  >
                    Tags {tagResults.length > 0 && <span className="badge bg-secondary ms-1">{tagResults.length}</span>}
                  </button>
                </li>
              </ul>

              <TabContent
                loading={false}
                empty={activeTab === 'users' && userResults.length === 0}
                emptyIcon="person"
                emptyTitle="No users or communities found"
              >
                {activeTab === 'users' && (
                  <div className="list-group">
                    {userResults.map((actor) => {
                      const username = getUsername(actor.handle);
                      const profileLink = getProfileLink(actor);

                      return (
                        <Link
                          key={actor.id}
                          to={profileLink}
                          className="list-group-item list-group-item-action"
                        >
                          <div className="d-flex align-items-center gap-3">
                            <Avatar src={actor.avatar_url} name={username} size="md" className="flex-shrink-0" />
                            <div className="flex-grow-1" style={{ minWidth: 0 }}>
                              <div className="d-flex align-items-center gap-1">
                                <span className="fw-semibold text-truncate">
                                  {actor.name || username}
                                </span>
                                {!actor.is_local && (
                                  <i className="bi bi-globe2 flex-shrink-0" style={{ fontSize: '0.8em', color: '#fbbf24' }}></i>
                                )}
                              </div>
                              {actor.actor_type === 'Group' && (
                                <span className="badge" style={{ fontSize: '0.65em', backgroundColor: '#4ade80', color: '#000' }}>
                                  <i className="bi bi-people-fill me-1"></i>Group
                                </span>
                              )}
                              <small className="text-muted d-block text-truncate">{actor.handle}</small>
                              {actor.bio && (
                                <small className="text-muted d-none d-md-block text-truncate mt-1">{actor.bio.replace(/<[^>]*>/g, '')}</small>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </TabContent>

              <TabContent
                loading={false}
                empty={activeTab === 'posts' && postResults.length === 0}
                emptyIcon="file-text"
                emptyTitle="No posts found"
                emptyDescription="Post search requires at least 3 characters"
              >
                {activeTab === 'posts' && (
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
                )}
              </TabContent>

              <TabContent
                loading={false}
                empty={activeTab === 'tags' && tagResults.length === 0}
                emptyIcon="hash"
                emptyTitle="No tags found"
              >
                {activeTab === 'tags' && (
                  <div className="list-group">
                    {tagResults.map((tag) => (
                      <Link
                        key={tag.name}
                        to={`/tags/${encodeURIComponent(tag.name)}`}
                        className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                      >
                        <span className="fw-semibold">#{tag.name}</span>
                        <span className="badge text-bg-secondary rounded-pill">
                          {tag.count} {tag.count === 1 ? 'post' : 'posts'}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </TabContent>
            </>
          )}
        </>
      )}
    </div>
  );
}
