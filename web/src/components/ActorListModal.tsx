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
  if (!show) return null;

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
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
          </div>
        </div>
      </div>
    </div>
  );
}
