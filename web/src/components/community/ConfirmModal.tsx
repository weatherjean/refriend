export function ConfirmModal({
  show,
  title,
  message,
  confirmText,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: {
  show: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmVariant?: 'danger' | 'warning' | 'primary' | 'secondary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!show) return null;

  return (
    <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onCancel}></button>
          </div>
          <div className="modal-body">
            <p>{message}</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className={`btn btn-${confirmVariant}`} onClick={onConfirm}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
