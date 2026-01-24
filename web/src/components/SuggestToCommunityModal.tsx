import { useState, useEffect } from 'react';
import { communities as communitiesApi, Community } from '../api';
import { useScrollLockEffect } from '../context/ScrollLockContext';
import { Avatar } from './Avatar';

interface SuggestToCommunityModalProps {
  postId: string;
  onClose: () => void;
}

export function SuggestToCommunityModal({ postId, onClose }: SuggestToCommunityModalProps) {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Lock scroll while modal is open
  useScrollLockEffect('suggest-to-community-modal', true);

  useEffect(() => {
    async function fetchCommunities() {
      try {
        const result = await communitiesApi.getJoined();
        setCommunities(result.communities);
      } catch {
        setError('Failed to load communities');
      } finally {
        setLoading(false);
      }
    }
    fetchCommunities();
  }, []);

  const handleSuggest = async (community: Community) => {
    const communityName = community.handle.split('@')[1] || community.name || '';
    setSubmitting(community.id);
    setError(null);

    try {
      await communitiesApi.suggestPost(communityName, postId);
      setSuccess(`Suggested to ${community.name || communityName}`);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to suggest post');
      setSubmitting(null);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="suggest-modal-backdrop" onClick={handleBackdropClick}>
      <div className="suggest-modal" onClick={(e) => e.stopPropagation()}>
        <div className="suggest-modal-header">
          <h5>Suggest to community</h5>
          <button
            className="suggest-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="suggest-modal-body">
          {loading && (
            <div className="suggest-modal-loading">
              <div className="spinner-border spinner-border-sm" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <span>Loading communities...</span>
            </div>
          )}

          {error && (
            <div className="alert alert-danger mb-0">{error}</div>
          )}

          {success && (
            <div className="alert alert-success mb-0">
              <i className="bi bi-check-circle me-2"></i>
              {success}
            </div>
          )}

          {!loading && !success && communities.length === 0 && (
            <div className="suggest-modal-empty">
              <i className="bi bi-people"></i>
              <p>You haven't joined any communities yet</p>
            </div>
          )}

          {!loading && !success && communities.length > 0 && (
            <div className="suggest-modal-list">
              {communities.map((community) => {
                const communityName = community.handle.split('@')[1] || community.name || '';
                return (
                  <button
                    key={community.id}
                    className="suggest-modal-item"
                    onClick={() => handleSuggest(community)}
                    disabled={submitting !== null}
                  >
                    <Avatar
                      src={community.avatar_url}
                      name={communityName}
                      size="sm"
                    />
                    <div className="suggest-modal-item-info">
                      <span className="suggest-modal-item-name">
                        {community.name || communityName}
                      </span>
                      <span className="suggest-modal-item-members">
                        {community.member_count} members
                      </span>
                    </div>
                    {submitting === community.id && (
                      <div className="spinner-border spinner-border-sm ms-auto" role="status">
                        <span className="visually-hidden">Submitting...</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
