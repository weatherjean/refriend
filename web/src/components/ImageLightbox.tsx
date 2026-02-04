import { useState, useEffect, useRef, useCallback } from 'react';
import { Attachment } from '../api';

interface ImageLightboxProps {
  attachments: Attachment[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

function isVideoType(mediaType: string): boolean {
  return mediaType.startsWith('video/') ||
    mediaType === 'image/gifv'; // Imgur's gifv format
}

function isRemoteUrl(url: string): boolean {
  return !url.startsWith('/') && !url.startsWith(window.location.origin);
}

function getProxyUrl(url: string): string {
  return `/api/proxy/media?url=${encodeURIComponent(url)}`;
}

export function ImageLightbox({ attachments, initialIndex, isOpen, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [useProxy, setUseProxy] = useState<Record<number, boolean>>({});
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ y: number; time: number } | null>(null);
  const pushedHistory = useRef(false);

  // Stable close ref to avoid stale closures in popstate handler
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Push history entry when lightbox opens, pop on close
  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ lightbox: true }, '');
      pushedHistory.current = true;

      const handlePopState = () => {
        pushedHistory.current = false;
        onCloseRef.current();
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
        // If we're cleaning up while still open (e.g. parent unmount), pop our entry
        if (pushedHistory.current) {
          pushedHistory.current = false;
          window.history.back();
        }
      };
    }
  }, [isOpen]);

  // When closing via X button or backdrop click, pop the history entry we pushed
  const handleClose = useCallback(() => {
    if (pushedHistory.current) {
      pushedHistory.current = false;
      window.history.back();
      // popstate handler will call onClose
    } else {
      onClose();
    }
  }, [onClose]);

  // Reset index when opened with a new initial index
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev - 1 + attachments.length) % attachments.length);
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev + 1) % attachments.length);
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, attachments.length, handleClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!isOpen || attachments.length === 0) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStart.current = { y: e.touches[0].clientY, time: Date.now() };
    setIsDragging(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragStart.current) return;
    const dy = e.touches[0].clientY - dragStart.current.y;
    // Only drag downward
    if (dy > 0) {
      setDragY(dy);
      setIsDragging(true);
    }
  };

  const handleTouchEnd = () => {
    if (!dragStart.current) return;
    const elapsed = Date.now() - dragStart.current.time;
    const velocity = dragY / Math.max(elapsed, 1);
    // Close if dragged far enough or fast enough
    if (dragY > 150 || velocity > 0.5) {
      handleClose();
    }
    setDragY(0);
    setIsDragging(false);
    dragStart.current = null;
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((currentIndex - 1 + attachments.length) % attachments.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((currentIndex + 1) % attachments.length);
  };

  const opacity = isDragging ? Math.max(0, 1 - dragY / 400) : 1;

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ backgroundColor: `rgba(0,0,0,${0.9 * opacity})`, zIndex: 1070 }}
      onClick={(e) => { e.stopPropagation(); handleClose(); }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <button
        className="btn btn-link text-white position-absolute end-0 fs-3"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))', right: '0.75rem', zIndex: 2 }}
        onClick={(e) => { e.stopPropagation(); handleClose(); }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <i className="bi bi-x-lg"></i>
      </button>
      {attachments.length > 1 && (
        <>
          <button
            className="btn btn-link text-white position-absolute start-0 top-50 translate-middle-y ms-3 fs-2"
            style={{ zIndex: 2 }}
            onClick={handlePrev}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <i className="bi bi-chevron-left"></i>
          </button>
          <button
            className="btn btn-link text-white position-absolute end-0 top-50 translate-middle-y me-3 fs-2"
            style={{ zIndex: 2 }}
            onClick={handleNext}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <i className="bi bi-chevron-right"></i>
          </button>
        </>
      )}
      <div
        style={{
          transform: `translateY(${dragY}px) scale(${isDragging ? Math.max(0.9, 1 - dragY / 1000) : 1})`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {isVideoType(attachments[currentIndex].media_type) ? (
          <video
            src={useProxy[currentIndex] ? getProxyUrl(attachments[currentIndex].url) : attachments[currentIndex].url}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()}
            preload="metadata"
            autoPlay
            loop
            playsInline
            controls
            onError={() => {
              const url = attachments[currentIndex].url;
              if (!useProxy[currentIndex] && isRemoteUrl(url)) {
                setUseProxy(prev => ({ ...prev, [currentIndex]: true }));
              }
            }}
          />
        ) : (
          <img
            src={attachments[currentIndex].url}
            alt={attachments[currentIndex].alt_text ?? ''}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
      {attachments.length > 1 && (
        <div
          className="position-absolute start-50 translate-middle-x text-white"
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          {currentIndex + 1} / {attachments.length}
        </div>
      )}
    </div>
  );
}
