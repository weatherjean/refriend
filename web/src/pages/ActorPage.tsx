import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { users, follows, search, actors, Actor, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getUsername } from '../utils';
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
  const { user } = useAuth();

  // Core profile state
  const [actor, setActor] = useState<Actor | null>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [pinnedPosts, setPinnedPosts] = useState<Post[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isLocalUser, setIsLocalUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'boosts' | 'settings'>('posts');
  const [postSort, setPostSort] = useState<'new' | 'hot'>('new');

  // Follower/following state
  const [followers, setFollowers] = useState<Actor[]>([]);
  const [following, setFollowing] = useState<Actor[]>([]);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [followersLoaded, setFollowersLoaded] = useState(false);
  const [followingLoaded, setFollowingLoaded] = useState(false);

  const { toast } = useToast();

  // Extract handle from URL
  const fullHandle = location.pathname.replace(/^\/u\//, '');
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

  // Load profile
  const loadProfile = useCallback(async () => {
    if (!fullHandle) return;

    setLoading(true);
    setError('');
    setRepliesLoaded(false);
    setBoostsLoaded(false);
    setPinnedPosts([]);
    setActiveTab('posts');
    setFollowersLoaded(false);
    setFollowingLoaded(false);
    setFollowers([]);
    setFollowing([]);

    try {
      // Always try local user first (API returns 404 if not found)
      try {
        const profileData = await users.get(username, { silent: true });
        setActor(profileData.actor);
        setStats(profileData.stats);
        setIsFollowing(profileData.is_following);
        setIsOwnProfile(profileData.is_own_profile);
        setIsLocalUser(true);

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
        const remoteActor = searchResults[0];
        setActor(remoteActor);
        setStats({ followers: 0, following: 0 });
        setFollowers([]);
        setFollowing([]);
        setIsLocalUser(false);

        const [actorData] = await Promise.all([
          actors.get(remoteActor.id).catch(() => ({ is_following: false, is_own_profile: false })),
        ]);

        setIsFollowing(actorData.is_following);
        setIsOwnProfile(actorData.is_own_profile);

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

  // Load posts when profile loads or sort changes
  useEffect(() => {
    if (actor && !loading) {
      refreshPosts();
    }
  }, [actor, loading, postSort]);

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
      if (isFollowing) {
        await follows.unfollow(actor.id);
        setIsFollowing(false);
        setStats(s => ({ ...s, followers: Math.max(0, s.followers - 1) }));
        toast.info('Unfollowed');
      } else {
        const response = await follows.follow(actor.handle);
        setIsFollowing(true);
        setStats(s => ({ ...s, followers: s.followers + 1 }));
        toast.info(response.message || 'Now following!');
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

      <ProfileTabs
        activeTab={activeTab}
        showBoosts={actor.is_local}
        showSettings={isOwnProfile}
        onTabChange={setActiveTab}
      />

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <TabContent
          loading={postsLoading}
          empty={posts.length === 0 && pinnedPosts.length === 0}
          emptyIcon={actor.is_local ? 'file-text' : 'globe'}
          emptyTitle={actor.is_local ? 'No posts yet.' : 'No posts from this user yet.'}
          emptyDescription={actor.is_local ? undefined : 'New posts will appear after you follow them.'}
        >
          {(posts.length > 0 || pinnedPosts.length > 0) && (
            <div className="d-flex justify-content-end mb-3">
              <SortToggle value={postSort} onChange={setPostSort} />
            </div>
          )}
          {pinnedPosts.map((post) => (
            <div key={`pinned-${post.id}`} className="position-relative">
              <span className="badge bg-warning text-dark position-absolute" style={{ top: 8, right: 8, zIndex: 1 }}>
                <i className="bi bi-pin-fill me-1"></i>Pinned
              </span>
              <PostCard post={post} />
            </div>
          ))}
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
