import { useState, useRef, useEffect } from 'react';
import { SuggestToCommunityModal } from './SuggestToCommunityModal';

interface PostMenuProps {
  postId: string;
}

export function PostMenu({ postId }: PostMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleSuggestClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setShowSuggestModal(true);
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
          <button
            className="post-menu-item"
            onClick={handleSuggestClick}
          >
            <i className="bi bi-send-plus"></i>
            <span>Suggest to community</span>
          </button>
        </div>
      )}

      {showSuggestModal && (
        <SuggestToCommunityModal
          postId={postId}
          onClose={() => setShowSuggestModal(false)}
        />
      )}
    </div>
  );
}
