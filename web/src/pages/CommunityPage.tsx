import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { communities, type Community, type CommunityModerationInfo, type CommunityPost } from '../api';
import { useAuth } from '../context/AuthContext';
import { SettingsTab, ModLogsTab } from '../components/community';
import { PostCard } from '../components/PostCard';
import { Avatar, CommunityAvatar } from '../components/Avatar';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { SortToggle } from '../components/SortToggle';
import { sanitizeHtml } from '../utils';

export function CommunityPage() {
  const { name } = useParams<{ name: string }>();
  const { user } = useAuth();
  const [community, setCommunity] = useState<Community | null>(null);
  const [moderation, setModeration] = useState<CommunityModerationInfo | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [pinnedPosts, setPinnedPosts] = useState<CommunityPost[]>([]);
  const [pendingPosts, setPendingPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'boosts' | 'pending' | 'modlogs' | 'settings'>('posts');
  const [_nextCursor, setNextCursor] = useState<number | null>(null);
  const [postSort, setPostSort] = useState<'new' | 'hot'>('hot');

  useEffect(() => {
    if (!name) return;
    const loadCommunity = async () => {
      setLoading(true);
      setError(null);
      try {
        const { community: c, moderation: mod } = await communities.get(name);
        setCommunity(c);
        setModeration(mod);

        // For remote communities, default to boosts tab
        if (!c.is_local) {
          setActiveTab('boosts');
        }

        // Load pinned posts
        const { posts: pinned } = await communities.getPinnedPosts(name);
        setPinnedPosts(pinned);

        // Load posts
        const { posts: p, next_cursor } = await communities.getPosts(name, { limit: 20, sort: postSort });
        setPosts(p);
        setNextCursor(next_cursor);

        // Load pending posts if admin
        if (mod?.isAdmin) {
          const { posts: pending } = await communities.getPendingPosts(name);
          setPendingPosts(pending);
        }
      } catch (err) {
        // Error handled by global toast
        setError(err instanceof Error ? err.message : 'Failed to load community');
      } finally {
        setLoading(false);
      }
    };
    loadCommunity();
  }, [name, postSort]);

  const handleJoinLeave = async () => {
    if (!name || !community) return;
    setJoining(true);
    try {
      if (moderation?.isMember) {
        await communities.leave(name);
        setCommunity({ ...community, member_count: community.member_count - 1 });
        setModeration(mod => mod ? { ...mod, isMember: false } : null);
      } else {
        await communities.join(name);
        setCommunity({ ...community, member_count: community.member_count + 1 });
        setModeration(mod => mod ? { ...mod, isMember: true } : null);
      }
    } catch {
      // Error handled by global toast
    } finally {
      setJoining(false);
    }
  };

  const handleApprove = async (postId: string) => {
    if (!name) return;
    try {
      await communities.approvePost(name, postId);
      const approved = pendingPosts.find(p => p.id === postId);
      setPendingPosts(prev => prev.filter(p => p.id !== postId));
      if (approved) {
        setPosts(prev => [approved, ...prev]);
      }
    } catch {
      // Error handled by global toast
    }
  };

  const handleReject = async (postId: string) => {
    if (!name) return;
    try {
      await communities.rejectPost(name, postId);
      setPendingPosts(prev => prev.filter(p => p.id !== postId));
    } catch {
      // Error handled by global toast
    }
  };

  const handlePin = async (postId: string) => {
    if (!name) return;
    try {
      await communities.pinPost(name, postId);
      // Find the post and move it to pinned
      const post = posts.find(p => p.id === postId);
      if (post) {
        setPinnedPosts(prev => [{ ...post, pinned_in_community: true }, ...prev]);
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, pinned_in_community: true } : p));
      }
    } catch {
      // Error handled by global toast
    }
  };

  const handleUnpin = async (postId: string) => {
    if (!name) return;
    try {
      await communities.unpinPost(name, postId);
      setPinnedPosts(prev => prev.filter(p => p.id !== postId));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, pinned_in_community: false } : p));
    } catch {
      // Error handled by global toast
    }
  };

  const handleUnboost = async (postId: string) => {
    if (!name) return;
    try {
      await communities.unboostPost(name, postId);
      setPinnedPosts(prev => prev.filter(p => p.id !== postId));
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch {
      // Error handled by global toast
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !community) {
    return (
      <div className="text-center py-5">
        <i className="bi bi-exclamation-circle-fill text-danger fs-1 mb-3 d-block"></i>
        <p className="text-muted">{error || 'Community not found'}</p>
        <Link to="/communities" className="btn btn-outline-primary btn-sm">
          Back to communities
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Community Header */}
      <div className="card mb-4">
        <div className="card-body">
          {/* Mobile layout: stacked and centered */}
          <div className="d-md-none text-center">
            <CommunityAvatar src={community.avatar_url} size={100} />
            <h4 className="mb-0 mt-3">{community.name}</h4>
            <div className="text-muted small" style={{ wordBreak: 'break-all' }}>{community.handle}</div>

            {community.bio && <div className="mt-2 mb-0" dangerouslySetInnerHTML={{ __html: sanitizeHtml(community.bio) }} />}

            <div className="mt-3 d-flex justify-content-center gap-3 text-muted small flex-wrap">
              <span><strong>{community.member_count}</strong> members</span>
              {!community.is_local && (
                <span><i className="bi bi-globe2 me-1" style={{ color: '#fbbf24' }}></i>Remote</span>
              )}
              {community.require_approval && (
                <span><i className="bi bi-shield-fill-check me-1"></i>Approval required</span>
              )}
              {moderation?.isAdmin && (
                <span className="text-primary"><i className="bi bi-star-fill me-1"></i>{moderation.isOwner ? 'Owner' : 'Admin'}</span>
              )}
            </div>

            {user && !moderation?.isBanned && (
              <div className="mt-3">
                <button
                  className={`btn ${moderation?.isMember ? 'btn-outline-secondary' : 'btn-primary'}`}
                  onClick={handleJoinLeave}
                  disabled={joining}
                >
                  {joining ? (
                    <span className="spinner-border spinner-border-sm"></span>
                  ) : moderation?.isMember ? (
                    'Leave'
                  ) : (
                    'Join'
                  )}
                </button>
              </div>
            )}

            {moderation?.isBanned && (
              <div className="alert alert-danger mt-3 mb-0 py-2">
                <i className="bi bi-ban me-2"></i>You are banned from this community
              </div>
            )}
          </div>

          {/* Desktop layout: horizontal */}
          <div className="d-none d-md-flex align-items-start">
            <CommunityAvatar src={community.avatar_url} size={80} className="me-3" />
            <div className="flex-grow-1">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <h4 className="mb-1">{community.name}</h4>
                  <p className="text-muted mb-2">{community.handle}</p>
                </div>
                {user && !moderation?.isBanned && (
                  <button
                    className={`btn ${moderation?.isMember ? 'btn-outline-secondary' : 'btn-primary'}`}
                    onClick={handleJoinLeave}
                    disabled={joining}
                  >
                    {joining ? (
                      <span className="spinner-border spinner-border-sm"></span>
                    ) : moderation?.isMember ? (
                      'Leave'
                    ) : (
                      'Join'
                    )}
                  </button>
                )}
              </div>
              {community.bio && <div className="mb-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(community.bio) }} />}
              <div className="d-flex gap-3 text-muted small">
                <span><strong>{community.member_count}</strong> members</span>
                {!community.is_local && (
                  <span><i className="bi bi-globe2 me-1" style={{ color: '#fbbf24' }}></i>Remote</span>
                )}
                {community.require_approval && (
                  <span><i className="bi bi-shield-fill-check me-1"></i>Posts require approval</span>
                )}
                {moderation?.isAdmin && (
                  <span className="text-primary"><i className="bi bi-star-fill me-1"></i>{moderation.isOwner ? 'Owner' : 'Admin'}</span>
                )}
              </div>
              {moderation?.isBanned && (
                <div className="alert alert-danger mt-3 mb-0 py-2">
                  <i className="bi bi-ban me-2"></i>You are banned from this community
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {!community.is_local && community.url && (
        <p>
          <a href={community.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
            <i className="bi bi-box-arrow-up-right me-1"></i>
            View on {new URL(community.url).host}
          </a>
        </p>
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        {/* Remote communities show Boosts tab first */}
        {!community.is_local && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'boosts' ? 'active' : ''}`}
              onClick={() => setActiveTab('boosts')}
            >
              <i className="bi bi-arrow-repeat me-1"></i>Boosts
            </button>
          </li>
        )}
        {/* Local communities show Posts tab */}
        {community.is_local && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'posts' ? 'active' : ''}`}
              onClick={() => setActiveTab('posts')}
            >
              Posts
            </button>
          </li>
        )}
        {moderation?.isAdmin && community.require_approval && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              Pending {pendingPosts.length > 0 && <span className="badge bg-warning text-dark ms-1">{pendingPosts.length}</span>}
            </button>
          </li>
        )}
        {moderation?.isAdmin && (
          <li className="nav-item ms-auto">
            <button
              className={`nav-link ${activeTab === 'modlogs' ? 'active' : ''}`}
              onClick={() => setActiveTab('modlogs')}
              title="Moderation Log"
            >
              <i className="bi bi-journal-text"></i>
            </button>
          </li>
        )}
        {moderation?.isAdmin && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              title="Settings"
            >
              <i className="bi bi-gear-fill"></i>
            </button>
          </li>
        )}
      </ul>

      {/* Tab Content */}
      {(activeTab === 'posts' || activeTab === 'boosts') && (
        <div>
          {(posts.length > 0 || pinnedPosts.length > 0) && (
            <div className="d-flex justify-content-end mb-3">
              <SortToggle value={postSort} onChange={setPostSort} hotFirst />
            </div>
          )}

          {posts.length === 0 && pinnedPosts.length === 0 ? (
            <EmptyState
              icon="chat-square-text"
              title="No posts yet."
              description={moderation?.isMember ? 'Be the first to post in this community!' : undefined}
            />
          ) : (
            <div>
              {/* Pinned posts first */}
              {pinnedPosts.map((post) => (
                <PostCard
                  key={`pinned-${post.id}`}
                  post={post}
                  pinnedInCommunity
                  canPinInCommunity={moderation?.isAdmin}
                  onCommunityPin={() => handleUnpin(post.id)}
                  canUnboost={moderation?.isAdmin && post.is_announcement}
                  onUnboost={() => handleUnboost(post.id)}
                  isCommunityAdmin={moderation?.isAdmin}
                  onDelete={() => {
                    setPinnedPosts(prev => prev.filter(p => p.id !== post.id));
                    setPosts(prev => prev.filter(p => p.id !== post.id));
                  }}
                />
              ))}
              {/* Regular posts (excluding pinned) */}
              {posts.filter(p => !pinnedPosts.some(pp => pp.id === p.id)).map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  canPinInCommunity={moderation?.isAdmin}
                  onCommunityPin={() => handlePin(post.id)}
                  canUnboost={moderation?.isAdmin && post.is_announcement}
                  onUnboost={() => handleUnboost(post.id)}
                  isCommunityAdmin={moderation?.isAdmin}
                  onDelete={() => setPosts(prev => prev.filter(p => p.id !== post.id))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'pending' && moderation?.isAdmin && (
        <div>
          {pendingPosts.length === 0 ? (
            <EmptyState icon="check-circle" title="No pending posts" />
          ) : (
            <div className="pending-posts-list">
              {pendingPosts.map((post) => {
                const isSuggestion = post.suggested_by && post.suggested_by.id !== post.author?.id;
                return (
                  <div key={post.id} className="pending-post-wrapper mb-4">
                    {/* Submission info header */}
                    <div className="pending-post-header">
                      {isSuggestion ? (
                        <div className="pending-post-suggestion">
                          <i className="bi bi-send-plus me-2"></i>
                          <span>Suggested by </span>
                          <Link to={`/u/${post.suggested_by!.handle}`} onClick={(e) => e.stopPropagation()}>
                            <Avatar
                              src={post.suggested_by!.avatar_url}
                              name={post.suggested_by!.name || post.suggested_by!.handle}
                              size="xs"
                              className="mx-1"
                            />
                            <strong>{post.suggested_by!.name || post.suggested_by!.handle}</strong>
                          </Link>
                          <span className="text-muted ms-2">
                            {post.submitted_at && new Date(post.submitted_at).toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <div className="pending-post-submission">
                          <i className="bi bi-plus-circle me-2"></i>
                          <span>Submitted by author</span>
                          <span className="text-muted ms-2">
                            {post.submitted_at && new Date(post.submitted_at).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Full post card */}
                    <PostCard
                      post={post}
                      linkToPost={true}
                      isCommunityAdmin={moderation?.isAdmin}
                      onDelete={() => setPendingPosts(prev => prev.filter(p => p.id !== post.id))}
                    />

                    {/* Moderation actions */}
                    <div className="pending-post-actions">
                      <button
                        className="btn btn-success"
                        onClick={() => handleApprove(post.id)}
                      >
                        <i className="bi bi-check-lg me-2"></i>
                        Approve
                      </button>
                      <button
                        className="btn btn-outline-danger"
                        onClick={() => handleReject(post.id)}
                      >
                        <i className="bi bi-x-lg me-2"></i>
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'modlogs' && moderation?.isAdmin && name && (
        <ModLogsTab communityName={name} />
      )}

      {activeTab === 'settings' && moderation?.isAdmin && (
        <SettingsTab
          community={community}
          moderation={moderation}
          onUpdate={(updated) => setCommunity(updated)}
        />
      )}
    </div>
  );
}
