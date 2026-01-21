import { Modal } from 'react-bootstrap';
import { Actor } from '../api';
import { ActorListItem } from './ActorListItem';
import { LoadingSpinner } from './LoadingSpinner';

interface ActorListModalProps {
  show: boolean;
  title: string;
  actors: Actor[];
  loading: boolean;
  onClose: () => void;
  emptyMessage?: string;
}

export function ActorListModal({
  show,
  title,
  actors,
  loading,
  onClose,
  emptyMessage = 'No users yet',
}: ActorListModalProps) {
  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <LoadingSpinner size="sm" className="py-3" />
        ) : actors.length === 0 ? (
          <p className="text-muted">{emptyMessage}</p>
        ) : (
          <div className="list-group list-group-flush">
            {actors.map((actor) => (
              <ActorListItem key={actor.id} actor={actor} onClick={onClose} />
            ))}
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
}
