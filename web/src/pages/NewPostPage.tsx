import { useState, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { posts, media, AttachmentInput, type Actor } from '../api';
import { useAuth } from '../context/AuthContext';
import { resizeImageWithDimensions, ResizedImage } from '../utils/imageUtils';
import { MentionPicker } from '../components/MentionPicker';
import { PageHeader } from '../components/PageHeader';
import { getUsername, getPostLink } from '../utils';

const MAX_CHARACTERS = 500;
const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE_MB = 25;

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
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoError, setVideoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention picker state
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(0);
  const [mentionPickerPosition, setMentionPickerPosition] = useState({ top: 0, left: 0 });

  const charactersRemaining = MAX_CHARACTERS - content.length;
  const isOverLimit = charactersRemaining < 0;
  const isNearLimit = charactersRemaining <= 50 && charactersRemaining >= 0;

  const hasImages = images.length > 0;
  const hasLink = showLinkInput || linkUrl.trim().length > 0;
  const hasVideo = showVideoInput || videoUrl.trim().length > 0;

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) return true;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleLinkChange = (e: ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setLinkUrl(url);
    if (url.trim() && !validateUrl(url)) {
      setLinkError('Please enter a valid URL (http:// or https://)');
    } else {
      setLinkError('');
    }
  };

  const handleVideoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setVideoUrl(url);
    if (url.trim() && !validateUrl(url)) {
      setVideoError('Please enter a valid URL (http:// or https://)');
    } else {
      setVideoError('');
    }
  };

  if (!user) {
    return (
      <div className="alert alert-warning">
        You must be logged in to create a post.
      </div>
    );
  }

  const handleImageSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);

    // Check total count
    if (images.length + files.length > MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    setError('');
    for (const file of files) {
      // Check file size
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > MAX_IMAGE_SIZE_MB) {
        setError(`Image "${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB limit`);
        continue;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        setError(`File "${file.name}" is not an image`);
        continue;
      }

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

  // Handle content change and detect @ mentions
  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(newContent);

    // Check if we should show mention picker
    const textBeforeCursor = newContent.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/(^|[\s])@([\w]*)$/);

    if (mentionMatch) {
      const query = mentionMatch[2];
      const startIndex = cursorPos - query.length - 1;

      setMentionQuery(query);
      setMentionStartIndex(startIndex);
      setShowMentionPicker(true);

      if (textareaRef.current) {
        const rect = textareaRef.current.getBoundingClientRect();
        setMentionPickerPosition({
          top: rect.height + 4,
          left: 0,
        });
      }
    } else {
      setShowMentionPicker(false);
    }
  };

  // Handle mention selection
  const handleMentionSelect = (actor: Actor) => {
    const username = getUsername(actor.handle);
    const beforeMention = content.slice(0, mentionStartIndex);
    const afterMention = content.slice(mentionStartIndex + 1 + mentionQuery.length);

    const newContent = `${beforeMention}@${username} ${afterMention}`;
    setContent(newContent);
    setShowMentionPicker(false);

    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionStartIndex + username.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate content
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('Post content cannot be empty');
      return;
    }
    if (trimmedContent.length > MAX_CHARACTERS) {
      setError(`Post exceeds ${MAX_CHARACTERS} character limit`);
      return;
    }

    const trimmedLink = linkUrl.trim();
    if (trimmedLink && !validateUrl(trimmedLink)) {
      setLinkError('Please enter a valid URL');
      return;
    }

    const trimmedVideo = videoUrl.trim();
    if (trimmedVideo && !validateUrl(trimmedVideo)) {
      setVideoError('Please enter a valid URL');
      return;
    }

    setError('');
    setLinkError('');
    setVideoError('');
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
      const { post } = await posts.create(trimmedContent, undefined, uploadedAttachments, sensitive, trimmedLink || undefined, trimmedVideo || undefined);

      navigate(getPostLink(post));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = content.trim().length > 0 && !isOverLimit && !loading && !linkError && !videoError;

  return (
    <div>
      <PageHeader title="New Post" icon="pencil-square" />

      <div className="card">
        <div className="card-body">
          {error && (
            <div className="alert alert-danger py-2">{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Content textarea */}
            <div className="mb-3">
              <div className="position-relative">
                <textarea
                  ref={textareaRef}
                  className={`form-control ${isOverLimit ? 'is-invalid' : ''}`}
                  rows={5}
                  value={content}
                  onChange={handleContentChange}
                  placeholder="What's on your mind?"
                />
                {showMentionPicker && (
                  <MentionPicker
                    query={mentionQuery}
                    onSelect={handleMentionSelect}
                    onClose={() => setShowMentionPicker(false)}
                    position={mentionPickerPosition}
                  />
                )}
              </div>
              <div className="d-flex justify-content-between align-items-center mt-2">
                <small className="text-muted">
                  Use @username to mention and #hashtags to categorize
                </small>
                <small className={`fw-semibold ${isOverLimit ? 'text-danger' : isNearLimit ? 'text-warning' : 'text-muted'}`}>
                  {charactersRemaining}
                </small>
              </div>
            </div>

            {/* Image previews */}
            {images.length > 0 && (
              <div className="mb-3">
                <div className="d-flex flex-wrap gap-2">
                  {images.map((img, index) => (
                    <div key={index} className="position-relative" style={{ width: 80, height: 80 }}>
                      <img
                        src={img.preview.dataUrl}
                        alt=""
                        className="rounded"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center"
                        style={{ width: 20, height: 20, transform: 'translate(25%, -25%)' }}
                        onClick={() => removeImage(index)}
                      >
                        <i className="bi bi-x" style={{ fontSize: '0.75rem' }}></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Link URL input */}
            {showLinkInput && (
              <div className="mb-3">
                <div className="input-group">
                  <span className="input-group-text">
                    <i className="bi bi-link-45deg"></i>
                  </span>
                  <input
                    type="url"
                    className={`form-control ${linkError ? 'is-invalid' : ''}`}
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={handleLinkChange}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setShowLinkInput(false);
                      setLinkUrl('');
                      setLinkError('');
                    }}
                    title="Remove link"
                  >
                    <i className="bi bi-x"></i>
                  </button>
                </div>
                {linkError && (
                  <small className="text-danger">{linkError}</small>
                )}
              </div>
            )}

            {/* Video URL input */}
            {showVideoInput && (
              <div className="mb-3">
                <div className="input-group">
                  <span className="input-group-text">
                    <i className="bi bi-play-btn"></i>
                  </span>
                  <input
                    type="url"
                    className={`form-control ${videoError ? 'is-invalid' : ''}`}
                    placeholder="https://youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={handleVideoChange}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setShowVideoInput(false);
                      setVideoUrl('');
                      setVideoError('');
                    }}
                    title="Remove video"
                  >
                    <i className="bi bi-x"></i>
                  </button>
                </div>
                <small className="text-muted">YouTube, TikTok, and PeerTube supported</small>
                {videoError && (
                  <small className="text-danger d-block">{videoError}</small>
                )}
              </div>
            )}

            {/* Actions row */}
            <div className="d-flex justify-content-between align-items-center pt-2 border-top">
              <div className="d-flex gap-2">
                {/* Add images button */}
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
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={images.length >= MAX_IMAGES || loading || hasLink || hasVideo}
                  title={hasLink || hasVideo ? 'Cannot add images with a link or video' : `Add images (${images.length}/${MAX_IMAGES})`}
                >
                  <i className="bi bi-image me-1"></i>
                  {images.length}/{MAX_IMAGES}
                </button>

                {/* Add link button */}
                <button
                  type="button"
                  className={`btn btn-sm ${showLinkInput ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setShowLinkInput(!showLinkInput)}
                  disabled={loading || hasImages || hasVideo}
                  title={hasImages ? 'Cannot add link with images' : hasVideo ? 'Cannot add link with video' : 'Add link'}
                >
                  <i className="bi bi-link-45deg"></i>
                </button>

                {/* Add video button */}
                <button
                  type="button"
                  className={`btn btn-sm ${showVideoInput ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setShowVideoInput(!showVideoInput)}
                  disabled={loading || hasImages || hasLink}
                  title={hasImages ? 'Cannot add video with images' : hasLink ? 'Cannot add video with link' : 'Add video'}
                >
                  <i className="bi bi-play-btn"></i>
                </button>

                {/* Sensitive content toggle */}
                <button
                  type="button"
                  className={`btn btn-sm ${sensitive ? 'btn-warning' : 'btn-outline-secondary'}`}
                  onClick={() => setSensitive(!sensitive)}
                  title="Mark as sensitive content"
                >
                  <i className={`bi bi-eye${sensitive ? '-slash' : ''}-fill`}></i>
                </button>

              </div>

              <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    {images.length > 0 ? 'Uploading...' : 'Posting...'}
                  </>
                ) : (
                  'Post'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
