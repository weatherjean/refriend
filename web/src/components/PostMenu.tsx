import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Modal, Button } from 'react-bootstrap';
import { posts as postsApi, feeds as feedsApi, FeedBookmark } from '../api';
import { ReportPostModal } from './ReportPostModal';
import { ConfirmModal } from './ConfirmModal';

interface PostMenuProps {
  postId: string;
  isOwnPost?: boolean;
  onDelete?: () => void;
  originalUrl?: string | null;
  remoteUrl?: string | null;
  feedSlug?: string;
  onRemoveFromFeed?: () => void;
}

export function PostMenu({ postId, isOwnPost = false, onDelete, originalUrl, remoteUrl, feedSlug, onRemoveFromFeed }: PostMenuProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [bookmarkedFeeds, setBookmarkedFeeds] = useState<FeedBookmark[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [feedActionLoading, setFeedActionLoading] = useState<string | null>(null);
  const [feedActionDone, setFeedActionDone] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  const canDelete = isOwnPost;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleReportClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setShowReportModal(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await postsApi.delete(postId);
      setShowDeleteConfirm(false);
      if (onDelete) {
        onDelete();
      } else {
        navigate(-1);
      }
    } catch {
      // Error handled by global toast
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleRemoveFromFeed = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (!feedSlug) return;
    try {
      await feedsApi.removePost(feedSlug, postId);
      onRemoveFromFeed?.();
    } catch {
      // Error handled by global toast
    }
  };

  const handleSuggestToFeed = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setShowFeedModal(true);
    setFeedActionDone(new Set());
    if (bookmarkedFeeds.length === 0) {
      setFeedsLoading(true);
      try {
        const { feeds } = await feedsApi.getBookmarks();
        setBookmarkedFeeds(feeds);
      } catch {
        setBookmarkedFeeds([]);
      } finally {
        setFeedsLoading(false);
      }
    }
  };

  const handleFeedAction = async (feed: FeedBookmark) => {
    setFeedActionLoading(feed.slug);
    try {
      if (feed.is_owner || feed.is_moderator) {
        await feedsApi.addPost(feed.slug, postId);
      } else {
        await feedsApi.suggest(feed.slug, postId);
      }
      setFeedActionDone(prev => new Set(prev).add(feed.slug));
    } catch {
      // Error handled by global toast
    } finally {
      setFeedActionLoading(null);
    }
  };

  return (
    <div className="post-menu" ref={menuRef}>
      <button
        className="post-action-btn"
        onClick={handleToggle}
        title="More options"
      >
        <i className="bi bi-three-dots"></i>
      </button>

      {isOpen && (
        <div className="post-menu-dropdown">
          {originalUrl && (
            <a
              className="post-menu-item"
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <i className="bi bi-box-arrow-up-right"></i>
              <span>View original</span>
            </a>
          )}
          {remoteUrl && remoteUrl !== originalUrl && (
            <a
              className="post-menu-item"
              href={remoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <i className="bi bi-globe2"></i>
              <span>View on remote instance</span>
            </a>
          )}
          <button
            className="post-menu-item"
            onClick={handleSuggestToFeed}
          >
            <i className="bi bi-journal-plus"></i>
            <span>Add to feed</span>
          </button>
          {feedSlug && (
            <button
              className="post-menu-item post-menu-item-danger"
              onClick={handleRemoveFromFeed}
            >
              <i className="bi bi-journal-minus"></i>
              <span>Remove from feed</span>
            </button>
          )}
          {!isOwnPost && (
            <button
              className="post-menu-item post-menu-item-danger"
              onClick={handleReportClick}
            >
              <i className="bi bi-flag"></i>
              <span>Report post</span>
            </button>
          )}
          {canDelete && (
            <button
              className="post-menu-item post-menu-item-danger"
              onClick={handleDeleteClick}
            >
              <i className="bi bi-trash"></i>
              <span>Delete post</span>
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        show={showDeleteConfirm}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {showReportModal && (
        <ReportPostModal
          postId={postId}
          onClose={() => setShowReportModal(false)}
        />
      )}

      <Modal show={showFeedModal} onHide={() => setShowFeedModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add to Feed</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {feedsLoading ? (
            <div className="text-center py-3">
              <div className="spinner-border spinner-border-sm"></div>
            </div>
          ) : bookmarkedFeeds.length === 0 ? (
            <p className="text-muted mb-0">
              No bookmarked feeds. <Link to="/feeds" onClick={() => setShowFeedModal(false)}>Explore feeds</Link> to bookmark some.
            </p>
          ) : (
            <div className="list-group">
              {bookmarkedFeeds.map((feed) => (
                <div key={feed.slug} className="list-group-item d-flex justify-content-between align-items-center">
                  <span className="text-truncate me-2">{feed.name}</span>
                  {feedActionDone.has(feed.slug) ? (
                    <span className="badge text-bg-success">
                      <i className="bi bi-check"></i> Done
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={feed.is_owner || feed.is_moderator ? 'primary' : 'outline-primary'}
                      onClick={() => handleFeedAction(feed)}
                      disabled={feedActionLoading === feed.slug}
                    >
                      {feedActionLoading === feed.slug ? (
                        <span className="spinner-border spinner-border-sm"></span>
                      ) : feed.is_owner || feed.is_moderator ? (
                        'Add'
                      ) : (
                        'Suggest'
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowFeedModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
