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
  const community = post.community || communityProp;

  if (!post.author) return null;

  const username = getUsername(post.author.handle);
  const authorLink = `/u/${post.author.handle}`;
  const postLink = `/posts/${post.id}`;

  const handleCardClick = (e: React.MouseEvent) => {
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
        {/* Author row */}
        <div className="d-flex align-items-center mb-3">
          {/* Community pill - right aligned */}
          {community && (
            <Link
              to={`/c/${community.name}`}
              className="community-pill ms-auto order-1"
              onClick={(e) => e.stopPropagation()}
            >
              {community.avatar_url ? (
                <img src={community.avatar_url} alt="" />
              ) : (
                <i className="bi bi-people-fill"></i>
              )}
              <span>{community.name}</span>
            </Link>
          )}
          <Link to={authorLink} onClick={(e) => e.stopPropagation()}>
            <Avatar
              src={post.author.avatar_url}
              name={username}
              size="md"
              className="me-3 flex-shrink-0"
            />
          </Link>
          <div className="flex-grow-1 min-width-0">
            <div className="d-flex align-items-baseline flex-wrap gap-1">
              <Link
                to={authorLink}
                className="post-author text-decoration-none"
                onClick={(e) => e.stopPropagation()}
              >
                {post.author.name || username}
              </Link>
              <span className="post-handle">{post.author.handle}</span>
              {!post.author.is_local && (
                <span className="text-success ms-1" title="Remote user">
                  <i className="bi bi-globe2"></i>
                </span>
              )}
            </div>
            <div className="post-time">
              {formatTimeAgo(post.created_at)}
            </div>
          </div>
        </div>

        {/* Reply indicator */}
        {post.in_reply_to && post.in_reply_to.author && (
          <div className="post-meta mb-2">
            <i className="bi bi-reply me-1"></i>
            Replying to{' '}
            <Link
              to={`/u/${post.in_reply_to.author.handle}`}
              className="text-decoration-none"
              onClick={(e) => e.stopPropagation()}
            >
              {post.in_reply_to.author.name || post.in_reply_to.author.handle}
            </Link>
          </div>
        )}

        {/* Content */}
        {post.sensitive && !showSensitive ? (
          <div
            className="rounded p-3 mb-3 text-center"
            style={{ backgroundColor: 'var(--bs-tertiary-bg)', cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              setShowSensitive(true);
            }}
          >
            <i className="bi bi-eye-slash fs-4 d-block mb-1 text-muted"></i>
            <span className="text-muted small">Sensitive content · Click to reveal</span>
          </div>
        ) : (
          <>
            <div
              className="post-content mb-3"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {post.attachments && post.attachments.length > 0 && (
              <div className="mb-3">
                <ImageSlider
                  attachments={post.attachments}
                  onOpenLightbox={(index) => {
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }}
                />
              </div>
            )}

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

        {/* Hashtags */}
        {post.hashtags.length > 0 && (
          <div className="d-flex flex-wrap gap-1 mb-2">
            {post.hashtags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="post-actions">
          <button
            className={`post-action-btn ${liked ? 'liked' : ''}`}
            onClick={handleLike}
            disabled={!user || likeLoading}
            title={user ? (liked ? 'Unlike' : 'Like') : 'Login to like'}
          >
            {likeLoading ? (
              <span className="spinner-border spinner-border-sm"></span>
            ) : (
              <>
                <i className={`bi ${liked ? 'bi-heart-fill' : 'bi-heart'}`}></i>
                <span>{likesCount || ''}</span>
              </>
            )}
          </button>

          {linkToPost && (
            <Link
              to={postLink}
              className={`post-action-btn ${post.replies_count > 0 ? 'has-replies' : ''}`}
              onClick={(e) => e.stopPropagation()}
              title="View replies"
            >
              <i className="bi bi-chat"></i>
              <span>{post.replies_count || ''}</span>
            </Link>
          )}

          {!linkToPost && (
            <button
              className={`post-action-btn ${boosted ? 'boosted' : ''}`}
              onClick={handleBoost}
              disabled={!user || boostLoading || isOwnPost}
              title={isOwnPost ? "Can't boost own post" : (user ? (boosted ? 'Unboost' : 'Boost') : 'Login to boost')}
            >
              {boostLoading ? (
                <span className="spinner-border spinner-border-sm"></span>
              ) : (
                <>
                  <i className="bi bi-arrow-repeat"></i>
                  <span>{boostsCount || ''}</span>
                </>
              )}
            </button>
          )}

          {isOwnPost && (
            <button
              className={`post-action-btn ${pinned ? 'pinned' : ''}`}
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
        </div>
      </div>
    </div>
  );
}
