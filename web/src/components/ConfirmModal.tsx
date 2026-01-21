import { Modal, Button } from 'react-bootstrap';

interface ConfirmModalProps {
  show: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmVariant?: 'danger' | 'warning' | 'primary' | 'secondary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  show,
  title,
  message,
  confirmText,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal show={show} onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{message}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm}>
          {confirmText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
