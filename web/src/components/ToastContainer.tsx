import { useToast, Toast } from '../context/ToastContext';

const iconMap: Record<Toast['type'], string> = {
  success: 'bi-check-circle-fill',
  error: 'bi-exclamation-circle-fill',
  info: 'bi-info-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
};

const bgMap: Record<Toast['type'], string> = {
  success: 'bg-success',
  error: 'bg-danger',
  info: 'bg-primary',
  warning: 'bg-warning',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="toast-container position-fixed top-0 start-50 translate-middle-x p-3"
      style={{ zIndex: 1100, maxWidth: '90vw' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast show align-items-center text-white ${bgMap[toast.type]} border-0`}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <div className="d-flex">
            <div className="toast-body d-flex align-items-center gap-2">
              <i className={`bi ${iconMap[toast.type]}`}></i>
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white me-2 m-auto"
              aria-label="Close"
              onClick={() => dismiss(toast.id)}
            ></button>
          </div>
        </div>
      ))}
    </div>
  );
}
