import { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { users, follows, search, actors, Actor, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { SettingsDrawer } from '../components/SettingsDrawer';
import { useAuth } from '../context/AuthContext';
import { getUsername } from '../utils';

export function ActorPage() {
  const location = useLocation();
  const { user } = useAuth();

  // State
  const [actor, setActor] = useState<Actor | null>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [posts, setPosts] = useState<Post[]>([]);
  const [pinnedPosts, setPinnedPosts] = useState<Post[]>([]);
  const [postsWithReplies, setPostsWithReplies] = useState<Post[]>([]);
  const [boosts, setBoosts] = useState<Post[]>([]);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [boostsLoaded, setBoostsLoaded] = useState(false);

  // Pagination cursors
  const [postsCursor, setPostsCursor] = useState<number | null>(null);
  const [repliesCursor, setRepliesCursor] = useState<number | null>(null);
  const [boostsCursor, setBoostsCursor] = useState<number | null>(null);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [loadingMoreReplies, setLoadingMoreReplies] = useState(false);
  const [loadingMoreBoosts, setLoadingMoreBoosts] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'boosts'>('posts');
  const [followers, setFollowers] = useState<Actor[]>([]);
  const [following, setFollowing] = useState<Actor[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followLoading, setFollowLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isLocalUser, setIsLocalUser] = useState(false);
  const [followersLoaded, setFollowersLoaded] = useState(false);
  const [followingLoaded, setFollowingLoaded] = useState(false);

  // Extract handle from URL: /u/@user@domain -> @user@domain
  const fullHandle = location.pathname.replace(/^\/u\//, '');
  const username = getUsername(fullHandle);

  const loadProfile = useCallback(async () => {
    if (!fullHandle) return;

    setLoading(true);
    setError('');
    setMessage('');
    setRepliesLoaded(false);
    setBoostsLoaded(false);
    setPostsWithReplies([]);
    setBoosts([]);
    setPinnedPosts([]);
    setActiveTab('posts');
    setPostsCursor(null);
    setRepliesCursor(null);
    setBoostsCursor(null);
    setFollowersLoaded(false);
    setFollowingLoaded(false);
    setFollowers([]);
    setFollowing([]);

    try {
      // Check if the domain matches our current host (local user even with full handle)
      const handleParts = fullHandle.replace(/^@/, '').split('@');
      const handleDomain = handleParts.length > 1 ? handleParts[1] : null;
      const isLikelyLocal = !handleDomain || handleDomain === window.location.host;

      // Always try local user endpoint first (it's fast and will 404 if not found)
      if (isLikelyLocal) {
        try {
          const profileData = await users.get(username);
          setActor(profileData.actor);
          setStats(profileData.stats);
          setIsFollowing(profileData.is_following);
          setIsOwnProfile(profileData.is_own_profile);
          setIsLocalUser(true);

          // Load posts and pinned in parallel (defer followers/following until needed)
          const [postsData, pinnedData] = await Promise.all([
            users.getPosts(username),
            users.getPinned(username),
          ]);

          setPosts(postsData.posts);
          setPostsCursor(postsData.next_cursor);
          setPinnedPosts(pinnedData.posts);
          setLoading(false);
          return;
        } catch {
          // Not a local user, fall through to remote search
        }
      }

      // Search for remote user
      const { results } = await search.query(fullHandle);
      if (results.length > 0) {
        const remoteActor = results[0];
        setActor(remoteActor);
        setStats({ followers: 0, following: 0 });
        setFollowers([]);
        setFollowing([]);
        setIsLocalUser(false);

        // Fetch follow status and posts (skip pinned for remote - too slow)
        const [actorData, postsData] = await Promise.all([
          actors.get(remoteActor.id).catch(() => ({ is_following: false, is_own_profile: false })),
          actors.getPosts(remoteActor.id).catch(() => ({ posts: [], next_cursor: null })),
        ]);

        setIsFollowing(actorData.is_following);
        setIsOwnProfile(actorData.is_own_profile);
        setPosts(postsData.posts);
        setPostsCursor(postsData.next_cursor);

        // Load pinned posts in background (slow for remote actors)
        actors.getPinned(remoteActor.id).then(data => setPinnedPosts(data.posts)).catch(() => {});
      } else {
        setError('User not found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [fullHandle, username]);

  const loadReplies = useCallback(async () => {
    if (!actor || repliesLoaded) return;

    try {
      const postsData = isLocalUser
        ? await users.getReplies(username)
        : await actors.getReplies(actor.id);
      setPostsWithReplies(postsData.posts);
      setRepliesCursor(postsData.next_cursor);
      setRepliesLoaded(true);
    } catch (err) {
      console.error('Failed to load replies:', err);
    }
  }, [actor, repliesLoaded, isLocalUser, username]);

  const loadBoosts = useCallback(async () => {
    if (!actor || boostsLoaded) return;

    try {
      const postsData = await actors.getBoosts(actor.id);
      setBoosts(postsData.posts);
      setBoostsCursor(postsData.next_cursor);
      setBoostsLoaded(true);
    } catch (err) {
      console.error('Failed to load boosts:', err);
      setBoostsLoaded(true); // Prevent infinite spinner on error
    }
  }, [actor, boostsLoaded]);

  const loadMorePosts = useCallback(async () => {
    if (!actor || !postsCursor || loadingMorePosts) return;
    setLoadingMorePosts(true);
    try {
      const postsData = isLocalUser
        ? await users.getPosts(username, { before: postsCursor })
        : await actors.getPosts(actor.id, { before: postsCursor });
      setPosts(prev => [...prev, ...postsData.posts]);
      setPostsCursor(postsData.next_cursor);
    } catch (err) {
      console.error('Failed to load more posts:', err);
    } finally {
      setLoadingMorePosts(false);
    }
  }, [actor, postsCursor, loadingMorePosts, isLocalUser, username]);

  const loadMoreReplies = useCallback(async () => {
    if (!actor || !repliesCursor || loadingMoreReplies) return;
    setLoadingMoreReplies(true);
    try {
      const postsData = isLocalUser
        ? await users.getReplies(username, { before: repliesCursor })
        : await actors.getReplies(actor.id, { before: repliesCursor });
      setPostsWithReplies(prev => [...prev, ...postsData.posts]);
      setRepliesCursor(postsData.next_cursor);
    } catch (err) {
      console.error('Failed to load more replies:', err);
    } finally {
      setLoadingMoreReplies(false);
    }
  }, [actor, repliesCursor, loadingMoreReplies, isLocalUser, username]);

  const loadMoreBoosts = useCallback(async () => {
    if (!actor || !boostsCursor || loadingMoreBoosts) return;
    setLoadingMoreBoosts(true);
    try {
      const postsData = await actors.getBoosts(actor.id, { before: boostsCursor });
      setBoosts(prev => [...prev, ...postsData.posts]);
      setBoostsCursor(postsData.next_cursor);
    } catch (err) {
      console.error('Failed to load more boosts:', err);
    } finally {
      setLoadingMoreBoosts(false);
    }
  }, [actor, boostsCursor, loadingMoreBoosts]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Load replies when switching to replies tab
  useEffect(() => {
    if (activeTab === 'replies' && !repliesLoaded) {
      loadReplies();
    }
  }, [activeTab, repliesLoaded, loadReplies]);

  // Load boosts when switching to boosts tab
  useEffect(() => {
    if (activeTab === 'boosts' && !boostsLoaded) {
      loadBoosts();
    }
  }, [activeTab, boostsLoaded, loadBoosts]);

  // Load followers when modal opens
  useEffect(() => {
    if (showFollowers && !followersLoaded && isLocalUser) {
      users.getFollowers(username).then(data => {
        setFollowers(data.followers);
        setFollowersLoaded(true);
      }).catch(() => {});
    }
  }, [showFollowers, followersLoaded, isLocalUser, username]);

  // Load following when modal opens
  useEffect(() => {
    if (showFollowing && !followingLoaded && isLocalUser) {
      users.getFollowing(username).then(data => {
        setFollowing(data.following);
        setFollowingLoaded(true);
      }).catch(() => {});
    }
  }, [showFollowing, followingLoaded, isLocalUser, username]);

  const handleFollow = async () => {
    if (!actor || !user) return;

    setFollowLoading(true);
    setMessage('');
    try {
      if (isFollowing) {
        await follows.unfollow(actor.id);
        setIsFollowing(false);
        setStats(s => ({ ...s, followers: Math.max(0, s.followers - 1) }));
        setMessage('Unfollowed');
      } else {
        const response = await follows.follow(actor.handle);
        setIsFollowing(true);
        setStats(s => ({ ...s, followers: s.followers + 1 }));
        setMessage(response.message || 'Now following!');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  if (error || !actor) {
    return (
      <div className="alert alert-danger">{error || 'User not found'}</div>
    );
  }

  const displayName = actor.name || username;

  return (
    <div>
      {/* Header */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex align-items-start">
            {actor.avatar_url ? (
              <img
                src={actor.avatar_url}
                alt=""
                className="rounded-circle me-3"
                style={{ width: 80, height: 80, objectFit: 'cover' }}
              />
            ) : (
              <div className="avatar avatar-lg me-3">
                {username[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-grow-1">
              <h4 className="mb-0">{displayName}</h4>
              <div className="text-muted">{actor.handle}</div>

              {!actor.is_local && (
                <span className="badge bg-secondary mt-1">
                  <i className="bi bi-globe me-1"></i>Remote
                </span>
              )}

              {actor.bio && (
                <div className="mt-2" dangerouslySetInnerHTML={{ __html: actor.bio }} />
              )}

              {/* Stats - only for local actors */}
              {actor.is_local && (
                <div className="mt-2">
                  <button
                    className="btn btn-link text-decoration-none p-0 me-3"
                    onClick={() => setShowFollowing(true)}
                  >
                    <strong>{stats.following}</strong>{' '}
                    <span className="text-muted">Following</span>
                  </button>
                  <button
                    className="btn btn-link text-decoration-none p-0"
                    onClick={() => setShowFollowers(true)}
                  >
                    <strong>{stats.followers}</strong>{' '}
                    <span className="text-muted">Followers</span>
                  </button>
                </div>
              )}
            </div>

            {user && !isOwnProfile && (
              <div>
                <button
                  className={`btn ${isFollowing ? 'btn-outline-primary' : 'btn-primary'}`}
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? (
                    <span className="spinner-border spinner-border-sm"></span>
                  ) : isFollowing ? (
                    'Following'
                  ) : (
                    'Follow'
                  )}
                </button>
              </div>
            )}

            {user && isOwnProfile && (
              <div>
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => setShowSettings(true)}
                >
                  <i className="bi bi-gear me-1"></i> Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div className="alert alert-info alert-dismissible">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage('')}></button>
        </div>
      )}

      {/* External link for remote actors */}
      {!actor.is_local && actor.url && (
        <p>
          <a href={actor.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
            <i className="bi bi-box-arrow-up-right me-1"></i>
            View on {new URL(actor.url).host}
          </a>
        </p>
      )}

      {/* Posts Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'posts' ? 'active' : ''}`}
            onClick={() => setActiveTab('posts')}
          >
            Posts
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'replies' ? 'active' : ''}`}
            onClick={() => setActiveTab('replies')}
          >
            Replies
          </button>
        </li>
        {actor.is_local && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'boosts' ? 'active' : ''}`}
              onClick={() => setActiveTab('boosts')}
            >
              Boosts
            </button>
          </li>
        )}
      </ul>

      {/* Posts Content */}
      {activeTab === 'posts' && (
        posts.length === 0 && pinnedPosts.length === 0 ? (
          <div className="text-center text-muted py-5">
            {actor.is_local ? (
              <p>No posts yet.</p>
            ) : (
              <>
                <i className="bi bi-globe fs-1 mb-3 d-block"></i>
                <p>No posts from this user yet. New posts will appear after you follow them.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Pinned posts first */}
            {pinnedPosts.map((post) => (
              <div key={`pinned-${post.id}`} className="position-relative">
                <span className="badge bg-warning text-dark position-absolute" style={{ top: 8, right: 8, zIndex: 1 }}>
                  <i className="bi bi-pin-fill me-1"></i>Pinned
                </span>
                <PostCard post={post} />
              </div>
            ))}
            {/* Regular posts (excluding pinned to avoid duplicates) */}
            {posts.filter(p => !pinnedPosts.some(pp => pp.id === p.id)).map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
            {postsCursor && (
              <div className="text-center py-3">
                <button
                  className="btn btn-outline-primary"
                  onClick={loadMorePosts}
                  disabled={loadingMorePosts}
                >
                  {loadingMorePosts ? (
                    <><span className="spinner-border spinner-border-sm me-1"></span> Loading...</>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )
      )}

      {/* Replies Content */}
      {activeTab === 'replies' && (
        !repliesLoaded ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary"></div>
          </div>
        ) : postsWithReplies.length === 0 ? (
          <div className="text-center text-muted py-5">
            <p>No replies yet.</p>
          </div>
        ) : (
          <>
            {postsWithReplies.map((post) => (
              <div key={post.id} className="mb-3">
                {/* Show the original post this is replying to */}
                {post.in_reply_to && (
                  <Link to={`/posts/${post.in_reply_to.id}`} className="text-decoration-none d-block mb-2 ms-4 ps-3 border-start border-2 text-muted">
                    <div className="d-flex align-items-center small mb-1">
                      {post.in_reply_to.author?.avatar_url ? (
                        <img
                          src={post.in_reply_to.author.avatar_url}
                          alt=""
                          className="rounded-circle me-1"
                          style={{ width: 16, height: 16, objectFit: 'cover' }}
                        />
                      ) : (
                        <span className="me-1">@</span>
                      )}
                      <span>{post.in_reply_to.author?.name || post.in_reply_to.author?.handle || 'Unknown'}</span>
                    </div>
                    <div
                      className="small"
                      style={{ maxHeight: '2.5em', overflow: 'hidden', opacity: 0.8 }}
                      dangerouslySetInnerHTML={{ __html: post.in_reply_to.content }}
                    />
                  </Link>
                )}
                <PostCard post={post} />
              </div>
            ))}
            {repliesCursor && (
              <div className="text-center py-3">
                <button
                  className="btn btn-outline-primary"
                  onClick={loadMoreReplies}
                  disabled={loadingMoreReplies}
                >
                  {loadingMoreReplies ? (
                    <><span className="spinner-border spinner-border-sm me-1"></span> Loading...</>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )
      )}

      {/* Boosts Content */}
      {activeTab === 'boosts' && (
        !boostsLoaded ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary"></div>
          </div>
        ) : boosts.length === 0 ? (
          <div className="text-center text-muted py-5">
            <p>No boosts yet.</p>
          </div>
        ) : (
          <>
            {boosts.map((post) => (
              <div key={post.id} className="position-relative">
                <span className="badge bg-success position-absolute" style={{ top: 8, right: 8, zIndex: 1 }}>
                  <i className="bi bi-arrow-repeat me-1"></i>Boosted
                </span>
                <PostCard post={post} />
              </div>
            ))}
            {boostsCursor && (
              <div className="text-center py-3">
                <button
                  className="btn btn-outline-primary"
                  onClick={loadMoreBoosts}
                  disabled={loadingMoreBoosts}
                >
                  {loadingMoreBoosts ? (
                    <><span className="spinner-border spinner-border-sm me-1"></span> Loading...</>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )
      )}

      {/* Followers Modal */}
      {showFollowers && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowFollowers(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Followers</h5>
                <button className="btn-close" onClick={() => setShowFollowers(false)}></button>
              </div>
              <div className="modal-body">
                {!followersLoaded ? (
                  <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>
                ) : followers.length === 0 ? (
                  <p className="text-muted">No followers yet</p>
                ) : (
                  <div className="list-group list-group-flush">
                    {followers.map((a) => (
                      <Link
                        key={a.id}
                        to={`/u/${a.handle}`}
                        className="list-group-item list-group-item-action"
                        onClick={() => setShowFollowers(false)}
                      >
                        <div className="d-flex align-items-center">
                          {a.avatar_url ? (
                            <img
                              src={a.avatar_url}
                              alt=""
                              className="rounded-circle me-2"
                              style={{ width: 32, height: 32, objectFit: 'cover' }}
                            />
                          ) : (
                            <div className="avatar avatar-sm me-2">{getUsername(a.handle)[0].toUpperCase()}</div>
                          )}
                          <div>
                            <div className="fw-semibold">{a.name || getUsername(a.handle)}</div>
                            <small className="text-muted">{a.handle}</small>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Following Modal */}
      {showFollowing && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowFollowing(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Following</h5>
                <button className="btn-close" onClick={() => setShowFollowing(false)}></button>
              </div>
              <div className="modal-body">
                {!followingLoaded ? (
                  <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>
                ) : following.length === 0 ? (
                  <p className="text-muted">Not following anyone yet</p>
                ) : (
                  <div className="list-group list-group-flush">
                    {following.map((a) => (
                      <Link
                        key={a.id}
                        to={`/u/${a.handle}`}
                        className="list-group-item list-group-item-action"
                        onClick={() => setShowFollowing(false)}
                      >
                        <div className="d-flex align-items-center">
                          {a.avatar_url ? (
                            <img
                              src={a.avatar_url}
                              alt=""
                              className="rounded-circle me-2"
                              style={{ width: 32, height: 32, objectFit: 'cover' }}
                            />
                          ) : (
                            <div className="avatar avatar-sm me-2">{getUsername(a.handle)[0].toUpperCase()}</div>
                          )}
                          <div>
                            <div className="fw-semibold">{a.name || getUsername(a.handle)}</div>
                            <small className="text-muted">{a.handle}</small>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Drawer */}
      {showSettings && actor && (
        <SettingsDrawer
          actor={actor}
          onClose={() => setShowSettings(false)}
          onSave={(updated) => setActor(updated)}
        />
      )}
    </div>
  );
}
