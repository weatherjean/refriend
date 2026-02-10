import { useNavigate } from 'react-router-dom';
import type { Post } from '../api';
import { formatTimeAgo, getPostLink, sanitizeHtml, getUsername } from '../utils';
import { Avatar } from './Avatar';

interface QuoteCardProps {
  post: Post['quoted_post'];
}

export function QuoteCard({ post }: QuoteCardProps) {
  const navigate = useNavigate();

  if (!post || !post.author) return null;

  const username = getUsername(post.author.handle);
  const postLink = getPostLink(post);
  const firstImage = post.attachments?.find(a => a.media_type.startsWith('image/'));

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(postLink);
  };

  return (
    <div className="quote-card" onClick={handleClick}>
      <div className="quote-card-header">
        <Avatar src={post.author.avatar_url} name={username} size="sm" />
        <span className="quote-card-author">{post.author.name || username}</span>
        <span className="quote-card-handle">{post.author.handle}</span>
        <span className="quote-card-time">{formatTimeAgo(post.created_at)}</span>
      </div>
      <div
        className="quote-card-content"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
      />
      {firstImage && (
        <div className="quote-card-image">
          <img src={firstImage.url} alt={firstImage.alt_text || ''} />
        </div>
      )}
    </div>
  );
}
