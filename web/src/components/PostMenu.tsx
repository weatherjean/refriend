import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { posts as postsApi } from '../api';
import { ReportPostModal } from './ReportPostModal';
import { ConfirmModal } from './ConfirmModal';

interface PostMenuProps {
  postId: string;
  isOwnPost?: boolean;
  onDelete?: () => void;
  originalUrl?: string | null;
  remoteUrl?: string | null;
}

export function PostMenu({ postId, isOwnPost = false, onDelete, originalUrl, remoteUrl }: PostMenuProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    </div>
  );
}
