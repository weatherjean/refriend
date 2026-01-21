import { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { users, follows, search, actors, Actor, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { SettingsDrawer } from '../components/SettingsDrawer';
import { useAuth } from '../context/AuthContext';
import { getUsername } from '../utils';
import { Avatar } from '../components/Avatar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { ActorListModal } from '../components/ActorListModal';
import { ProfileHeader } from '../components/ProfileHeader';
import { ProfileTabs } from '../components/ProfileTabs';

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
    return <LoadingSpinner />;
  }

  if (error || !actor) {
    return (
      <div className="alert alert-danger">{error || 'User not found'}</div>
    );
  }

  return (
    <div>
      {/* Header */}
      <ProfileHeader
        actor={actor}
        username={username}
        stats={stats}
        isFollowing={isFollowing}
        isOwnProfile={isOwnProfile}
        followLoading={followLoading}
        loggedIn={!!user}
        onFollow={handleFollow}
        onShowFollowers={() => setShowFollowers(true)}
        onShowFollowing={() => setShowFollowing(true)}
        onShowSettings={() => setShowSettings(true)}
      />

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
      <ProfileTabs
        activeTab={activeTab}
        showBoosts={actor.is_local}
        onTabChange={setActiveTab}
      />

      {/* Posts Content */}
      {activeTab === 'posts' && (
        posts.length === 0 && pinnedPosts.length === 0 ? (
          <EmptyState
            icon={actor.is_local ? 'file-text' : 'globe'}
            title={actor.is_local ? 'No posts yet.' : 'No posts from this user yet.'}
            description={actor.is_local ? undefined : 'New posts will appear after you follow them.'}
          />
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
              <LoadMoreButton loading={loadingMorePosts} onClick={loadMorePosts} />
            )}
          </>
        )
      )}

      {/* Replies Content */}
      {activeTab === 'replies' && (
        !repliesLoaded ? (
          <LoadingSpinner />
        ) : postsWithReplies.length === 0 ? (
          <EmptyState icon="chat" title="No replies yet." />
        ) : (
          <>
            {postsWithReplies.map((post) => (
              <div key={post.id} className="mb-3">
                {/* Show the original post this is replying to */}
                {post.in_reply_to && (
                  <Link to={`/posts/${post.in_reply_to.id}`} className="text-decoration-none d-block mb-2 ms-4 ps-3 border-start border-2 text-muted">
                    <div className="d-flex align-items-center small mb-1">
                      <Avatar
                        src={post.in_reply_to.author?.avatar_url}
                        name={post.in_reply_to.author?.name || post.in_reply_to.author?.handle || '?'}
                        size="xs"
                        className="me-1"
                      />
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
              <LoadMoreButton loading={loadingMoreReplies} onClick={loadMoreReplies} />
            )}
          </>
        )
      )}

      {/* Boosts Content */}
      {activeTab === 'boosts' && (
        !boostsLoaded ? (
          <LoadingSpinner />
        ) : boosts.length === 0 ? (
          <EmptyState icon="arrow-repeat" title="No boosts yet." />
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
              <LoadMoreButton loading={loadingMoreBoosts} onClick={loadMoreBoosts} />
            )}
          </>
        )
      )}

      {/* Followers Modal */}
      <ActorListModal
        show={showFollowers}
        title="Followers"
        actors={followers}
        loading={!followersLoaded}
        onClose={() => setShowFollowers(false)}
        emptyMessage="No followers yet"
      />

      {/* Following Modal */}
      <ActorListModal
        show={showFollowing}
        title="Following"
        actors={following}
        loading={!followingLoaded}
        onClose={() => setShowFollowing(false)}
        emptyMessage="Not following anyone yet"
      />

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
