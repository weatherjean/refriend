import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { communities, type Community, type CommunityModerationInfo, type CommunityPost } from '../api';
import { useAuth } from '../context/AuthContext';
import { SettingsTab } from '../components/community';
import { PostCard } from '../components/PostCard';

export function CommunityPage() {
  const { name } = useParams<{ name: string }>();
  const { user } = useAuth();
  const [community, setCommunity] = useState<Community | null>(null);
  const [moderation, setModeration] = useState<CommunityModerationInfo | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [pendingPosts, setPendingPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'pending' | 'settings'>('posts');
  const [_nextCursor, setNextCursor] = useState<number | null>(null);

  useEffect(() => {
    if (!name) return;
    const loadCommunity = async () => {
      setLoading(true);
      setError(null);
      try {
        const { community: c, moderation: mod } = await communities.get(name);
        setCommunity(c);
        setModeration(mod);

        // Load posts
        const { posts: p, next_cursor } = await communities.getPosts(name, { limit: 20 });
        setPosts(p);
        setNextCursor(next_cursor);

        // Load pending posts if admin
        if (mod?.isAdmin) {
          const { posts: pending } = await communities.getPendingPosts(name);
          setPendingPosts(pending);
        }
      } catch (err) {
        console.error('Failed to load community:', err);
        setError(err instanceof Error ? err.message : 'Failed to load community');
      } finally {
        setLoading(false);
      }
    };
    loadCommunity();
  }, [name]);

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
    } catch (err) {
      console.error('Failed to join/leave:', err);
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
    } catch (err) {
      console.error('Failed to approve post:', err);
    }
  };

  const handleReject = async (postId: string) => {
    if (!name) return;
    try {
      await communities.rejectPost(name, postId);
      setPendingPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      console.error('Failed to reject post:', err);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className="text-center py-5">
        <i className="bi bi-exclamation-circle text-danger fs-1 mb-3 d-block"></i>
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
          <div className="d-flex align-items-start">
            {community.avatar_url ? (
              <img
                src={community.avatar_url}
                alt=""
                className="rounded me-3"
                style={{ width: 80, height: 80, objectFit: 'cover' }}
              />
            ) : (
              <div
                className="rounded me-3 bg-secondary d-flex align-items-center justify-content-center"
                style={{ width: 80, height: 80 }}
              >
                <i className="bi bi-people text-white fs-2"></i>
              </div>
            )}
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
              {community.bio && <p className="mb-2">{community.bio}</p>}
              <div className="d-flex gap-3 text-muted small">
                <span><strong>{community.member_count}</strong> members</span>
                {community.require_approval && (
                  <span><i className="bi bi-shield-check me-1"></i>Posts require approval</span>
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

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'posts' ? 'active' : ''}`}
            onClick={() => setActiveTab('posts')}
          >
            Posts
          </button>
        </li>
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
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <i className="bi bi-gear me-1"></i>Settings
            </button>
          </li>
        )}
      </ul>

      {/* Tab Content */}
      {activeTab === 'posts' && (
        <div>
          {posts.length === 0 ? (
            <div className="text-center text-muted py-4">
              <i className="bi bi-chat-square-text fs-1 mb-3 d-block"></i>
              <p>No posts yet.</p>
              {moderation?.isMember && (
                <p className="small">Be the first to post in this community!</p>
              )}
            </div>
          ) : (
            <div>
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'pending' && moderation?.isAdmin && (
        <div>
          {pendingPosts.length === 0 ? (
            <div className="text-center text-muted py-4">
              <i className="bi bi-check-circle fs-1 mb-3 d-block"></i>
              <p>No pending posts</p>
            </div>
          ) : (
            <div className="list-group">
              {pendingPosts.map((post) => (
                <div key={post.id} className="list-group-item">
                  <div className="d-flex align-items-start">
                    {post.author?.avatar_url ? (
                      <img
                        src={post.author.avatar_url}
                        alt=""
                        className="rounded-circle me-2"
                        style={{ width: 32, height: 32, objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        className="rounded-circle me-2 bg-secondary d-flex align-items-center justify-content-center"
                        style={{ width: 32, height: 32 }}
                      >
                        <i className="bi bi-person text-white small"></i>
                      </div>
                    )}
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <small className="fw-semibold">{post.author?.name || post.author?.handle}</small>
                          <small className="text-muted ms-2">{post.submitted_at && new Date(post.submitted_at).toLocaleString()}</small>
                        </div>
                        <div className="btn-group btn-group-sm">
                          <button
                            className="btn btn-success"
                            onClick={() => handleApprove(post.id)}
                            title="Approve"
                          >
                            <i className="bi bi-check-lg"></i>
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleReject(post.id)}
                            title="Reject"
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                      </div>
                      <div
                        className="mt-1"
                        dangerouslySetInnerHTML={{ __html: post.content }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
