import { useState } from 'react';
import { posts as postsApi } from '../api';
import { useScrollLockEffect } from '../context/ScrollLockContext';

interface ReportPostModalProps {
  postId: string;
  onClose: () => void;
}

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam', description: 'Unwanted commercial content or repetitive posts' },
  { value: 'harassment', label: 'Harassment', description: 'Targeted attacks or bullying' },
  { value: 'hate_speech', label: 'Hate speech', description: 'Content that attacks protected groups' },
  { value: 'violence', label: 'Violence', description: 'Threats or glorification of violence' },
  { value: 'misinformation', label: 'Misinformation', description: 'False or misleading information' },
  { value: 'other', label: 'Other', description: 'Something else not listed above' },
];

export function ReportPostModal({ postId, onClose }: ReportPostModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Lock scroll while modal is open
  useScrollLockEffect('report-post-modal', true);

  const handleSubmit = async () => {
    if (!selectedReason) return;

    setSubmitting(true);
    setError(null);

    try {
      await postsApi.report(postId, selectedReason, details.trim() || undefined);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit report');
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="suggest-modal-backdrop" onClick={handleBackdropClick}>
      <div className="suggest-modal report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="suggest-modal-header">
          <h5>Report post</h5>
          <button
            className="suggest-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="suggest-modal-body">
          {error && (
            <div className="alert alert-danger mb-3">{error}</div>
          )}

          {success && (
            <div className="alert alert-success mb-0">
              <i className="bi bi-check-circle me-2"></i>
              Report submitted. Thank you for helping keep our community safe.
            </div>
          )}

          {!success && (
            <>
              <p className="report-modal-intro">
                Why are you reporting this post?
              </p>

              <div className="report-reasons">
                {REPORT_REASONS.map((reason) => (
                  <label
                    key={reason.value}
                    className={`report-reason ${selectedReason === reason.value ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={reason.value}
                      checked={selectedReason === reason.value}
                      onChange={() => setSelectedReason(reason.value)}
                      disabled={submitting}
                    />
                    <div className="report-reason-content">
                      <span className="report-reason-label">{reason.label}</span>
                      <span className="report-reason-desc">{reason.description}</span>
                    </div>
                  </label>
                ))}
              </div>

              {selectedReason && (
                <div className="report-details">
                  <label htmlFor="report-details">Additional details (optional)</label>
                  <textarea
                    id="report-details"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Provide any additional context..."
                    rows={3}
                    maxLength={500}
                    disabled={submitting}
                  />
                </div>
              )}

              <div className="report-actions">
                <button
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleSubmit}
                  disabled={!selectedReason || submitting}
                >
                  {submitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Submitting...
                    </>
                  ) : (
                    'Submit report'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
