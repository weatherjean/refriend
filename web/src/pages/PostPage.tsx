import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { posts as postsApi, Post, AttachmentInput } from '../api';
import { formatCount } from '../utils';
import { PostCard } from '../components/PostCard';
import { PostThread } from '../components/PostThread';
import { PostComposer } from '../components/PostComposer';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { SortToggle } from '../components/SortToggle';
import { useAuth } from '../context/AuthContext';
import { usePagination } from '../hooks';

export function PostPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [ancestors, setAncestors] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replySort, setReplySort] = useState<'new' | 'hot'>('hot');
  const [opAuthorId, setOpAuthorId] = useState<string | null>(null);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const fetchReplies = useCallback(async (cursor?: number) => {
    const data = await postsApi.getReplies(id!, replySort, cursor);
    setOpAuthorId(data.op_author_id);
    return { items: data.replies, next_cursor: data.next_cursor };
  }, [id, replySort]);

  const {
    items: replies,
    setItems: setReplies,
    loadingMore,
    hasMore,
    loadMore,
    refresh: refreshReplies,
  } = usePagination<Post>({ fetchFn: fetchReplies, key: `${id}-${replySort}`, autoLoad: false });

  // Load post and ancestors
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
  }, [id, user]);

  // Load replies when post loads or sort changes
  useEffect(() => {
    if (post) {
      refreshReplies();
    }
  }, [post, replySort, refreshReplies]);

  const handleReply = async (content: string, attachments: AttachmentInput[], sensitive: boolean, linkUrl?: string) => {
    if (!post) return;
    const { post: newReply } = await postsApi.create({ content, in_reply_to: post.id, attachments, sensitive, link_url: linkUrl });
    setReplies(prev => [...prev, newReply]);
  };

  if (loading && !post) {
    return <LoadingSpinner />;
  }

  if (error || !post) {
    return (
      <div className="alert alert-danger">{error || 'Post not found'}</div>
    );
  }

  return (
    <div>
      <PostThread post={post} ancestors={ancestors} />

      {user && (
        <div className="mt-4">
          {showReplyComposer ? (
            <div className="card">
              <div className="card-body">
                <PostComposer
                  placeholder={`Reply to ${post.author?.handle || 'this post'}...`}
                  submitLabel="Reply"
                  onSubmit={handleReply}
                  onSuccess={() => setShowReplyComposer(false)}
                  compact
                />
                <button
                  className="btn btn-link btn-sm text-muted p-0 mt-2"
                  onClick={() => setShowReplyComposer(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-outline-secondary w-100 text-start"
              onClick={() => setShowReplyComposer(true)}
            >
              <i className="bi bi-reply me-2"></i>
              Reply to {post.author?.name || post.author?.handle || 'this post'}...
            </button>
          )}
        </div>
      )}

      {replies.length > 0 && (
        <div className="mt-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0">
              <i className="bi bi-chat-dots-fill me-2"></i>
              Replies ({formatCount(post.replies_count ?? 0)})
            </h5>
            <SortToggle value={replySort} onChange={setReplySort} />
          </div>
          {replies.map((reply) => (
            <PostCard
              key={reply.id}
              post={reply}
              isOP={reply.author?.id === opAuthorId}
              onDelete={() => setReplies(prev => prev.filter(r => r.id !== reply.id))}
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
