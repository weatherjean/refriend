import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { search, Actor, Post } from '../api';
import { useAuth } from '../context/AuthContext';
import { getUsername } from '../utils';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { PostCard } from '../components/PostCard';
import { SearchForm } from '../components/SearchForm';
import { TabContent } from '../components/TabContent';
import { LoadingButton } from '../components/LoadingButton';
import { useFollowMultiActor } from '../hooks';

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

  const { followingSet, loadingSet: followingInProgress, toggleActorFollow, initFollowingSet } = useFollowMultiActor();

  useEffect(() => {
    initFollowingSet();
  }, [initFollowingSet]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearched(true);
    try {
      const { users: userRes, posts: postRes, postsLowConfidence: lowConf } = await search.query(searchQuery.trim());
      setUserResults(userRes || []);
      setPostResults(postRes || []);
      setPostsLowConfidence(lowConf || false);
      if (postRes?.length > 0 && (!userRes || userRes.length === 0)) {
        setActiveTab('posts');
      } else {
        setActiveTab('users');
      }
    } catch {
      // Error handled by global toast
      setUserResults([]);
      setPostResults([]);
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
    setPostsLowConfidence(false);
  };

  return (
    <div>
      <SearchForm
        placeholder="Search users, communities, posts..."
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
                      const isCommunity = actor.actor_type === 'Group';
                      const profileLink = isCommunity ? `/c/${username}` : `/u/${actor.handle}`;
                      const isFollowing = followingSet.has(actor.id);
                      const isSelf = currentActor?.id === actor.id;

                      return (
                        <div key={actor.id} className="list-group-item">
                          <div className="d-flex align-items-center">
                            <Link to={profileLink} className="text-decoration-none text-reset d-flex align-items-center flex-grow-1">
                              <Avatar src={actor.avatar_url} name={username} size="md" className="me-3" />
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
                              <LoadingButton
                                variant={isFollowing ? 'outline-secondary' : 'outline-primary'}
                                size="sm"
                                loading={followingInProgress.has(actor.id)}
                                onClick={() => toggleActorFollow(actor)}
                              >
                                {isFollowing ? (isCommunity ? 'Joined' : 'Following') : (isCommunity ? 'Join' : 'Follow')}
                              </LoadingButton>
                            )}
                          </div>
                        </div>
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
            </>
          )}
        </>
      )}
    </div>
  );
}
