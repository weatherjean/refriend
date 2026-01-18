import { useState, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { posts, media, AttachmentInput } from '../api';
import { useAuth } from '../context/AuthContext';
import { resizeImageWithDimensions, ResizedImage } from '../utils/imageUtils';

interface ImagePreview {
  file: File;
  preview: ResizedImage;
}

export function NewPostPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [sensitive, setSensitive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) {
    return (
      <div className="alert alert-warning">
        You must be logged in to create a post.
      </div>
    );
  }

  const handleImageSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (images.length + files.length > 4) {
      setError('Maximum 4 images allowed');
      return;
    }

    setError('');
    for (const file of files) {
      try {
        const resized = await resizeImageWithDimensions(file, 1000);
        setImages(prev => [...prev, { file, preview: resized }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to process image');
      }
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Upload images first
      const uploadedAttachments: AttachmentInput[] = [];
      for (const img of images) {
        const { url } = await media.upload(img.preview.dataUrl);
        uploadedAttachments.push({
          url,
          width: img.preview.width,
          height: img.preview.height,
        });
      }

      // Create post with attachments
      const { post } = await posts.create(content, undefined, uploadedAttachments, sensitive);
      navigate(`/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto" style={{ maxWidth: 600 }}>
      <h3 className="mb-4">New Post</h3>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">Content</label>
          <textarea
            className="form-control"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            required
          />
          <div className="form-text">Use #hashtags to categorize your post</div>
        </div>

        {/* Image previews */}
        {images.length > 0 && (
          <div className="mb-3">
            <div className="d-flex flex-wrap gap-2">
              {images.map((img, index) => (
                <div key={index} className="position-relative" style={{ width: 100, height: 100 }}>
                  <img
                    src={img.preview.dataUrl}
                    alt=""
                    className="rounded"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-danger position-absolute top-0 end-0"
                    style={{ transform: 'translate(25%, -25%)' }}
                    onClick={() => removeImage(index)}
                  >
                    <i className="bi bi-x"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add images button */}
        <div className="mb-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="d-none"
            onChange={handleImageSelect}
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={images.length >= 4}
          >
            <i className="bi bi-image me-2"></i>
            Add Images ({images.length}/4)
          </button>
        </div>

        {/* Sensitive content toggle */}
        <div className="mb-3">
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="sensitive"
              checked={sensitive}
              onChange={(e) => setSensitive(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="sensitive">
              <i className="bi bi-eye-slash me-1"></i>
              Mark as sensitive content
            </label>
            <div className="form-text">Images will be blurred until clicked</div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary w-100" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2"></span>
              {images.length > 0 ? 'Uploading...' : 'Posting...'}
            </>
          ) : (
            'Post'
          )}
        </button>
      </form>
    </div>
  );
}
