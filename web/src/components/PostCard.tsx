import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Post, Actor, posts as postsApi } from '../api';
import { formatTimeAgo, getUsername, sanitizeHtml } from '../utils';
import { useAuth } from '../context/AuthContext';
import { TagBadge } from './TagBadge';
import { Avatar } from './Avatar';
import { ImageSlider } from './ImageSlider';
import { ImageLightbox } from './ImageLightbox';
import { PostMenu } from './PostMenu';
import { VideoEmbed } from './VideoEmbed';
import { ActorListModal } from './ActorListModal';

interface PostCardProps {
  post: Post;
  linkToPost?: boolean;
  isOP?: boolean;
  onDelete?: () => void;
}

export function PostCard({ post, linkToPost = true, isOP, onDelete }: PostCardProps) {
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
  const [showInfoMenu, setShowInfoMenu] = useState(false);
  const [showLikersModal, setShowLikersModal] = useState(false);
  const [showBoostersModal, setShowBoostersModal] = useState(false);
  const [likers, setLikers] = useState<Actor[]>([]);
  const [boosters, setBoosters] = useState<Actor[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);
  const [boostersLoading, setBoostersLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const infoMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (linkToPost && contentRef.current) {
      const el = contentRef.current;
      setIsTruncated(el.scrollHeight > el.clientHeight);
    }
  }, [linkToPost, post.content]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (infoMenuRef.current && !infoMenuRef.current.contains(event.target as Node)) {
        setShowInfoMenu(false);
      }
    }
    if (showInfoMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showInfoMenu]);

  const openLikersModal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowInfoMenu(false);
    setShowLikersModal(true);
    setLikersLoading(true);
    try {
      const result = await postsApi.getLikers(post.id);
      setLikers(result.likers);
    } catch {
      // Error handled by global toast
    } finally {
      setLikersLoading(false);
    }
  };

  const openBoostersModal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowInfoMenu(false);
    setShowBoostersModal(true);
    setBoostersLoading(true);
    try {
      const result = await postsApi.getBoosters(post.id);
      setBoosters(result.boosters);
    } catch {
      // Error handled by global toast
    } finally {
      setBoostersLoading(false);
    }
  };

  const isOwnPost = !!(actor && post.author && actor.id === post.author.id);

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
        {/* Boosted by indicator */}
        {post.boosted_by && (
          <Link
            to={`/u/${post.boosted_by.handle}`}
            onClick={(e) => e.stopPropagation()}
            className="d-flex align-items-center gap-2 text-decoration-none text-muted small px-3 py-2 mb-2"
            style={{ background: 'var(--bs-tertiary-bg)', margin: '-1rem -1rem 0.75rem -1rem', borderBottom: '1px solid var(--bs-border-color)' }}
          >
            <Avatar src={post.boosted_by.avatar_url} name={post.boosted_by.handle} size="sm" />
            {post.boosted_by.actor_type === 'Group' ? (
              <span>
                shared into <strong>{post.boosted_by.name || post.boosted_by.handle}</strong>
                {boostsCount > 1 && <span className="text-muted"> and {boostsCount - 1} {boostsCount - 1 === 1 ? 'other' : 'others'}</span>}
              </span>
            ) : (
              <span>
                boosted by <strong>{post.boosted_by.name || post.boosted_by.handle}</strong>
                {boostsCount > 1 && <span className="text-muted"> and {boostsCount - 1} {boostsCount - 1 === 1 ? 'other' : 'others'}</span>}
              </span>
            )}
          </Link>
        )}

        {/* Header: Avatar + Meta */}
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

          {(likesCount > 0 || boostsCount > 0) && (
            <div className="post-menu" ref={infoMenuRef}>
              <button
                className="post-action-btn"
                onClick={(e) => { e.stopPropagation(); setShowInfoMenu(!showInfoMenu); }}
                title="View likes and boosts"
              >
                <i className="bi bi-info-circle"></i>
              </button>
              {showInfoMenu && (
                <div className="post-menu-dropdown">
                  {likesCount > 0 && (
                    <button className="post-menu-item" onClick={openLikersModal}>
                      <i className="bi bi-heart"></i>
                      <span>View likes ({likesCount})</span>
                    </button>
                  )}
                  {boostsCount > 0 && (
                    <button className="post-menu-item" onClick={openBoostersModal}>
                      <i className="bi bi-arrow-repeat"></i>
                      <span>View boosts ({boostsCount})</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {user && (
            <PostMenu
              postId={post.id}
              isOwnPost={post.author?.id === actor?.id}
              onDelete={onDelete}
              originalUrl={post.url}
            />
          )}
        </div>
      </div>

      <ActorListModal
        show={showLikersModal}
        title="Likes"
        actors={likers}
        loading={likersLoading}
        onClose={() => setShowLikersModal(false)}
        emptyMessage="No likes yet"
      />

      <ActorListModal
        show={showBoostersModal}
        title="Boosts"
        actors={boosters}
        loading={boostersLoading}
        onClose={() => setShowBoostersModal(false)}
        emptyMessage="No boosts yet"
      />
    </div>
  );
}
