import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { communities, type ModLogEntry } from '../../api';
import { Avatar } from '../Avatar';
import { LoadingSpinner } from '../LoadingSpinner';
import { EmptyState } from '../EmptyState';

interface ModLogsTabProps {
  communityName: string;
}

function formatLogMessage(log: ModLogEntry): string {
  switch (log.action) {
    case 'post_approved':
      return 'Approved a post';
    case 'post_rejected':
      return 'Rejected a post';
    case 'post_pinned':
      return 'Pinned a post';
    case 'post_unpinned':
      return 'Unpinned a post';
    case 'post_removed':
      return 'Removed a post';
    case 'community_updated':
      return log.details || 'Updated community settings';
    case 'admin_added':
      return log.details || 'Added a moderator';
    case 'admin_removed':
      return log.details || 'Removed a moderator';
    case 'user_banned':
      return log.details || 'Banned a user';
    case 'user_unbanned':
      return log.details || 'Unbanned a user';
    default:
      return log.details || log.action;
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString();
}

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
      {logs.map(log => (
        <div key={log.id} className="mod-log-item">
          {log.target_type === 'post' && log.target_id ? (
            <Link to={`/posts/${log.target_id}`} className="mod-log-message mod-log-message-link">
              {formatLogMessage(log)}
              <i className="bi bi-box-arrow-up-right"></i>
            </Link>
          ) : (
            <div className="mod-log-message">{formatLogMessage(log)}</div>
          )}
          <div className="mod-log-time">{formatTime(log.created_at)}</div>
          {log.actor && (
            <div className="mod-log-actor">
              <Avatar src={log.actor.avatar_url} name={log.actor.name || log.actor.handle} size="xs" />
              <span>{log.actor.name || log.actor.handle}</span>
            </div>
          )}
        </div>
      ))}

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
