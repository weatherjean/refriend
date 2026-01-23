import { useState } from 'react';
import { Attachment } from '../api';

interface ImageSliderProps {
  attachments: Attachment[];
  onOpenLightbox: (index: number) => void;
}

export function ImageSlider({ attachments, onOpenLightbox }: ImageSliderProps) {
  const [sliderIndex, setSliderIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState<Record<number, boolean>>({});
  const [imageError, setImageError] = useState<Record<number, boolean>>({});

  const currentAttachment = attachments[sliderIndex];
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
          onOpenLightbox(sliderIndex);
        }}
      >
        {/* Placeholder spinner or error */}
        {!imageLoaded[sliderIndex] && !imageError[sliderIndex] && (
          <div className="position-absolute top-50 start-50 translate-middle">
            <div className="spinner-border text-secondary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        )}
        {imageError[sliderIndex] && (
          <div className="position-absolute top-50 start-50 translate-middle text-center text-muted">
            <i className="bi bi-image fs-1"></i>
            <div className="small mt-1">Failed to load</div>
          </div>
        )}
        <img
          src={currentAttachment.url}
          alt={currentAttachment.alt_text ?? ''}
          className="w-100 h-100"
          style={{
            objectFit: 'cover',
            opacity: imageLoaded[sliderIndex] && !imageError[sliderIndex] ? 1 : 0,
            transition: 'opacity 0.3s',
          }}
          loading="lazy"
          onLoad={() => setImageLoaded(prev => ({ ...prev, [sliderIndex]: true }))}
          onError={() => setImageError(prev => ({ ...prev, [sliderIndex]: true }))}
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
        {attachments.length > 1 && (
          <div className="position-absolute bottom-0 end-0 m-2 badge bg-dark bg-opacity-75">
            {sliderIndex + 1} / {attachments.length}
          </div>
        )}
      </div>
      {/* Slider arrows for multiple images */}
      {attachments.length > 1 && (
        <>
          <button
            className="btn btn-sm btn-dark bg-opacity-50 position-absolute start-0 top-50 translate-middle-y ms-2 rounded-circle"
            style={{ width: 32, height: 32, zIndex: 5 }}
            onClick={(e) => {
              e.stopPropagation();
              setSliderIndex((sliderIndex - 1 + attachments.length) % attachments.length);
            }}
          >
            <i className="bi bi-chevron-left"></i>
          </button>
          <button
            className="btn btn-sm btn-dark bg-opacity-50 position-absolute end-0 top-50 translate-middle-y me-2 rounded-circle"
            style={{ width: 32, height: 32, zIndex: 5 }}
            onClick={(e) => {
              e.stopPropagation();
              setSliderIndex((sliderIndex + 1) % attachments.length);
            }}
          >
            <i className="bi bi-chevron-right"></i>
          </button>
          {/* Dots indicator */}
          <div className="d-flex justify-content-center gap-1 mt-2">
            {attachments.map((_, idx) => (
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
}
