import { Post } from '../api';
import { PostCard } from './PostCard';

// Rainbow colors for thread lines (starts with logo colors)
const THREAD_COLORS = [
  '#f87171', // red (logo)
  '#fbbf24', // yellow (logo)
  '#4ade80', // green (logo)
  '#38bdf8', // sky
  '#818cf8', // indigo
  '#e879f9', // fuchsia
];

interface PostThreadProps {
  post: Post;
  ancestors?: Post[];
  linkMainPost?: boolean;
}

export function PostThread({
  post,
  ancestors = [],
  linkMainPost = false,
}: PostThreadProps) {
  if (ancestors.length === 0) {
    return <PostCard post={post} linkToPost={linkMainPost} />;
  }

  // Build from inside out - start with current post, wrap with ancestors' lines
  let content = <PostCard post={post} linkToPost={linkMainPost} />;

  // Wrap from last ancestor to first (reverse order for nesting)
  // Each ancestor's PostCard is OUTSIDE the wrapper, line wraps what comes after
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    const color = THREAD_COLORS[i % THREAD_COLORS.length];
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
}

interface ReplyThreadProps {
  reply: Post;
  parentPost?: Post;
}

export function ReplyThread({ reply, parentPost }: ReplyThreadProps) {
  const parent = parentPost || (reply.in_reply_to as Post | null);

  if (!parent) {
    return <PostCard post={reply} />;
  }

  return (
    <div className="mb-3">
      <PostCard post={parent} />
      <div style={{ borderLeft: '3px solid #333', paddingLeft: 16, marginLeft: 8 }}>
        <PostCard post={reply} />
      </div>
    </div>
  );
}
