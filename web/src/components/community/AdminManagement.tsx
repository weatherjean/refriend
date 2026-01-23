import { useState, useEffect } from 'react';
import { communities } from '../../api';
import { ConfirmModal } from '../ConfirmModal';
import { Avatar } from '../Avatar';

interface Admin {
  id: number;
  role: 'owner' | 'admin';
  actor: { id: string; handle: string; name: string | null; avatar_url: string | null };
}

export function AdminManagement({ communityName, isOwner }: { communityName: string; isOwner: boolean }) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAdminHandle, setNewAdminHandle] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'promote' | 'demote' | 'remove';
    actorId: string;
    actorName: string;
  } | null>(null);

  useEffect(() => {
    loadAdmins();
  }, [communityName]);

  const loadAdmins = async () => {
    try {
      const { admins: a } = await communities.getAdmins(communityName);
      setAdmins(a);
    } catch {
      // Error handled by global toast
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminHandle.trim()) return;

    setAdding(true);
    setError(null);
    try {
      const searchResult = await fetch(`/api/search?q=${encodeURIComponent(newAdminHandle)}`);
      const { results } = await searchResult.json();

      if (!results || results.length === 0) {
        setError('User not found');
        return;
      }

      const actor = results[0];
      await communities.addAdmin(communityName, actor.id, 'admin');
      setNewAdminHandle('');
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add admin');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveAdmin = async (actorId: string) => {
    try {
      await communities.removeAdmin(communityName, actorId);
      setAdmins(prev => prev.filter(a => a.actor.id !== actorId));
    } catch {
      // Error handled by global toast
    }
    setConfirmAction(null);
  };

  const handleChangeRole = async (actorId: string, newRole: 'owner' | 'admin') => {
    try {
      await communities.addAdmin(communityName, actorId, newRole);
      setAdmins(prev => prev.map(a =>
        a.actor.id === actorId ? { ...a, role: newRole } : a
      ));
    } catch {
      // Error handled by global toast
    }
    setConfirmAction(null);
  };

  const handleConfirmedAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'remove') {
      handleRemoveAdmin(confirmAction.actorId);
    } else if (confirmAction.type === 'promote') {
      handleChangeRole(confirmAction.actorId, 'owner');
    } else if (confirmAction.type === 'demote') {
      handleChangeRole(confirmAction.actorId, 'admin');
    }
  };

  if (loading) {
    return (
      <div className="card mb-4">
        <div className="card-body text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="card mb-4">
      <div className="card-header">
        <h6 className="mb-0">Admins & Moderators</h6>
      </div>
      <div className="card-body">
        <div className="list-group mb-3">
          {admins.map((admin) => (
            <div key={admin.id} className="list-group-item d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center">
                <Avatar
                  src={admin.actor.avatar_url}
                  name={admin.actor.name || admin.actor.handle}
                  size="sm"
                  className="me-2"
                />
                <div>
                  <div className="fw-semibold">{admin.actor.name || admin.actor.handle}</div>
                  <small className="text-muted">{admin.actor.handle}</small>
                </div>
                <span className={`badge ms-2 ${admin.role === 'owner' ? 'bg-warning text-dark' : 'bg-primary'}`}>
                  {admin.role}
                </span>
              </div>
              {isOwner && (
                <div className="btn-group btn-group-sm">
                  {admin.role === 'admin' && (
                    <button
                      className="btn btn-outline-warning"
                      onClick={() => setConfirmAction({
                        type: 'promote',
                        actorId: admin.actor.id,
                        actorName: admin.actor.name || admin.actor.handle,
                      })}
                      title="Promote to owner"
                    >
                      <i className="bi bi-arrow-up"></i>
                    </button>
                  )}
                  {admin.role === 'owner' && (
                    <button
                      className="btn btn-outline-secondary"
                      onClick={() => setConfirmAction({
                        type: 'demote',
                        actorId: admin.actor.id,
                        actorName: admin.actor.name || admin.actor.handle,
                      })}
                      title="Demote to admin"
                    >
                      <i className="bi bi-arrow-down"></i>
                    </button>
                  )}
                  {admin.role !== 'owner' && (
                    <button
                      className="btn btn-outline-danger"
                      onClick={() => setConfirmAction({
                        type: 'remove',
                        actorId: admin.actor.id,
                        actorName: admin.actor.name || admin.actor.handle,
                      })}
                      title="Remove admin"
                    >
                      <i className="bi bi-x-lg"></i>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {isOwner && (
          <form onSubmit={handleAddAdmin}>
            {error && (
              <div className="alert alert-danger py-2 small">{error}</div>
            )}
            <div className="input-group">
              <input
                type="text"
                className="form-control"
                placeholder="Username or handle"
                value={newAdminHandle}
                onChange={(e) => setNewAdminHandle(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-outline-primary"
                disabled={adding || !newAdminHandle.trim()}
              >
                {adding ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <>
                    <i className="bi bi-plus-lg me-1"></i>Add Admin
                  </>
                )}
              </button>
            </div>
            <div className="form-text">Enter a username to add them as an admin.</div>
          </form>
        )}
      </div>

      <ConfirmModal
        show={confirmAction !== null}
        title={
          confirmAction?.type === 'promote' ? 'Promote to Owner' :
          confirmAction?.type === 'demote' ? 'Demote to Admin' :
          'Remove Admin'
        }
        message={
          confirmAction?.type === 'promote'
            ? `Are you sure you want to promote ${confirmAction.actorName} to owner? Owners have full control over the community.`
            : confirmAction?.type === 'demote'
            ? `Are you sure you want to demote ${confirmAction?.actorName} to admin?`
            : `Are you sure you want to remove ${confirmAction?.actorName} as an admin?`
        }
        confirmText={
          confirmAction?.type === 'promote' ? 'Promote' :
          confirmAction?.type === 'demote' ? 'Demote' :
          'Remove'
        }
        confirmVariant={
          confirmAction?.type === 'promote' ? 'warning' :
          confirmAction?.type === 'demote' ? 'secondary' :
          'danger'
        }
        onConfirm={handleConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
