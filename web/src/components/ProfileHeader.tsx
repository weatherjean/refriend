import { useState, useRef, useEffect } from 'react';
import { Actor } from '../api';
import { Avatar } from './Avatar';
import { sanitizeHtml } from '../utils';

interface ProfileHeaderProps {
  actor: Actor;
  username: string;
  stats: { followers: number; following: number };
  isFollowing: boolean;
  followStatus: 'pending' | 'accepted' | null;
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
  followStatus,
  isOwnProfile,
  followLoading,
  loggedIn,
  onFollow,
  onShowFollowers,
  onShowFollowing,
}: ProfileHeaderProps) {
  const isPending = followStatus === 'pending';
  const buttonText = isFollowing ? 'Following' : isPending ? 'Requested' : 'Follow';
  const buttonClass = isFollowing ? 'btn-outline-primary' : isPending ? 'btn-outline-secondary' : 'btn-primary';
  const displayName = actor.name || username;

  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioTruncated, setBioTruncated] = useState(false);
  const mobileBioRef = useRef<HTMLDivElement>(null);
  const desktopBioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBioExpanded(false);
    setBioTruncated(false);
  }, [actor.id]);

  useEffect(() => {
    const checkTruncation = () => {
      for (const el of [mobileBioRef.current, desktopBioRef.current]) {
        if (el && el.offsetParent !== null && el.scrollHeight > el.clientHeight) {
          setBioTruncated(true);
          return;
        }
      }
      setBioTruncated(false);
    };
    // Delay to ensure layout is computed after render
    const id = requestAnimationFrame(checkTruncation);
    return () => cancelAnimationFrame(id);
  }, [actor.bio, bioExpanded]);

  return (
    <div className="card mb-4">
      <div className="card-body">
        {/* Mobile layout: stacked and centered */}
        <div className="d-md-none text-center">
          <Avatar
            src={actor.avatar_url}
            name={username}
            size="xl"
          />
          <h4 className="mb-0 mt-3">{displayName}</h4>
          <div className="text-muted small" style={{ wordBreak: 'break-all' }}>{actor.handle}</div>

          {(!actor.is_local || actor.actor_type === 'Group') && (
            <div className="mt-2 d-flex justify-content-center gap-1">
              {!actor.is_local && (
                <span className="badge" style={{ backgroundColor: '#fbbf24', color: '#000' }}>
                  <i className="bi bi-globe me-1"></i>Remote
                </span>
              )}
              {actor.actor_type === 'Group' && (
                <span className="badge" style={{ backgroundColor: '#4ade80', color: '#000' }}>
                  <i className="bi bi-people-fill me-1"></i>Group
                </span>
              )}
            </div>
          )}

          {actor.bio && (
            <div>
              <div
                ref={mobileBioRef}
                className="mt-2"
                style={!bioExpanded ? {
                  maxHeight: '6em',
                  overflow: 'hidden',
                  ...(bioTruncated ? { maskImage: 'linear-gradient(to bottom, black 50%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent)' } : {}),
                } : undefined}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(actor.bio) }}
              />
              {(bioTruncated || bioExpanded) && (
                <button
                  className="btn btn-link btn-sm p-0 text-muted"
                  onClick={() => setBioExpanded(!bioExpanded)}
                >
                  {bioExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {actor.is_local && (
            <div className="mt-3 d-flex justify-content-center gap-4">
              <button
                className="btn btn-link text-decoration-none p-0"
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

          {loggedIn && !isOwnProfile && (
            <div className="mt-3">
              <button
                className={`btn ${buttonClass}`}
                onClick={onFollow}
                disabled={followLoading}
              >
                {followLoading ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  buttonText
                )}
              </button>
            </div>
          )}
        </div>

        {/* Desktop layout: horizontal */}
        <div className="d-none d-md-flex align-items-start">
          <Avatar
            src={actor.avatar_url}
            name={username}
            size="lg"
            className="me-3"
          />
          <div className="flex-grow-1">
            <h4 className="mb-0">{displayName}</h4>
            <div className="text-muted">{actor.handle}</div>

            {(!actor.is_local || actor.actor_type === 'Group') && (
              <div className="mt-1 d-flex gap-1">
                {!actor.is_local && (
                  <span className="badge" style={{ backgroundColor: '#fbbf24', color: '#000' }}>
                    <i className="bi bi-globe me-1"></i>Remote
                  </span>
                )}
                {actor.actor_type === 'Group' && (
                  <span className="badge" style={{ backgroundColor: '#4ade80', color: '#000' }}>
                    <i className="bi bi-people-fill me-1"></i>Group
                  </span>
                )}
              </div>
            )}

            {actor.bio && (
              <div>
                <div
                  ref={desktopBioRef}
                  className="mt-2"
                  style={!bioExpanded ? {
                    maxHeight: '6em',
                    overflow: 'hidden',
                    ...(bioTruncated ? { maskImage: 'linear-gradient(to bottom, black 50%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent)' } : {}),
                  } : undefined}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(actor.bio) }}
                />
                {(bioTruncated || bioExpanded) && (
                  <button
                    className="btn btn-link btn-sm p-0 text-muted"
                    onClick={() => setBioExpanded(!bioExpanded)}
                  >
                    {bioExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            )}

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
                className={`btn ${buttonClass}`}
                onClick={onFollow}
                disabled={followLoading}
              >
                {followLoading ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  buttonText
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
