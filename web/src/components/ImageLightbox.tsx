import { useState, useEffect } from 'react';
import { Modal } from 'react-bootstrap';
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, attachments.length]);

  if (attachments.length === 0) return null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((currentIndex - 1 + attachments.length) % attachments.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((currentIndex + 1) % attachments.length);
  };

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      fullscreen
      centered
      contentClassName="bg-transparent border-0"
      dialogClassName="m-0"
    >
      <div
        className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <button
          className="btn btn-link text-white position-absolute end-0 fs-3"
          style={{ top: 'max(0.75rem, env(safe-area-inset-top))', right: '0.75rem' }}
          onClick={onClose}
        >
          <i className="bi bi-x-lg"></i>
        </button>
        {attachments.length > 1 && (
          <>
            <button
              className="btn btn-link text-white position-absolute start-0 top-50 translate-middle-y ms-3 fs-2"
              onClick={handlePrev}
            >
              <i className="bi bi-chevron-left"></i>
            </button>
            <button
              className="btn btn-link text-white position-absolute end-0 top-50 translate-middle-y me-3 fs-2"
              onClick={handleNext}
            >
              <i className="bi bi-chevron-right"></i>
            </button>
          </>
        )}
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
        {attachments.length > 1 && (
          <div
            className="position-absolute start-50 translate-middle-x text-white"
            style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {currentIndex + 1} / {attachments.length}
          </div>
        )}
      </div>
    </Modal>
  );
}
