import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Post, posts as postsApi } from '../api';
import { formatTimeAgo, getUsername, sanitizeHtml, getCommunitySlug } from '../utils';
import { useAuth } from '../context/AuthContext';
import { TagBadge } from './TagBadge';
import { Avatar } from './Avatar';
import { ImageSlider } from './ImageSlider';
import { ImageLightbox } from './ImageLightbox';
import { PostMenu } from './PostMenu';
import { VideoEmbed } from './VideoEmbed';

interface CommunityInfo {
  id: string;
  name: string;
  handle: string;
  avatar_url?: string | null;
  is_local: boolean;
}

interface PostCardProps {
  post: Post;
  linkToPost?: boolean;
  community?: CommunityInfo;
  isOP?: boolean;
  pinnedInCommunity?: boolean;
  canPinInCommunity?: boolean;
  onCommunityPin?: () => void;
  canUnboost?: boolean;
  onUnboost?: () => void;
  isCommunityAdmin?: boolean;
  onDelete?: () => void;
  communityName?: string;
}

export function PostCard({ post, linkToPost = true, community: communityProp, isOP, pinnedInCommunity, canPinInCommunity, onCommunityPin, canUnboost, onUnboost, isCommunityAdmin, onDelete, communityName: communityNameProp }: PostCardProps) {
  const navigate = useNavigate();
  const { user, actor } = useAuth();
  const [liked, setLiked] = useState(post.liked ?? false);
  const [likesCount, setLikesCount] = useState(post.likes_count ?? 0);
  const [likeLoading, setLikeLoading] = useState(false);
  const [boosted, setBoosted] = useState(post.boosted ?? false);
  const [boostsCount, setBoostsCount] = useState(post.boosts_count ?? 0);
  const [boostLoading, setBoostLoading] = useState(false);
  const [pinned, setPinned] = useState(post.pinned ?? false);
  const [pinLoading, setPinLoading] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [linkPreviewLightboxOpen, setLinkPreviewLightboxOpen] = useState(false);
  const [linkPreviewImageError, setLinkPreviewImageError] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (linkToPost && contentRef.current) {
      const el = contentRef.current;
      setIsTruncated(el.scrollHeight > el.clientHeight);
    }
  }, [linkToPost, post.content]);

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
    } catch {
      // Error handled by global toast
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
    } catch {
      // Error handled by global toast
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
    } catch {
      // Error handled by global toast
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
        {/* Pinned indicator */}
        {pinnedInCommunity && (
          <div className="post-pinned-indicator">
            <i className="bi bi-pin-fill"></i>
            <span>Pinned</span>
          </div>
        )}

        {/* Boosted by indicator */}
        {post.boosted_by && (
          <div className="post-boosted-indicator">
            <i className="bi bi-arrow-repeat"></i>
            <Link
              to={`/u/${post.boosted_by.handle}`}
              onClick={(e) => e.stopPropagation()}
              className="text-decoration-none"
            >
              {post.boosted_by.name || post.boosted_by.handle} boosted
            </Link>
          </div>
        )}

        {/* Community pill - shown above header on mobile */}
        {community && (
          <Link
            to={`/c/${getCommunitySlug(community.handle, community.is_local)}`}
            className="community-pill community-pill-mobile"
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

        {/* Header: Avatar + Meta + Community */}
        <div className="post-header">
          <Link to={authorLink} onClick={(e) => e.stopPropagation()} className="post-avatar-link">
            <Avatar
              src={post.author.avatar_url}
              name={username}
              size="md"
            />
          </Link>
          <div className="post-meta-block">
            <div className="post-author-line">
              <Link
                to={authorLink}
                className="post-author text-decoration-none"
                onClick={(e) => e.stopPropagation()}
              >
                {post.author.name || username}
              </Link>
              {isOP && (
                <span className="badge text-bg-warning ms-1" style={{ fontSize: '0.65rem', verticalAlign: 'middle' }}>OP</span>
              )}
              {!post.author.is_local && (
                <span className="post-remote-icon" title="Remote user">
                  <i className="bi bi-globe2"></i>
                </span>
              )}
              <span className="post-time">{formatTimeAgo(post.created_at)}</span>
            </div>
            <div className="post-handle">{post.author.handle}</div>
          </div>
          {community && (
            <Link
              to={`/c/${getCommunitySlug(community.handle, community.is_local)}`}
              className="community-pill community-pill-desktop"
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
        </div>

        {/* Reply indicator */}
        {post.in_reply_to && post.in_reply_to.author && (
          <div className="post-reply-indicator">
            <i className="bi bi-reply-fill"></i>
            <span>Replying to </span>
            <Link
              to={`/u/${post.in_reply_to.author.handle}`}
              onClick={(e) => e.stopPropagation()}
            >
              {post.in_reply_to.author.name || post.in_reply_to.author.handle}
            </Link>
          </div>
        )}

        {/* Content */}
        {post.sensitive && !showSensitive ? (
          <div
            className="post-sensitive-cover"
            onClick={(e) => {
              e.stopPropagation();
              setShowSensitive(true);
            }}
          >
            <i className="bi bi-eye-slash-fill"></i>
            <span>Sensitive content · Click to reveal</span>
          </div>
        ) : (
          <>
            <div
              ref={contentRef}
              className={`post-content ${linkToPost ? 'post-content-truncated' : ''}`}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
            />
            {linkToPost && isTruncated && (
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm mt-2 mb-3"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(postLink);
                }}
              >
                Read in full <i className="bi bi-arrow-right ms-1"></i>
              </button>
            )}

            {post.attachments && post.attachments.length > 0 && (
              <div className="post-attachments">
                <ImageSlider
                  attachments={post.attachments}
                  onOpenLightbox={(index) => {
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }}
                  disableVideo={linkToPost}
                  onVideoClick={() => navigate(postLink)}
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

            {/* Link Preview Card */}
            {post.link_preview && (
              <div className="link-preview-card" onClick={(e) => e.stopPropagation()}>
                {post.link_preview.image && !linkPreviewImageError && (
                  <div
                    className="link-preview-image"
                    onClick={() => setLinkPreviewLightboxOpen(true)}
                  >
                    <img
                      src={post.link_preview.image}
                      alt=""
                      onError={() => setLinkPreviewImageError(true)}
                    />
                  </div>
                )}
                <a
                  href={post.link_preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-preview-content"
                >
                  {post.link_preview.title && (
                    <div className="link-preview-title">{post.link_preview.title}</div>
                  )}
                  {post.link_preview.description && (
                    <div className="link-preview-description">{post.link_preview.description}</div>
                  )}
                  <div className="link-preview-domain">
                    <i className="bi bi-link-45deg me-1"></i>
                    {new URL(post.link_preview.url).hostname}
                  </div>
                </a>
              </div>
            )}

            {/* Link Preview Lightbox */}
            {post.link_preview?.image && !linkPreviewImageError && (
              <ImageLightbox
                attachments={[{ id: 0, url: post.link_preview.image, media_type: 'image/jpeg', alt_text: post.link_preview.title || null, width: null, height: null }]}
                initialIndex={0}
                isOpen={linkPreviewLightboxOpen}
                onClose={() => setLinkPreviewLightboxOpen(false)}
              />
            )}

            {/* Video Embed */}
            {post.video_embed && (
              <VideoEmbed
                video={post.video_embed}
                onPlayClick={linkToPost ? () => navigate(postLink) : undefined}
              />
            )}
          </>
        )}

        {/* Hashtags */}
        {post.hashtags && post.hashtags.length > 0 && (
          <div className="post-hashtags">
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
                <span>{likesCount}</span>
              </>
            )}
          </button>

          {linkToPost && (
            <Link
              to={postLink}
              className={`post-action-btn ${(post.replies_count ?? 0) > 0 ? 'has-replies' : ''}`}
              onClick={(e) => e.stopPropagation()}
              title="View replies"
            >
              <i className="bi bi-chat"></i>
              <span>{post.replies_count ?? 0}</span>
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
                  <span>{boostsCount}</span>
                </>
              )}
            </button>
          )}

          {isOwnPost && !community && (
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

          {canPinInCommunity && onCommunityPin && (
            <button
              className={`post-action-btn ${pinnedInCommunity ? 'pinned' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onCommunityPin();
              }}
              title={pinnedInCommunity ? 'Unpin from community' : 'Pin in community'}
            >
              <i className={`bi ${pinnedInCommunity ? 'bi-pin-fill' : 'bi-pin'}`}></i>
            </button>
          )}

          {canUnboost && onUnboost && (
            <button
              className="post-action-btn text-danger"
              onClick={(e) => {
                e.stopPropagation();
                onUnboost();
              }}
              title="Remove from community"
            >
              <i className="bi bi-x-circle"></i>
            </button>
          )}

          {user && (
            <PostMenu
              postId={post.id}
              isOwnPost={post.author?.id === actor?.id}
              isCommunityAdmin={isCommunityAdmin}
              communityName={community?.name || communityNameProp}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
