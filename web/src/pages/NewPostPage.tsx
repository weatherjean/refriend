import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { posts, media, communities, AttachmentInput, type Community } from '../api';
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

  // Community selection
  const [joinedCommunities, setJoinedCommunities] = useState<Community[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [communitySearch, setCommunitySearch] = useState('');
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);

  useEffect(() => {
    if (user) {
      communities.getJoined().then(({ communities: c }) => {
        setJoinedCommunities(c);
      }).catch(console.error);
    }
  }, [user]);

  const filteredCommunities = communitySearch
    ? joinedCommunities.filter(c =>
        c.name?.toLowerCase().includes(communitySearch.toLowerCase()) ||
        c.handle?.toLowerCase().includes(communitySearch.toLowerCase())
      )
    : joinedCommunities;

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

      // Submit to community if selected
      if (selectedCommunity) {
        try {
          await communities.submitPost(selectedCommunity.name!, post.id);
        } catch (err) {
          console.error('Failed to submit to community:', err);
          // Post was created but community submission failed - still navigate to post
        }
      }

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

        {/* Community selector */}
        {joinedCommunities.length > 0 && (
          <div className="mb-3">
            <label className="form-label">Post to community (optional)</label>
            <div className="position-relative">
              {selectedCommunity ? (
                <div className="d-flex align-items-center justify-content-between border rounded p-2">
                  <div className="d-flex align-items-center">
                    {selectedCommunity.avatar_url ? (
                      <img
                        src={selectedCommunity.avatar_url}
                        alt=""
                        className="rounded me-2"
                        style={{ width: 24, height: 24, objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        className="rounded me-2 bg-secondary d-flex align-items-center justify-content-center"
                        style={{ width: 24, height: 24 }}
                      >
                        <i className="bi bi-people text-white" style={{ fontSize: '0.7rem' }}></i>
                      </div>
                    )}
                    <span>{selectedCommunity.name}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setSelectedCommunity(null)}
                  >
                    <i className="bi bi-x"></i>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search your communities..."
                    value={communitySearch}
                    onChange={(e) => setCommunitySearch(e.target.value)}
                    onFocus={() => setShowCommunityDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCommunityDropdown(false), 150)}
                  />
                  {showCommunityDropdown && filteredCommunities.length > 0 && (
                    <div className="position-absolute w-100 mt-1 bg-body border rounded shadow-sm" style={{ zIndex: 1000, maxHeight: 200, overflowY: 'auto' }}>
                      {filteredCommunities.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="d-flex align-items-center w-100 p-2 border-0 bg-transparent text-start hover-bg-light"
                          style={{ cursor: 'pointer' }}
                          onMouseDown={() => {
                            setSelectedCommunity(c);
                            setCommunitySearch('');
                            setShowCommunityDropdown(false);
                          }}
                        >
                          {c.avatar_url ? (
                            <img
                              src={c.avatar_url}
                              alt=""
                              className="rounded me-2"
                              style={{ width: 24, height: 24, objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              className="rounded me-2 bg-secondary d-flex align-items-center justify-content-center"
                              style={{ width: 24, height: 24 }}
                            >
                              <i className="bi bi-people text-white" style={{ fontSize: '0.7rem' }}></i>
                            </div>
                          )}
                          <div>
                            <div className="fw-semibold small">{c.name}</div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{c.handle}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

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
