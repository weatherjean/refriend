import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';

export function PostPage() {
  const { id } = useParams<{ id: string }>();
  const { user, actor } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [ancestors, setAncestors] = useState<Post[]>([]);
  const [replies, setReplies] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);
  const [replySort, setReplySort] = useState<'new' | 'hot'>('hot');
  const [opAuthorId, setOpAuthorId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setReplies([]);
      setNextCursor(null);
      try {
        const [postData, repliesData] = await Promise.all([
          postsApi.get(id!),
          postsApi.getReplies(id!, replySort),
        ]);
        setPost(postData.post);
        setAncestors(postData.ancestors || []);
        setOpAuthorId(repliesData.op_author_id);
        setNextCursor(repliesData.next_cursor);
        setReplies(repliesData.replies); // OP sorting handled by backend
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load post');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, replySort]);

  const handleDelete = async () => {
    if (!post) return;

    setDeleting(true);
    try {
      await postsApi.delete(post.id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete post');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !replyContent.trim()) return;

    setReplying(true);
    try {
      const { post: newReply } = await postsApi.create(replyContent, post.id);
      setReplies([...replies, newReply]);
      setReplyContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setReplying(false);
    }
  };

  const loadMoreReplies = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const repliesData = await postsApi.getReplies(id!, replySort, nextCursor);
      setReplies(prev => [...prev, ...repliesData.replies]);
      setNextCursor(repliesData.next_cursor);
    } catch (err) {
      console.error('Failed to load more replies:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !post) {
    return (
      <div className="alert alert-danger">{error || 'Post not found'}</div>
    );
  }

  const isOwner = actor && post.author && actor.id === post.author.id;

  // Rainbow colors for thread lines (starts with logo colors)
  const threadColors = [
    '#f87171', // red (logo)
    '#fbbf24', // yellow (logo)
    '#4ade80', // green (logo)
    '#38bdf8', // sky
    '#818cf8', // indigo
    '#e879f9', // fuchsia
  ];

  // Build nested thread structure
  const renderThread = () => {
    if (ancestors.length === 0) {
      return <PostCard post={post} linkToPost={false} />;
    }

    // Build from inside out - start with current post, wrap with ancestors' lines
    let content = <PostCard post={post} linkToPost={false} />;

    // Wrap from last ancestor to first (reverse order for nesting)
    // Each ancestor's PostCard is OUTSIDE the wrapper, line wraps what comes after
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const ancestor = ancestors[i];
      const color = threadColors[i % threadColors.length];
      content = (
        <div key={ancestor.id}>
          <PostCard post={ancestor} />
          <div
            style={{
              borderLeft: `3px solid ${color}`,
              paddingLeft: 16,
              marginLeft: 8,
            }}
          >
            {content}
          </div>
        </div>
      );
    }

    return (
      <div className="thread-container">
        <div className="text-muted small mb-2">
          <i className="bi bi-arrow-up me-1"></i>
          Conversation thread
        </div>
        {content}
      </div>
    );
  };

  return (
    <div>
      {renderThread()}

      {isOwner && (
        <div className="mt-3">
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Post'}
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        show={showDeleteConfirm}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Reply form */}
      {user && (
        <div className="card mt-4">
          <div className="card-body">
            <form onSubmit={handleReply}>
              <div className="mb-2">
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder={`Reply to ${post.author?.handle || 'this post'}...`}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  disabled={replying}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={replying || !replyContent.trim()}
              >
                {replying ? 'Posting...' : 'Reply'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Replies section */}
      {replies.length > 0 && (
        <div className="mt-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0">
              <i className="bi bi-chat-dots-fill me-2"></i>
              Replies ({post.replies_count})
            </h5>
            <div className="btn-group btn-group-sm">
              <button
                className={`btn ${replySort === 'new' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setReplySort('new')}
              >
                New
              </button>
              <button
                className={`btn ${replySort === 'hot' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setReplySort('hot')}
              >
                Hot
              </button>
            </div>
          </div>
          {replies.map((reply) => (
            <PostCard
              key={reply.id}
              post={reply}
              isOP={reply.author?.id === opAuthorId}
            />
          ))}
          {nextCursor && (
            <LoadMoreButton loading={loadingMore} onClick={loadMoreReplies} />
          )}
        </div>
      )}
    </div>
  );
}
