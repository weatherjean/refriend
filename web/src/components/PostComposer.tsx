import { useState, useRef, ChangeEvent } from 'react';
import { media, AttachmentInput, type Actor } from '../api';
import { resizeImageWithDimensions, ResizedImage } from '../utils/imageUtils';
import { MentionPicker } from './MentionPicker';
import { getUsername } from '../utils';

const MAX_CHARACTERS = 500;
const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE_MB = 10;

interface ImagePreview {
  file: File;
  preview: ResizedImage;
}

interface PostComposerProps {
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (content: string, attachments: AttachmentInput[], sensitive: boolean) => Promise<void>;
  onSuccess?: () => void;
  compact?: boolean;
}

export function PostComposer({
  placeholder = "What's on your mind?",
  submitLabel = 'Post',
  onSubmit,
  onSuccess,
  compact = false,
}: PostComposerProps) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [sensitive, setSensitive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  const handleImageSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);

    if (images.length + files.length > MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    setError('');
    for (const file of files) {
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > MAX_IMAGE_SIZE_MB) {
        setError(`Image "${file.name}" exceeds ${MAX_IMAGE_SIZE_MB}MB limit`);
        continue;
      }

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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(newContent);

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

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setError('Content cannot be empty');
      return;
    }
    if (trimmedContent.length > MAX_CHARACTERS) {
      setError(`Content exceeds ${MAX_CHARACTERS} character limit`);
      return;
    }

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

      await onSubmit(trimmedContent, uploadedAttachments, sensitive);

      // Reset form on success
      setContent('');
      setImages([]);
      setSensitive(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = content.trim().length > 0 && !isOverLimit && !loading;

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert alert-danger py-2 mb-2">{error}</div>
      )}

      <div className="mb-2">
        <div className="position-relative">
          <textarea
            ref={textareaRef}
            className={`form-control ${isOverLimit ? 'is-invalid' : ''}`}
            rows={compact ? 3 : 5}
            value={content}
            onChange={handleContentChange}
            placeholder={placeholder}
            disabled={loading}
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
        <div className="d-flex justify-content-between align-items-center mt-1 gap-2">
          <small className="text-muted text-truncate" style={{ minWidth: 0 }}>
            Use @ and #
          </small>
          <small className={`fw-semibold flex-shrink-0 ${isOverLimit ? 'text-danger' : isNearLimit ? 'text-warning' : 'text-muted'}`}>
            {charactersRemaining}
          </small>
        </div>
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="mb-2">
          <div className="d-flex flex-wrap gap-2">
            {images.map((img, index) => (
              <div key={index} className="position-relative" style={{ width: 60, height: 60 }}>
                <img
                  src={img.preview.dataUrl}
                  alt=""
                  className="rounded"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-danger position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center"
                  style={{ width: 18, height: 18, transform: 'translate(25%, -25%)' }}
                  onClick={() => removeImage(index)}
                >
                  <i className="bi bi-x" style={{ fontSize: '0.7rem' }}></i>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions row */}
      <div className="d-flex justify-content-between align-items-center pt-2 border-top">
        <div className="d-flex gap-2">
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
            disabled={images.length >= MAX_IMAGES || loading}
            title={`Add images (${images.length}/${MAX_IMAGES})`}
          >
            <i className="bi bi-image me-1"></i>
            {images.length}/{MAX_IMAGES}
          </button>

          <button
            type="button"
            className={`btn btn-sm ${sensitive ? 'btn-warning' : 'btn-outline-secondary'}`}
            onClick={() => setSensitive(!sensitive)}
            title="Mark as sensitive content"
            disabled={loading}
          >
            <i className={`bi bi-eye${sensitive ? '-slash' : ''}-fill`}></i>
          </button>
        </div>

        <button type="submit" className="btn btn-primary btn-sm" disabled={!canSubmit}>
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-1"></span>
              {images.length > 0 ? 'Uploading...' : 'Posting...'}
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}
