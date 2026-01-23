import type { Message } from '../hooks/useMessage';

interface AlertMessageProps {
  message: Message | null;
  onDismiss?: () => void;
  dismissible?: boolean;
}

export function AlertMessage({
  message,
  onDismiss,
  dismissible = true,
}: AlertMessageProps) {
  if (!message) return null;

  const alertClass = message.type === 'success'
    ? 'alert-success'
    : message.type === 'error'
      ? 'alert-danger'
      : 'alert-info';

  return (
    <div className={`alert ${alertClass} ${dismissible && onDismiss ? 'alert-dismissible' : ''} py-2`}>
      {message.text}
      {dismissible && onDismiss && (
        <button
          type="button"
          className="btn-close"
          onClick={onDismiss}
          aria-label="Close"
        ></button>
      )}
    </div>
  );
}
