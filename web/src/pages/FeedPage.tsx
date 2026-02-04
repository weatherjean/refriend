import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { feeds as feedsApi, search as searchApi, Feed, FeedModerator, Post, Actor } from '../api';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { PostCard } from '../components/PostCard';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { LoadingButton } from '../components/LoadingButton';
import { AlertMessage } from '../components/AlertMessage';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { usePagination, useMessage } from '../hooks';
import { getUsername } from '../utils';

type TabType = 'posts' | 'suggestions' | 'moderators' | 'settings';

export function FeedPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [feedLoading, setFeedLoading] = useState(true);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('posts');

  useEffect(() => {
    if (!slug) return;
    setFeedLoading(true);
    feedsApi.get(slug)
      .then(({ feed, bookmarked, is_owner, is_moderator }) => {
        setFeed(feed);
        setBookmarked(bookmarked);
        setIsOwner(is_owner);
        setIsModerator(is_moderator);
      })
      .catch(() => setFeed(null))
      .finally(() => setFeedLoading(false));
  }, [slug]);

  const handleBookmark = async () => {
    if (!slug || bookmarkLoading) return;
    setBookmarkLoading(true);
    try {
      if (bookmarked) {
        await feedsApi.unbookmark(slug);
        setBookmarked(false);
      } else {
        await feedsApi.bookmark(slug);
        setBookmarked(true);
      }
    } catch {
      // Error handled by global toast
    } finally {
      setBookmarkLoading(false);
    }
  };

  if (feedLoading) return <LoadingSpinner />;
  if (!feed) return <EmptyState icon="x-circle" title="Feed not found" />;

  const canModerate = isOwner || isModerator;

  const tabItems: { key: TabType; label: string; show: boolean }[] = [
    { key: 'posts', label: 'Posts', show: true },
    { key: 'suggestions', label: 'Suggestions', show: canModerate },
    { key: 'moderators', label: 'Moderators', show: true },
  ];

  return (
    <div>
      <PageHeader
        title={feed.name}
        icon="collection"
        subtitle={feed.description || 'A curated feed.'}
      />
      <p className="text-muted small" style={{ marginTop: '-1rem', marginBottom: '1rem' }}>
        /feeds/{feed.slug}
      </p>

      <div className="d-flex gap-2 mb-3">
        {user && (
          <button
            className={`btn btn-sm ${bookmarked ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={handleBookmark}
            disabled={bookmarkLoading || (bookmarked && canModerate)}
            title={bookmarked && canModerate ? 'Cannot unbookmark a feed you moderate' : undefined}
          >
            <i className={`bi ${bookmarked ? 'bi-bookmark-fill' : 'bi-bookmark'} me-1`}></i>
            {bookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
        )}
      </div>

      <ul className="nav nav-tabs mb-3">
        {tabItems.filter(t => t.show).map(tab => (
          <li key={tab.key} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          </li>
        ))}
        {isOwner && (
          <li className="nav-item ms-auto">
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

      {activeTab === 'posts' && slug && (
        <PostsTab slug={slug} canModerate={canModerate} />
      )}
      {activeTab === 'suggestions' && slug && canModerate && (
        <SuggestionsTab slug={slug} />
      )}
      {activeTab === 'moderators' && slug && (
        <ModeratorsTab slug={slug} isOwner={isOwner} isModerator={isModerator} />
      )}
      {activeTab === 'settings' && slug && isOwner && (
        <FeedSettingsTab feed={feed} onUpdate={setFeed} />
      )}
    </div>
  );
}

function PostsTab({ slug, canModerate }: { slug: string; canModerate: boolean }) {
  const fetchPosts = useCallback(async (cursor?: number) => {
    const { posts, next_cursor } = await feedsApi.getPosts(slug, { before: cursor });
    return { items: posts, next_cursor };
  }, [slug]);

  const {
    items: posts,
    setItems: setPosts,
    loading,
    loadingMore,
    hasMore,
    loadMore,
  } = usePagination<Post>({ fetchFn: fetchPosts, key: slug });

  if (loading && posts.length === 0) return <LoadingSpinner />;

  if (posts.length === 0) {
    return (
      <EmptyState
        icon="collection"
        title="No posts in this feed yet."
        description="Posts will appear here once moderators add them."
      />
    );
  }

  return (
    <>
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          feedSlug={canModerate ? slug : undefined}
          onRemoveFromFeed={canModerate ? () => setPosts(prev => prev.filter(p => p.id !== post.id)) : undefined}
        />
      ))}
      {hasMore && (
        <LoadMoreButton loading={loadingMore} onClick={loadMore} />
      )}
    </>
  );
}

function SuggestionsTab({ slug }: { slug: string }) {
  const [suggestions, setSuggestions] = useState<{ id: number; post: Post }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    feedsApi.getSuggestions(slug)
      .then(({ suggestions, next_cursor }) => {
        setSuggestions(suggestions);
        setNextCursor(next_cursor);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, [slug]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { suggestions: more, next_cursor } = await feedsApi.getSuggestions(slug, { before: nextCursor });
      setSuggestions(prev => [...prev, ...more]);
      setNextCursor(next_cursor);
    } catch {
      // Error handled by global toast
    } finally {
      setLoadingMore(false);
    }
  };

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try {
      await feedsApi.approveSuggestion(slug, id);
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch {
      // Error handled by global toast
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number) => {
    setActionLoading(id);
    try {
      await feedsApi.rejectSuggestion(slug, id);
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch {
      // Error handled by global toast
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (suggestions.length === 0) {
    return (
      <EmptyState
        icon="lightbulb"
        title="No pending suggestions."
        description="Suggestions from bookmarkers will appear here."
      />
    );
  }

  return (
    <>
      {suggestions.map((s) => (
        <PostCard
          key={s.id}
          post={s.post}
          suggestionActions={{
            onApprove: () => handleApprove(s.id),
            onReject: () => handleReject(s.id),
            loading: actionLoading === s.id,
          }}
        />
      ))}
      {nextCursor && (
        <LoadMoreButton loading={loadingMore} onClick={loadMore} />
      )}
    </>
  );
}

function FeedSettingsTab({ feed, onUpdate }: { feed: Feed; onUpdate: (feed: Feed) => void }) {
  const [name, setName] = useState(feed.name);
  const [description, setDescription] = useState(feed.description || '');
  const [saving, setSaving] = useState(false);
  const { message, showSuccess, showError, clear } = useMessage();

  const handleSave = async () => {
    setSaving(true);
    clear();
    try {
      const { feed: updated } = await feedsApi.update(feed.slug, {
        name: name.trim() || undefined,
        description: description.trim() || null,
      });
      onUpdate(updated);
      showSuccess('Feed updated successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update feed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <h6 className="mb-0">Feed Settings</h6>
        </div>
        <div className="card-body">
          <AlertMessage message={message} onDismiss={clear} />

          <div className="mb-3">
            <label htmlFor="feedName" className="form-label">Display Name</label>
            <input
              type="text"
              className="form-control"
              id="feedName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Feed name"
              maxLength={100}
            />
          </div>

          <div className="mb-3">
            <label htmlFor="feedDescription" className="form-label">Description</label>
            <textarea
              className="form-control"
              id="feedDescription"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this feed about?"
              maxLength={500}
            />
            <div className="form-text">{description.length}/500 characters</div>
          </div>

          <LoadingButton
            loading={saving}
            loadingText="Saving..."
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

function ModeratorsTab({ slug, isOwner, isModerator }: { slug: string; isOwner: boolean; isModerator: boolean }) {
  const { actor } = useAuth();
  const [moderators, setModerators] = useState<FeedModerator[]>([]);
  const [owner, setOwner] = useState<{ public_id: string; handle: string; name: string | null; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Actor[]>([]);
  const [searching, setSearching] = useState(false);
  const [addLoading, setAddLoading] = useState<string | null>(null);

  useEffect(() => {
    feedsApi.getModerators(slug)
      .then(({ moderators, owner }) => {
        setModerators(moderators);
        setOwner(owner);
      })
      .catch(() => setModerators([]))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleRemove = async (actorPublicId: string) => {
    setRemoveLoading(actorPublicId);
    try {
      await feedsApi.removeModerator(slug, actorPublicId);
      setModerators(prev => prev.filter(m => m.public_id !== actorPublicId));
    } catch {
      // Error handled by global toast
    } finally {
      setRemoveLoading(null);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const { users } = await searchApi.query(searchQuery, 'users');
      setSearchResults(users.filter(u => u.is_local));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (targetActor: Actor) => {
    setAddLoading(targetActor.id);
    try {
      await feedsApi.addModerator(slug, targetActor.id);
      const { moderators: updated } = await feedsApi.getModerators(slug);
      setModerators(updated);
      setSearchResults(prev => prev.filter(a => a.id !== targetActor.id));
    } catch {
      // Error handled by global toast
    } finally {
      setAddLoading(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  const modPublicIds = new Set(moderators.map(m => m.public_id));

  return (
    <div>
      {isOwner && (
        <div className="mb-3">
          <div className="input-group input-group-sm">
            <input
              type="text"
              className="form-control"
              placeholder="Search users to add as moderator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              className="btn btn-outline-secondary"
              onClick={handleSearch}
              disabled={searching}
            >
              {searching ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-search"></i>}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="list-group mt-2">
              {searchResults.filter(a => !modPublicIds.has(a.id)).map((a) => (
                <div key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-2">
                    <Avatar src={a.avatar_url} name={a.handle} size="sm" />
                    <div>
                      <div className="fw-semibold">{a.name || getUsername(a.handle)}</div>
                      <small className="text-muted">{a.handle}</small>
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleAdd(a)}
                    disabled={addLoading === a.id}
                  >
                    {addLoading === a.id ? <span className="spinner-border spinner-border-sm"></span> : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {owner && (
        <div className="mb-3">
          <small className="text-muted fw-semibold text-uppercase mb-2 d-block">Owner</small>
          <div className="list-group">
            <div className="list-group-item d-flex justify-content-between align-items-center">
              <Link to={`/a/${getUsername(owner.handle)}`} className="d-flex align-items-center gap-2 text-decoration-none text-reset">
                <Avatar src={owner.avatar_url} name={owner.handle} size="sm" />
                <div>
                  <div className="fw-semibold">{owner.name || getUsername(owner.handle)}</div>
                  <small className="text-muted">{owner.handle}</small>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {moderators.length === 0 ? (
        <EmptyState
          icon="people"
          title="No moderators yet."
          description={isOwner ? "Search above to add moderators." : "This feed has no additional moderators."}
        />
      ) : (
        <div>
          <small className="text-muted fw-semibold text-uppercase mb-2 d-block">Moderators</small>
          <div className="list-group">
          {moderators.map((mod) => {
            const isSelf = actor?.id === mod.public_id;
            const canRemove = isOwner || (isModerator && isSelf);
            return (
              <div key={mod.public_id} className="list-group-item d-flex justify-content-between align-items-center">
                <Link to={`/a/${getUsername(mod.handle)}`} className="d-flex align-items-center gap-2 text-decoration-none text-reset">
                  <Avatar src={mod.avatar_url} name={mod.handle} size="sm" />
                  <div>
                    <div className="fw-semibold">{mod.name || getUsername(mod.handle)}</div>
                    <small className="text-muted">{mod.handle}</small>
                  </div>
                </Link>
                {canRemove && (
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleRemove(mod.public_id)}
                    disabled={removeLoading === mod.public_id}
                  >
                    {isSelf ? 'Leave' : 'Remove'}
                  </button>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
