import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Post, posts as postsApi } from '../api';
import { formatTimeAgo, getUsername } from '../utils';
import { useAuth } from '../context/AuthContext';

interface PostCardProps {
  post: Post;
  linkToPost?: boolean;
}

export function PostCard({ post, linkToPost = true }: PostCardProps) {
  const navigate = useNavigate();
  const { user, actor } = useAuth();
  const [liked, setLiked] = useState(post.liked);
  const [likesCount, setLikesCount] = useState(post.likes_count);
  const [likeLoading, setLikeLoading] = useState(false);
  const [boosted, setBoosted] = useState(post.boosted);
  const [boostsCount, setBoostsCount] = useState(post.boosts_count);
  const [boostLoading, setBoostLoading] = useState(false);
  const [pinned, setPinned] = useState(post.pinned);
  const [pinLoading, setPinLoading] = useState(false);

  const isOwnPost = !!(actor && post.author && actor.id === post.author.id);

  if (!post.author) return null;

  const username = getUsername(post.author.handle);
  const authorLink = `/u/${post.author.handle}`;
  const postLink = `/posts/${post.id}`;

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on a link or button inside
    if ((e.target as HTMLElement).closest('a, button')) return;
    if (linkToPost) {
      navigate(postLink);
    }
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || likeLoading) return;

    setLikeLoading(true);
    try {
      if (liked) {
        const result = await postsApi.unlike(post.id);
        setLiked(result.liked);
        setLikesCount(result.likes_count);
      } else {
        const result = await postsApi.like(post.id);
        setLiked(result.liked);
        setLikesCount(result.likes_count);
      }
    } catch (err) {
      console.error('Like/unlike failed:', err);
    } finally {
      setLikeLoading(false);
    }
  };

  const handleBoost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || boostLoading || isOwnPost) return;

    setBoostLoading(true);
    try {
      if (boosted) {
        const result = await postsApi.unboost(post.id);
        setBoosted(result.boosted);
        setBoostsCount(result.boosts_count);
      } else {
        const result = await postsApi.boost(post.id);
        setBoosted(result.boosted);
        setBoostsCount(result.boosts_count);
      }
    } catch (err) {
      console.error('Boost/unboost failed:', err);
    } finally {
      setBoostLoading(false);
    }
  };

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || pinLoading || !isOwnPost) return;

    setPinLoading(true);
    try {
      if (pinned) {
        const result = await postsApi.unpin(post.id);
        setPinned(result.pinned);
      } else {
        const result = await postsApi.pin(post.id);
        setPinned(result.pinned);
      }
    } catch (err) {
      console.error('Pin/unpin failed:', err);
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div
      className="card post-card mb-3"
      onClick={handleCardClick}
      style={{ cursor: linkToPost ? 'pointer' : 'default' }}
    >
      <div className="card-body">
        <div className="d-flex">
          <Link to={authorLink}>
            {post.author.avatar_url ? (
              <img
                src={post.author.avatar_url}
                alt=""
                className="rounded-circle me-3"
                style={{ width: 40, height: 40, objectFit: 'cover' }}
              />
            ) : (
              <div className="avatar avatar-sm me-3">
                {username[0]?.toUpperCase()}
              </div>
            )}
          </Link>
          <div className="flex-grow-1">
            <div className="d-flex align-items-center mb-1">
              <Link to={authorLink} className="text-decoration-none">
                <span className="fw-semibold me-2">
                  {post.author.name || username}
                </span>
              </Link>
              <span className="text-muted small">{post.author.handle}</span>
              <span className="text-muted small ms-2">
                &middot; {formatTimeAgo(post.created_at)}
              </span>
            </div>

            {post.in_reply_to && post.in_reply_to.author && (
              <div className="text-muted small mb-1">
                <i className="bi bi-reply me-1"></i>
                Replying to{' '}
                <Link to={`/u/${post.in_reply_to.author.handle}`} className="text-decoration-none">
                  {post.in_reply_to.author.handle}
                </Link>
              </div>
            )}

            <div className="mb-2" dangerouslySetInnerHTML={{ __html: post.content }} />

            {post.hashtags.length > 0 && (
              <div className="mb-2">
                {post.hashtags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/tags/${tag}`}
                    className="badge bg-secondary text-decoration-none me-1"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Actions row */}
            <div className="d-flex align-items-center mt-2 pt-2 border-top">
              <button
                className={`btn btn-sm ${liked ? 'btn-danger' : 'btn-outline-secondary'} me-2`}
                onClick={handleLike}
                disabled={!user || likeLoading}
                title={user ? (liked ? 'Unlike' : 'Like') : 'Login to like'}
              >
                {likeLoading ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <>
                    <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'} me-1`}></i>
                    {likesCount > 0 && likesCount}
                  </>
                )}
              </button>

              <button
                className={`btn btn-sm ${boosted ? 'btn-success' : 'btn-outline-secondary'} me-2`}
                onClick={handleBoost}
                disabled={!user || boostLoading || isOwnPost}
                title={isOwnPost ? "Can't boost own post" : (user ? (boosted ? 'Unboost' : 'Boost') : 'Login to boost')}
              >
                {boostLoading ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <>
                    <i className={`bi ${boosted ? 'bi-arrow-repeat' : 'bi-arrow-repeat'} me-1`}></i>
                    {boostsCount > 0 && boostsCount}
                  </>
                )}
              </button>

              {linkToPost && (
                <Link
                  to={postLink}
                  className="btn btn-sm btn-outline-secondary me-2"
                  onClick={(e) => e.stopPropagation()}
                  title="View replies"
                >
                  <i className="bi bi-chat me-1"></i>
                  {post.replies_count > 0 && post.replies_count}
                </Link>
              )}

              {isOwnPost && (
                <button
                  className={`btn btn-sm ${pinned ? 'btn-warning' : 'btn-outline-secondary'} me-2`}
                  onClick={handlePin}
                  disabled={pinLoading}
                  title={pinned ? 'Unpin from profile' : 'Pin to profile'}
                >
                  {pinLoading ? (
                    <span className="spinner-border spinner-border-sm"></span>
                  ) : (
                    <i className={`bi ${pinned ? 'bi-pin-fill' : 'bi-pin'}`}></i>
                  )}
                </button>
              )}

              {!post.author.is_local && (
                <span className="badge bg-secondary ms-auto">
                  <i className="bi bi-globe me-1"></i>Remote
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
