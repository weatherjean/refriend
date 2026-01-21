import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { posts as postsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
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
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [postData, repliesData] = await Promise.all([
          postsApi.get(id!),
          postsApi.getReplies(id!),
        ]);
        setPost(postData.post);
        setAncestors(postData.ancestors || []);
        setReplies(repliesData.replies);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load post');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleDelete = async () => {
    if (!post || !confirm('Are you sure you want to delete this post?')) return;

    setDeleting(true);
    try {
      await postsApi.delete(post.id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete post');
      setDeleting(false);
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

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !post) {
    return (
      <div className="alert alert-danger">{error || 'Post not found'}</div>
    );
  }

  const isOwner = actor && post.author && actor.id === post.author.id;

  // Rainbow colors for thread lines
  const threadColors = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
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
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Post'}
          </button>
        </div>
      )}

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
          <h5 className="mb-3">
            <i className="bi bi-chat-dots me-2"></i>
            Replies ({replies.length})
          </h5>
          {replies.map((reply) => (
            <PostCard key={reply.id} post={reply} />
          ))}
        </div>
      )}
    </div>
  );
}
