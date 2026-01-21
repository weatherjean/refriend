import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Post, posts as postsApi } from '../api';
import { formatTimeAgo, getUsername } from '../utils';
import { useAuth } from '../context/AuthContext';
import { TagBadge } from './TagBadge';
import { Avatar } from './Avatar';
import { ImageSlider } from './ImageSlider';
import { ImageLightbox } from './ImageLightbox';

interface CommunityInfo {
  id: string;
  name: string;
  handle: string;
  avatar_url?: string | null;
}

interface PostCardProps {
  post: Post;
  linkToPost?: boolean;
  community?: CommunityInfo;
}

export function PostCard({ post, linkToPost = true, community: communityProp }: PostCardProps) {
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
  const [showSensitive, setShowSensitive] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const isOwnPost = !!(actor && post.author && actor.id === post.author.id);
  // Use community from post data or prop
  const community = post.community || communityProp;

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
        {community && (
          <Link
            to={`/c/${community.name}`}
            className="d-flex align-items-center text-decoration-none mb-2 small"
            onClick={(e) => e.stopPropagation()}
          >
            {community.avatar_url ? (
              <img
                src={community.avatar_url}
                alt=""
                className="rounded me-2"
                style={{ width: 18, height: 18, objectFit: 'cover' }}
              />
            ) : (
              <i className="bi bi-people-fill text-muted me-2"></i>
            )}
            <span className="text-muted">{community.name}</span>
          </Link>
        )}
        <div className="d-flex">
          <Link to={authorLink}>
            <Avatar
              src={post.author.avatar_url}
              name={username}
              size="md"
              className="me-3"
            />
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

            {/* Sensitive content wrapper */}
            {post.sensitive && !showSensitive ? (
              <div
                className="sensitive-content position-relative mb-2 p-3 rounded"
                style={{ backgroundColor: 'var(--bs-tertiary-bg)', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSensitive(true);
                }}
              >
                <div className="text-center text-muted">
                  <i className="bi bi-eye-slash fs-4 mb-2 d-block"></i>
                  <span>Sensitive content</span>
                  <br />
                  <small>Click to reveal</small>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-2" dangerouslySetInnerHTML={{ __html: post.content }} />

                {/* Image attachments */}
                {post.attachments && post.attachments.length > 0 && (
                  <ImageSlider
                    attachments={post.attachments}
                    onOpenLightbox={(index) => {
                      setLightboxIndex(index);
                      setLightboxOpen(true);
                    }}
                  />
                )}

                {/* Lightbox */}
                {post.attachments && post.attachments.length > 0 && (
                  <ImageLightbox
                    attachments={post.attachments}
                    initialIndex={lightboxIndex}
                    isOpen={lightboxOpen}
                    onClose={() => setLightboxOpen(false)}
                  />
                )}
              </>
            )}

            {post.hashtags.length > 0 && (
              <div className="mb-2 d-flex flex-wrap gap-1">
                {post.hashtags.map((tag) => (
                  <TagBadge key={tag} tag={tag} />
                ))}
              </div>
            )}

            {/* Actions row */}
            <div className="d-flex align-items-center mt-2 pt-2 border-top">
              <button
                className={`btn btn-sm me-2 ${liked ? '' : 'btn-outline-secondary'}`}
                onClick={handleLike}
                disabled={!user || likeLoading}
                title={user ? (liked ? 'Unlike' : 'Like') : 'Login to like'}
                style={liked ? {
                  backgroundColor: 'hsl(350, 70%, 90%)',
                  color: 'hsl(350, 70%, 35%)',
                  border: 'none',
                } : undefined}
              >
                {likeLoading ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <>
                    <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'} me-1`}></i>
                    {likesCount}
                  </>
                )}
              </button>

              {linkToPost && (
                <Link
                  to={postLink}
                  className={`btn btn-sm me-2 ${post.replies_count > 0 ? 'btn-outline-primary' : 'btn-outline-secondary'}`}
                  onClick={(e) => e.stopPropagation()}
                  title="View replies"
                >
                  <i className="bi bi-chat me-1"></i>
                  {post.replies_count}
                </Link>
              )}

              {!linkToPost && (
                <button
                  className={`btn btn-sm me-2 ${boosted ? '' : 'btn-outline-secondary'}`}
                  onClick={handleBoost}
                  disabled={!user || boostLoading || isOwnPost}
                  title={isOwnPost ? "Can't boost own post" : (user ? (boosted ? 'Unboost' : 'Boost') : 'Login to boost')}
                  style={boosted ? {
                    backgroundColor: 'hsl(140, 70%, 90%)',
                    color: 'hsl(140, 70%, 30%)',
                    border: 'none',
                  } : undefined}
                >
                  {boostLoading ? (
                    <span className="spinner-border spinner-border-sm"></span>
                  ) : (
                    <>
                      <i className="bi bi-arrow-repeat me-1"></i>
                      {boostsCount}
                    </>
                  )}
                </button>
              )}

              {isOwnPost && (
                <button
                  className={`btn btn-sm me-2 ${pinned ? '' : 'btn-outline-secondary'}`}
                  onClick={handlePin}
                  disabled={pinLoading}
                  title={pinned ? 'Unpin from profile' : 'Pin to profile'}
                  style={pinned ? {
                    backgroundColor: 'hsl(45, 70%, 85%)',
                    color: 'hsl(45, 70%, 30%)',
                    border: 'none',
                  } : undefined}
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
