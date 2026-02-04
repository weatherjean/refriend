import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { search, tags, feeds as feedsApi, Actor, Post, Feed, ExternalCommunity } from '../api';
import { getUsername, getProfileLink } from '../utils';
import { Avatar } from '../components/Avatar';
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
  const [feedResults, setFeedResults] = useState<Feed[]>([]);
  const [postsLowConfidence, setPostsLowConfidence] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'posts' | 'tags' | 'feeds' | 'fediverse'>('users');
  const [externalResults, setExternalResults] = useState<ExternalCommunity[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const navigate = useNavigate();

  const performSearch = async (searchQuery: string) => {
    let trimmed = searchQuery.trim();
    if (!trimmed) return;

    // Convert Lemmy community syntax (!community@instance) to ActivityPub (@community@instance)
    if (trimmed.startsWith('!') && trimmed.includes('@')) {
      trimmed = '@' + trimmed.slice(1);
    }

    setSearching(true);
    setSearched(true);
    try {
      const cleanTag = trimmed.replace(/^#/, '');
      const [searchRes, tagRes, feedRes] = await Promise.allSettled([
        search.query(trimmed),
        tags.search(cleanTag),
        feedsApi.search(trimmed),
      ]);
      const userRes = searchRes.status === 'fulfilled' ? searchRes.value.users : [];
      const postRes = searchRes.status === 'fulfilled' ? searchRes.value.posts : [];
      const lowConf = searchRes.status === 'fulfilled' ? searchRes.value.postsLowConfidence : false;
      const tagList = tagRes.status === 'fulfilled' ? (tagRes.value.tags || []).slice(0, 20) : [];
      const feedList = feedRes.status === 'fulfilled' ? feedRes.value.feeds : [];
      setUserResults(userRes || []);
      setPostResults(postRes || []);
      setTagResults(tagList);
      setFeedResults(feedList);
      setPostsLowConfidence(lowConf || false);
      if (userRes?.length > 0) {
        setActiveTab('users');
      } else if (postRes?.length > 0) {
        setActiveTab('posts');
      } else if (tagList.length > 0) {
        setActiveTab('tags');
      } else if (feedList.length > 0) {
        setActiveTab('feeds');
      } else {
        setActiveTab('users');
      }
    } catch {
      // Error handled by global toast
      setUserResults([]);
      setPostResults([]);
      setTagResults([]);
      setFeedResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleExternalSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setExternalLoading(true);
    setExternalError(null);
    try {
      const res = await search.external(trimmed);
      setExternalResults(res.communities || []);
    } catch {
      setExternalError('Failed to search Lemmy communities');
      setExternalResults([]);
    } finally {
      setExternalLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSearched(false);
    setUserResults([]);
    setPostResults([]);
    setTagResults([]);
    setFeedResults([]);
    setExternalResults([]);
    setExternalError(null);
    setPostsLowConfidence(false);
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
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === 'feeds' ? 'active' : ''}`}
                    onClick={() => setActiveTab('feeds')}
                  >
                    Feeds {feedResults.length > 0 && <span className="badge bg-secondary ms-1">{feedResults.length}</span>}
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === 'fediverse' ? 'active' : ''}`}
                    onClick={() => setActiveTab('fediverse')}
                  >
                    <i className="bi bi-globe2 me-1"></i>Fediverse {externalResults.length > 0 && <span className="badge bg-secondary ms-1">{externalResults.length}</span>}
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

              <TabContent
                loading={false}
                empty={activeTab === 'feeds' && feedResults.length === 0}
                emptyIcon="collection"
                emptyTitle="No feeds found"
              >
                {activeTab === 'feeds' && (
                  <div className="list-group">
                    {feedResults.map((feed) => (
                      <Link
                        key={feed.slug}
                        to={`/feeds/${feed.slug}`}
                        className="list-group-item list-group-item-action d-flex justify-content-between align-items-start"
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="fw-semibold">{feed.name}</div>
                          <small className="text-muted">/feeds/{feed.slug}</small>
                          {feed.description && (
                            <div className="text-muted small mt-1 text-truncate">{feed.description}</div>
                          )}
                        </div>
                        {feed.bookmark_count !== undefined && (
                          <span className="badge text-bg-secondary ms-2 flex-shrink-0">
                            {feed.bookmark_count} <i className="bi bi-bookmark"></i>
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </TabContent>

              {activeTab === 'fediverse' && (
                <div>
                  {externalResults.length === 0 && !externalLoading && !externalError && (
                    <div className="text-center py-4">
                      <button
                        className="btn btn-outline-primary mb-3"
                        onClick={handleExternalSearch}
                        disabled={!query.trim()}
                      >
                        <i className="bi bi-search me-2"></i>Search Lemmy communities
                      </button>
                      <p className="text-muted small mb-0">
                        Searches lemmy.world for communities across the Lemmyverse.
                      </p>
                    </div>
                  )}
                  {externalLoading && (
                    <div className="text-center py-4">
                      <div className="spinner-border spinner-border-sm text-primary" role="status">
                        <span className="visually-hidden">Searching...</span>
                      </div>
                      <p className="text-muted small mt-2 mb-0">Searching Lemmy communities...</p>
                    </div>
                  )}
                  {externalError && (
                    <div className="alert alert-danger small py-2">{externalError}</div>
                  )}
                  {externalResults.length > 0 && (
                    <div className="list-group">
                      {externalResults.map((community) => {
                        const handle = `${community.name}@${new URL(community.actor_id).hostname}`;
                        return (
                          <button
                            key={community.actor_id}
                            className="list-group-item list-group-item-action"
                            onClick={() => navigate(`/a/${handle}`)}
                          >
                            <div className="d-flex align-items-center gap-3">
                              <Avatar src={community.icon} name={community.name} size="md" className="flex-shrink-0" />
                              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                <div className="fw-semibold text-truncate">{community.title || community.name}</div>
                                <small className="text-muted d-block text-truncate">!{handle}</small>
                                <div className="d-flex gap-3 mt-1">
                                  <small className="text-muted">{community.subscribers.toLocaleString()} subscribers</small>
                                  <small className="text-muted">{community.users_active_month.toLocaleString()} active/mo</small>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
          </>
        </>
      )}
    </div>
  );
}
