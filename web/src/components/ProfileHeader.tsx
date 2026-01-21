import { Actor } from '../api';
import { Avatar } from './Avatar';

interface ProfileHeaderProps {
  actor: Actor;
  username: string;
  stats: { followers: number; following: number };
  isFollowing: boolean;
  isOwnProfile: boolean;
  followLoading: boolean;
  loggedIn: boolean;
  onFollow: () => void;
  onShowFollowers: () => void;
  onShowFollowing: () => void;
}

export function ProfileHeader({
  actor,
  username,
  stats,
  isFollowing,
  isOwnProfile,
  followLoading,
  loggedIn,
  onFollow,
  onShowFollowers,
  onShowFollowing,
}: ProfileHeaderProps) {
  const displayName = actor.name || username;

  return (
    <div className="card mb-4">
      <div className="card-body">
        <div className="d-flex align-items-start">
          <Avatar
            src={actor.avatar_url}
            name={username}
            size="lg"
            className="me-3"
          />
          <div className="flex-grow-1">
            <h4 className="mb-0">{displayName}</h4>
            <div className="text-muted">{actor.handle}</div>

            {!actor.is_local && (
              <span className="badge bg-secondary mt-1">
                <i className="bi bi-globe me-1"></i>Remote
              </span>
            )}

            {actor.bio && (
              <div className="mt-2" dangerouslySetInnerHTML={{ __html: actor.bio }} />
            )}

            {/* Stats - only for local actors */}
            {actor.is_local && (
              <div className="mt-2">
                <button
                  className="btn btn-link text-decoration-none p-0 me-3"
                  onClick={onShowFollowing}
                >
                  <strong>{stats.following}</strong>{' '}
                  <span className="text-muted">Following</span>
                </button>
                <button
                  className="btn btn-link text-decoration-none p-0"
                  onClick={onShowFollowers}
                >
                  <strong>{stats.followers}</strong>{' '}
                  <span className="text-muted">Followers</span>
                </button>
              </div>
            )}
          </div>

          {loggedIn && !isOwnProfile && (
            <div>
              <button
                className={`btn ${isFollowing ? 'btn-outline-primary' : 'btn-primary'}`}
                onClick={onFollow}
                disabled={followLoading}
              >
                {followLoading ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : isFollowing ? (
                  'Following'
                ) : (
                  'Follow'
                )}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
