import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { PostThread } from '../components/PostThread';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { LoadingButton } from '../components/LoadingButton';
import { ConfirmModal } from '../components/ConfirmModal';
import { SortToggle } from '../components/SortToggle';
import { useAuth } from '../context/AuthContext';
import { usePagination } from '../hooks';

export function PostPage() {
  const { id } = useParams<{ id: string }>();
  const { user, actor } = useAuth();
  const navigate = useNavigate();

  const [post, setPost] = useState<Post | null>(null);
  const [ancestors, setAncestors] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);
  const [replySort, setReplySort] = useState<'new' | 'hot'>('hot');
  const [opAuthorId, setOpAuthorId] = useState<string | null>(null);

  const fetchReplies = useCallback(async (cursor?: number) => {
    const data = await postsApi.getReplies(id!, replySort, cursor);
    setOpAuthorId(data.op_author_id);
    return { items: data.replies, next_cursor: data.next_cursor };
  }, [id, replySort]);

  const {
    items: replies,
    setItems: setReplies,
    loading: loadingReplies,
    loadingMore,
    hasMore,
    loadMore,
  } = usePagination<Post>({ fetchFn: fetchReplies, key: `${id}-${replySort}`, autoLoad: false });

  // Load post and ancestors, then load replies
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const postData = await postsApi.get(id!);
        setPost(postData.post);
        setAncestors(postData.ancestors || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load post');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Load replies after post loads
  useEffect(() => {
    if (post && !loadingReplies && replies.length === 0) {
      fetchReplies().then(({ items }) => setReplies(items));
    }
  }, [post, replySort]);

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
      setReplies(prev => [...prev, newReply]);
      setReplyContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setReplying(false);
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

  return (
    <div>
      <PostThread post={post} ancestors={ancestors} />

      {isOwner && (
        <div className="mt-3">
          <LoadingButton
            variant="danger"
            size="sm"
            loading={deleting}
            loadingText="Deleting..."
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Post
          </LoadingButton>
        </div>
      )}

      <ConfirmModal
        show={showDeleteConfirm}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

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
              <LoadingButton
                type="submit"
                size="sm"
                loading={replying}
                loadingText="Posting..."
                disabled={!replyContent.trim()}
              >
                Reply
              </LoadingButton>
            </form>
          </div>
        </div>
      )}

      {replies.length > 0 && (
        <div className="mt-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0">
              <i className="bi bi-chat-dots-fill me-2"></i>
              Replies ({post.replies_count})
            </h5>
            <SortToggle value={replySort} onChange={setReplySort} />
          </div>
          {replies.map((reply) => (
            <PostCard
              key={reply.id}
              post={reply}
              isOP={reply.author?.id === opAuthorId}
            />
          ))}
          {hasMore && (
            <LoadMoreButton loading={loadingMore} onClick={loadMore} />
          )}
        </div>
      )}
    </div>
  );
}
