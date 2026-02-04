import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { users, follows, search, actors, Actor, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getUsername, getDomain } from '../utils';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { ActorListModal } from '../components/ActorListModal';
import { ProfileHeader } from '../components/ProfileHeader';
import { ProfileTabs } from '../components/ProfileTabs';
import { ProfileSettingsTab } from '../components/ProfileSettingsTab';
import { TabContent } from '../components/TabContent';
import { SortToggle } from '../components/SortToggle';
import { ReplyThread } from '../components/PostThread';
import { usePagination } from '../hooks';

export function ActorPage() {
  const location = useLocation();
  const { user, logout } = useAuth();

  // Core profile state
  const [actor, setActor] = useState<Actor | null>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [pinnedPosts, setPinnedPosts] = useState<Post[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followStatus, setFollowStatus] = useState<'pending' | 'accepted' | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isLocalUser, setIsLocalUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'boosts' | 'boosts_posts' | 'settings'>('posts');
  const [postSort, setPostSort] = useState<'new' | 'hot'>('new');

  // Follower/following state
  const [followers, setFollowers] = useState<Actor[]>([]);
  const [following, setFollowing] = useState<Actor[]>([]);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [followersLoaded, setFollowersLoaded] = useState(false);
  const [followingLoaded, setFollowingLoaded] = useState(false);

  const { toast } = useToast();

  // Extract handle from URL (/a/handle)
  const fullHandle = location.pathname.replace(/^\/a\//, '');
  const username = getUsername(fullHandle);

  // Posts pagination
  const fetchPosts = useCallback(async (cursor?: number) => {
    if (!actor) return { items: [], next_cursor: null };
    const data = isLocalUser
      ? await users.getPosts(username, { before: cursor, sort: postSort })
      : await actors.getPosts(actor.id, { before: cursor, sort: postSort });
    return { items: data.posts, next_cursor: data.next_cursor };
  }, [actor, isLocalUser, username, postSort]);

  const {
    items: posts,
    loading: postsLoading,
    loadingMore: loadingMorePosts,
    hasMore: hasMorePosts,
    loadMore: loadMorePosts,
    refresh: refreshPosts,
  } = usePagination<Post>({ fetchFn: fetchPosts, autoLoad: false });

  // Replies pagination
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const fetchReplies = useCallback(async (cursor?: number) => {
    if (!actor) return { items: [], next_cursor: null };
    const data = isLocalUser
      ? await users.getReplies(username, { before: cursor })
      : await actors.getReplies(actor.id, { before: cursor });
    return { items: data.posts, next_cursor: data.next_cursor };
  }, [actor, isLocalUser, username]);

  const {
    items: replies,
    loadingMore: loadingMoreReplies,
    hasMore: hasMoreReplies,
    loadMore: loadMoreReplies,
    refresh: refreshReplies,
  } = usePagination<Post>({ fetchFn: fetchReplies, autoLoad: false });

  // Boosts pagination
  const [boostsLoaded, setBoostsLoaded] = useState(false);
  const fetchBoosts = useCallback(async (cursor?: number) => {
    if (!actor) return { items: [], next_cursor: null };
    const data = await actors.getBoosts(actor.id, { before: cursor });
    return { items: data.posts, next_cursor: data.next_cursor };
  }, [actor]);

  const {
    items: boosts,
    loadingMore: loadingMoreBoosts,
    hasMore: hasMoreBoosts,
    loadMore: loadMoreBoosts,
    refresh: refreshBoosts,
  } = usePagination<Post>({ fetchFn: fetchBoosts, autoLoad: false });

  // Boosted posts only (no replies) - for Group actors
  const [boostsPostsLoaded, setBoostsPostsLoaded] = useState(false);
  const fetchBoostsPosts = useCallback(async (cursor?: number) => {
    if (!actor) return { items: [], next_cursor: null };
    const data = await actors.getBoosts(actor.id, { before: cursor, filter: 'posts' });
    return { items: data.posts, next_cursor: data.next_cursor };
  }, [actor]);

  const {
    items: boostsPosts,
    loadingMore: loadingMoreBoostsPosts,
    hasMore: hasMoreBoostsPosts,
    loadMore: loadMoreBoostsPosts,
    refresh: refreshBoostsPosts,
  } = usePagination<Post>({ fetchFn: fetchBoostsPosts, autoLoad: false });

  // Load profile
  const loadProfile = useCallback(async () => {
    if (!fullHandle) return;

    setLoading(true);
    setError('');
    setRepliesLoaded(false);
    setBoostsLoaded(false);
    setBoostsPostsLoaded(false);
    setPinnedPosts([]);
    setActiveTab('posts'); // will be overridden for Groups after profile loads
    setFollowersLoaded(false);
    setFollowingLoaded(false);
    setFollowers([]);
    setFollowing([]);

    try {
      // Always try local user first (API returns 404 if not found)
      try {
        const profileData = await users.get(username, { silent: true });
        // Check if the handle matches - if URL has a domain, make sure it matches
        const urlDomain = getDomain(fullHandle);
        const actorDomain = getDomain(profileData.actor.handle);
        if (urlDomain && urlDomain !== actorDomain) {
          // URL specifies a different domain, fall through to remote search
          throw new Error('Domain mismatch');
        }
        setActor(profileData.actor);
        setStats(profileData.stats);
        setIsFollowing(profileData.is_following);
        setFollowStatus(profileData.follow_status ?? null);
        setIsOwnProfile(profileData.is_own_profile);
        setIsLocalUser(true);
        if (profileData.actor.actor_type === 'Group') {
          setActiveTab('boosts_posts');
        }

        const pinnedData = await users.getPinned(username);
        setPinnedPosts(pinnedData.posts);
        setLoading(false);
        return;
      } catch {
        // Not a local user, fall through to search
      }

      // Search for remote user
      const { users: searchResults } = await search.query(fullHandle);
      if (searchResults.length > 0) {
        // Prefer exact case-sensitive handle match (handles are case-sensitive)
        const normalizedHandle = fullHandle.startsWith('@') ? fullHandle : `@${fullHandle}`;
        const remoteActor = searchResults.find(a => a.handle === normalizedHandle) || searchResults[0];
        setFollowers([]);
        setFollowing([]);
        setIsLocalUser(false);

        const actorData = await actors.get(remoteActor.id).catch(() => null);

        // Use the full actor data if available (has stats), otherwise fall back to search result
        if (actorData) {
          setActor(actorData.actor ?? remoteActor);
          setStats(actorData.stats ?? { followers: 0, following: 0 });
          setIsFollowing(actorData.is_following);
          setFollowStatus(actorData.follow_status ?? null);
          setIsOwnProfile(actorData.is_own_profile);
        } else {
          setActor(remoteActor);
          setStats({ followers: 0, following: 0 });
          setIsFollowing(false);
          setFollowStatus(null);
          setIsOwnProfile(false);
        }

        if ((actorData?.actor ?? remoteActor).actor_type === 'Group') {
          setActiveTab('boosts_posts');
        }

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

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Load posts when profile loads or sort changes — use actor ID to avoid
  // re-triggering when actor object reference changes without ID changing
  const actorId = actor?.id;
  useEffect(() => {
    if (actorId && !loading) {
      refreshPosts();
    }
  }, [actorId, loading, postSort]);

  // Load replies when switching to replies tab
  useEffect(() => {
    if (activeTab === 'replies' && actor && !repliesLoaded) {
      refreshReplies().then(() => setRepliesLoaded(true));
    }
  }, [activeTab, actor, repliesLoaded, refreshReplies]);

  // Load boosts when switching to boosts tab
  useEffect(() => {
    if (activeTab === 'boosts' && actor && !boostsLoaded) {
      refreshBoosts().then(() => setBoostsLoaded(true));
    }
  }, [activeTab, actor, boostsLoaded, refreshBoosts]);

  // Load boosted posts (posts only) when switching to boosts_posts tab
  useEffect(() => {
    if (activeTab === 'boosts_posts' && actor && !boostsPostsLoaded) {
      refreshBoostsPosts().then(() => setBoostsPostsLoaded(true));
    }
  }, [activeTab, actor, boostsPostsLoaded, refreshBoostsPosts]);

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
    try {
      if (isFollowing || followStatus === 'pending') {
        await follows.unfollow(actor.id);
        setIsFollowing(false);
        setFollowStatus(null);
        if (isFollowing) {
          setStats(s => ({ ...s, followers: Math.max(0, s.followers - 1) }));
        }
        toast.info('Unfollowed');
      } else {
        const response = await follows.follow(actor.handle, actor.id);
        // For remote actors, start as pending; for local, immediately accepted
        const newStatus = actor.is_local ? 'accepted' : 'pending';
        setIsFollowing(newStatus === 'accepted');
        setFollowStatus(newStatus);
        if (newStatus === 'accepted') {
          setStats(s => ({ ...s, followers: s.followers + 1 }));
        }
        toast.info(response.message || (newStatus === 'pending' ? 'Follow request sent!' : 'Now following!'));
      }
    } catch {
      // Error handled by global toast
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
      <ProfileHeader
        actor={actor}
        username={username}
        stats={stats}
        isFollowing={isFollowing}
        followStatus={followStatus}
        isOwnProfile={isOwnProfile}
        followLoading={followLoading}
        loggedIn={!!user}
        onFollow={handleFollow}
        onShowFollowers={() => setShowFollowers(true)}
        onShowFollowing={() => setShowFollowing(true)}
      />

      {!actor.is_local && actor.url && (
        <p>
          <a href={actor.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
            <i className="bi bi-box-arrow-up-right me-1"></i>
            View on {new URL(actor.url).host}
          </a>
        </p>
      )}

      {pinnedPosts.length > 0 && (
        <div className="mb-3">
          {pinnedPosts.map((post) => (
            <div key={`pinned-${post.id}`} className="position-relative">
              <span className="badge bg-warning text-dark position-absolute" style={{ top: 8, right: 8, zIndex: 1 }}>
                <i className="bi bi-pin-fill me-1"></i>Pinned
              </span>
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}

      <ProfileTabs
        activeTab={activeTab}
        showBoosts={true}
        showSettings={isOwnProfile}
        actorType={actor.actor_type}
        onTabChange={setActiveTab}
      />

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <TabContent
          loading={postsLoading}
          empty={posts.length === 0}
          emptyIcon={actor.is_local ? 'file-text' : 'globe'}
          emptyTitle={actor.is_local ? 'No posts yet.' : 'No posts from this user yet.'}
          emptyDescription={actor.is_local ? undefined : 'New posts will appear after you follow them.'}
        >
          {posts.length > 0 && (
            <div className="d-flex justify-content-end mb-3">
              <SortToggle value={postSort} onChange={setPostSort} />
            </div>
          )}
          {posts.filter(p => !pinnedPosts.some(pp => pp.id === p.id)).map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMorePosts && (
            <LoadMoreButton loading={loadingMorePosts} onClick={loadMorePosts} />
          )}
        </TabContent>
      )}

      {/* Replies Tab */}
      {activeTab === 'replies' && (
        <TabContent
          loading={!repliesLoaded}
          empty={replies.length === 0}
          emptyIcon="chat"
          emptyTitle="No replies yet."
        >
          {replies.map((post) => (
            <ReplyThread key={post.id} reply={post} />
          ))}
          {hasMoreReplies && (
            <LoadMoreButton loading={loadingMoreReplies} onClick={loadMoreReplies} />
          )}
        </TabContent>
      )}

      {/* Boosted Posts Tab (posts only, for Groups) */}
      {activeTab === 'boosts_posts' && (
        <TabContent
          loading={!boostsPostsLoaded}
          empty={boostsPosts.length === 0}
          emptyIcon="arrow-repeat"
          emptyTitle="No boosted posts yet."
        >
          {boostsPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMoreBoostsPosts && (
            <LoadMoreButton loading={loadingMoreBoostsPosts} onClick={loadMoreBoostsPosts} />
          )}
        </TabContent>
      )}

      {/* Boosts Tab */}
      {activeTab === 'boosts' && (
        <TabContent
          loading={!boostsLoaded}
          empty={boosts.length === 0}
          emptyIcon="arrow-repeat"
          emptyTitle="No boosts yet."
        >
          {boosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMoreBoosts && (
            <LoadMoreButton loading={loadingMoreBoosts} onClick={loadMoreBoosts} />
          )}
        </TabContent>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && isOwnProfile && actor && (
        <ProfileSettingsTab
          actor={actor}
          onUpdate={(updated) => setActor(updated)}
          onLogout={logout}
        />
      )}

      <ActorListModal
        show={showFollowers}
        title="Followers"
        actors={followers}
        loading={!followersLoaded}
        onClose={() => setShowFollowers(false)}
        emptyMessage="No followers yet"
      />

      <ActorListModal
        show={showFollowing}
        title="Following"
        actors={following}
        loading={!followingLoaded}
        onClose={() => setShowFollowing(false)}
        emptyMessage="Not following anyone yet"
      />
    </div>
  );
}
