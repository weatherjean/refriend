import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { posts, media, communities, AttachmentInput, type Community, type Actor } from '../api';
import { useAuth } from '../context/AuthContext';
import { resizeImageWithDimensions, ResizedImage } from '../utils/imageUtils';
import { MentionPicker } from '../components/MentionPicker';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { getUsername } from '../utils';

const MAX_CHARACTERS = 500;
const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE_MB = 10;

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention picker state
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(0);
  const [mentionPickerPosition, setMentionPickerPosition] = useState({ top: 0, left: 0 });

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

  const charactersRemaining = MAX_CHARACTERS - content.length;
  const isOverLimit = charactersRemaining < 0;
  const isNearLimit = charactersRemaining <= 50 && charactersRemaining >= 0;

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
      const { post } = await posts.create(trimmedContent, undefined, uploadedAttachments, sensitive);

      // Submit to community if selected
      if (selectedCommunity) {
        try {
          await communities.submitPost(selectedCommunity.name!, post.id);
        } catch (err) {
          console.error('Failed to submit to community:', err);
        }
      }

      navigate(`/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = content.trim().length > 0 && !isOverLimit && !loading;

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

            {/* Community selector */}
            {joinedCommunities.length > 0 && (
              <div className="mb-3">
                <label className="form-label small text-muted">Post to community (optional)</label>
                <div className="position-relative">
                  {selectedCommunity ? (
                    <div className="d-flex align-items-center justify-content-between border rounded p-2">
                      <div className="d-flex align-items-center">
                        <Avatar
                          src={selectedCommunity.avatar_url}
                          name={selectedCommunity.name || ''}
                          size="xs"
                          className="me-2"
                        />
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
                              className="d-flex align-items-center w-100 p-2 border-0 bg-transparent text-start"
                              style={{ cursor: 'pointer' }}
                              onMouseDown={() => {
                                setSelectedCommunity(c);
                                setCommunitySearch('');
                                setShowCommunityDropdown(false);
                              }}
                            >
                              <Avatar
                                src={c.avatar_url}
                                name={c.name || ''}
                                size="xs"
                                className="me-2"
                              />
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
                  disabled={images.length >= MAX_IMAGES}
                  title={`Add images (${images.length}/${MAX_IMAGES})`}
                >
                  <i className="bi bi-image me-1"></i>
                  {images.length}/{MAX_IMAGES}
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
