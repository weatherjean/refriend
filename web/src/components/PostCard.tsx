import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Post, posts as postsApi } from '../api';
import { formatTimeAgo, getUsername } from '../utils';
import { useAuth } from '../context/AuthContext';
import { TagBadge } from './TagBadge';

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
  const [showSensitive, setShowSensitive] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState<Record<number, boolean>>({});

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
                {post.attachments && post.attachments.length > 0 && (() => {
                  const currentAttachment = post.attachments[sliderIndex];
                  const isNotSquare = currentAttachment.height && currentAttachment.width &&
                    currentAttachment.height !== currentAttachment.width;
                  return (
                  <div className="mb-2 post-images-container position-relative w-100">
                    {/* Main image display - square crop */}
                    <div
                      className="post-image-wrapper position-relative rounded overflow-hidden w-100"
                      style={{
                        cursor: 'pointer',
                        aspectRatio: '1 / 1',
                        backgroundColor: 'var(--bs-tertiary-bg)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setLightboxIndex(sliderIndex);
                        setLightboxOpen(true);
                      }}
                    >
                      {/* Placeholder spinner */}
                      {!imageLoaded[sliderIndex] && (
                        <div className="position-absolute top-50 start-50 translate-middle">
                          <div className="spinner-border text-secondary" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      )}
                      <img
                        src={currentAttachment.url}
                        alt={currentAttachment.alt_text ?? ''}
                        className="w-100 h-100"
                        style={{
                          objectFit: 'cover',
                          opacity: imageLoaded[sliderIndex] ? 1 : 0,
                          transition: 'opacity 0.3s',
                        }}
                        loading="lazy"
                        onLoad={() => setImageLoaded(prev => ({ ...prev, [sliderIndex]: true }))}
                      />
                      {/* Cropped badge - show if image is not square */}
                      <div className="position-absolute top-0 end-0 m-2 d-flex gap-1">
                        {isNotSquare && (
                          <span className="badge bg-dark bg-opacity-75">
                            <i className="bi bi-crop me-1"></i>cropped
                          </span>
                        )}
                      </div>
                      {/* Image counter for multiple images */}
                      {post.attachments.length > 1 && (
                        <div className="position-absolute bottom-0 end-0 m-2 badge bg-dark bg-opacity-75">
                          {sliderIndex + 1} / {post.attachments.length}
                        </div>
                      )}
                    </div>
                    {/* Slider arrows for multiple images */}
                    {post.attachments.length > 1 && (
                      <>
                        <button
                          className="btn btn-sm btn-dark bg-opacity-50 position-absolute start-0 top-50 translate-middle-y ms-2 rounded-circle"
                          style={{ width: 32, height: 32, zIndex: 5 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSliderIndex((sliderIndex - 1 + post.attachments.length) % post.attachments.length);
                          }}
                        >
                          <i className="bi bi-chevron-left"></i>
                        </button>
                        <button
                          className="btn btn-sm btn-dark bg-opacity-50 position-absolute end-0 top-50 translate-middle-y me-2 rounded-circle"
                          style={{ width: 32, height: 32, zIndex: 5 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSliderIndex((sliderIndex + 1) % post.attachments.length);
                          }}
                        >
                          <i className="bi bi-chevron-right"></i>
                        </button>
                        {/* Dots indicator */}
                        <div className="d-flex justify-content-center gap-1 mt-2">
                          {post.attachments.map((_, idx) => (
                            <button
                              key={idx}
                              className={`btn btn-sm p-0 rounded-circle ${idx === sliderIndex ? 'btn-primary' : 'btn-outline-secondary'}`}
                              style={{ width: 8, height: 8, minWidth: 8 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSliderIndex(idx);
                              }}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  );
                })()}

                {/* Lightbox */}
                {lightboxOpen && post.attachments && post.attachments.length > 0 && (
                  <div
                    className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
                    style={{ backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 9999 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setLightboxOpen(false);
                    }}
                  >
                    <button
                      className="btn btn-link text-white position-absolute top-0 end-0 m-3 fs-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setLightboxOpen(false);
                      }}
                    >
                      <i className="bi bi-x-lg"></i>
                    </button>
                    {post.attachments.length > 1 && (
                      <>
                        <button
                          className="btn btn-link text-white position-absolute start-0 top-50 translate-middle-y ms-3 fs-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxIndex((lightboxIndex - 1 + post.attachments.length) % post.attachments.length);
                          }}
                        >
                          <i className="bi bi-chevron-left"></i>
                        </button>
                        <button
                          className="btn btn-link text-white position-absolute end-0 top-50 translate-middle-y me-3 fs-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxIndex((lightboxIndex + 1) % post.attachments.length);
                          }}
                        >
                          <i className="bi bi-chevron-right"></i>
                        </button>
                      </>
                    )}
                    <img
                      src={post.attachments[lightboxIndex].url}
                      alt={post.attachments[lightboxIndex].alt_text ?? ''}
                      style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {post.attachments.length > 1 && (
                      <div className="position-absolute bottom-0 start-50 translate-middle-x mb-4 text-white">
                        {lightboxIndex + 1} / {post.attachments.length}
                      </div>
                    )}
                  </div>
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
