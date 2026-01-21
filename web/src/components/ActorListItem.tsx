import { Link } from 'react-router-dom';
import { Actor } from '../api';
import { getUsername } from '../utils';
import { Avatar } from './Avatar';

interface ActorListItemProps {
  actor: Actor;
  onClick?: () => void;
  actionButton?: React.ReactNode;
}

export function ActorListItem({ actor, onClick, actionButton }: ActorListItemProps) {
  const username = getUsername(actor.handle);
  const profileLink = `/u/${actor.handle}`;

  const content = (
    <div className="d-flex align-items-center">
      <Avatar
        src={actor.avatar_url}
        name={username}
        size="sm"
        className="me-2"
      />
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="fw-semibold text-truncate">{actor.name || username}</div>
        <small className="text-muted text-truncate d-block">{actor.handle}</small>
      </div>
      {actionButton && <div className="ms-2">{actionButton}</div>}
    </div>
  );

  return (
    <Link
      to={profileLink}
      className="list-group-item list-group-item-action"
      onClick={onClick}
    >
      {content}
    </Link>
  );
}
