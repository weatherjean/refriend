import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { communities, type ModLogEntry } from '../../api';
import { Avatar } from '../Avatar';
import { LoadingSpinner } from '../LoadingSpinner';
import { EmptyState } from '../EmptyState';

interface ModLogsTabProps {
  communityName: string;
}

const ACTION_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  post_approved: { label: 'Approved post', icon: 'bi-check-circle', color: 'text-success' },
  post_rejected: { label: 'Rejected post', icon: 'bi-x-circle', color: 'text-danger' },
  post_pinned: { label: 'Pinned post', icon: 'bi-pin-fill', color: 'text-warning' },
  post_unpinned: { label: 'Unpinned post', icon: 'bi-pin-angle', color: 'text-muted' },
  post_removed: { label: 'Removed post', icon: 'bi-trash', color: 'text-danger' },
  community_updated: { label: 'Updated community', icon: 'bi-pencil', color: 'text-info' },
  admin_added: { label: 'Added moderator', icon: 'bi-person-plus', color: 'text-success' },
  admin_removed: { label: 'Removed moderator', icon: 'bi-person-dash', color: 'text-danger' },
  user_banned: { label: 'Banned user', icon: 'bi-ban', color: 'text-danger' },
  user_unbanned: { label: 'Unbanned user', icon: 'bi-unlock', color: 'text-success' },
};

export function ModLogsTab({ communityName }: ModLogsTabProps) {
  const [logs, setLogs] = useState<ModLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      try {
        const { logs: l, next_cursor } = await communities.getModLogs(communityName, { limit: 50 });
        setLogs(l);
        setNextCursor(next_cursor);
      } catch {
        // Error handled by global toast
      } finally {
        setLoading(false);
      }
    };
    loadLogs();
  }, [communityName]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { logs: l, next_cursor } = await communities.getModLogs(communityName, { limit: 50, before: nextCursor });
      setLogs(prev => [...prev, ...l]);
      setNextCursor(next_cursor);
    } catch {
      // Error handled by global toast
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (logs.length === 0) {
    return <EmptyState icon="journal-text" title="No moderation activity yet" />;
  }

  return (
    <div className="mod-logs">
      <div className="list-group">
        {logs.map(log => {
          const actionInfo = ACTION_LABELS[log.action] || { label: log.action, icon: 'bi-circle', color: 'text-muted' };

          return (
            <div key={log.id} className="list-group-item mod-log-item">
              <div className="mod-log-icon">
                <i className={`bi ${actionInfo.icon} ${actionInfo.color}`}></i>
              </div>
              <div className="mod-log-content">
                <div className="mod-log-action">
                  <span className={actionInfo.color}>{actionInfo.label}</span>
                  {log.target_type === 'post' && log.target_id && (
                    <Link to={`/posts/${log.target_id}`} className="mod-log-link" onClick={(e) => e.stopPropagation()}>
                      View post
                    </Link>
                  )}
                </div>
                {log.details && (
                  <div className="mod-log-details">{log.details}</div>
                )}
                <div className="mod-log-meta">
                  {log.actor && (
                    <Link to={`/u/${log.actor.handle}`} className="mod-log-actor">
                      <Avatar src={log.actor.avatar_url} name={log.actor.name || log.actor.handle} size="xs" />
                      <span>{log.actor.name || log.actor.handle}</span>
                    </Link>
                  )}
                  <span className="mod-log-time">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {nextCursor && (
        <div className="text-center mt-3">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <span className="spinner-border spinner-border-sm me-2"></span>
            ) : null}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
