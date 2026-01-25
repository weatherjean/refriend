import { useState, useEffect } from 'react';
import { communities, search, type Actor } from '../../api';
import { ConfirmModal } from '../ConfirmModal';
import { Avatar } from '../Avatar';

interface Ban {
  id: number;
  actor: { id: string; handle: string; name: string | null; avatar_url: string | null };
  reason: string | null;
  created_at: string;
}

export function BanManagement({ communityName }: { communityName: string }) {
  const [bans, setBans] = useState<Ban[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [showBanModal, setShowBanModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Actor[]>([]);
  const [searching, setSearching] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Actor | null>(null);
  const [confirmUnban, setConfirmUnban] = useState<{ actorId: string; actorName: string } | null>(null);

  useEffect(() => {
    loadBans();
  }, [communityName]);

  // Search when query changes (min 3 chars)
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { users } = await search.query(searchQuery, 'users');
        // Filter out already banned users
        const bannedIds = new Set(bans.map(b => b.actor.id));
        setSearchResults(users.filter((u) => !bannedIds.has(u.id)));
      } catch {
        // Error handled by global toast
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, bans]);

  const loadBans = async () => {
    try {
      const { bans: b, total_count, next_cursor } = await communities.getBans(communityName);
      setBans(b);
      setTotalCount(total_count);
      setNextCursor(next_cursor);
    } catch {
      // Error handled by global toast
    } finally {
      setLoading(false);
    }
  };

  const loadMoreBans = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { bans: b, next_cursor } = await communities.getBans(communityName, { before: nextCursor });
      setBans(prev => [...prev, ...b]);
      setNextCursor(next_cursor);
    } catch {
      // Error handled by global toast
    } finally {
      setLoadingMore(false);
    }
  };

  const handleBan = async () => {
    if (!selectedUser) return;
    setBanning(true);
    try {
      await communities.ban(communityName, selectedUser.id, banReason || undefined);
      await loadBans();
      closeBanModal();
    } catch {
      // Error handled by global toast
    } finally {
      setBanning(false);
    }
  };

  const handleUnban = async (actorId: string) => {
    try {
      await communities.unban(communityName, actorId);
      setBans(prev => prev.filter(b => b.actor.id !== actorId));
      setTotalCount(prev => prev - 1);
    } catch {
      // Error handled by global toast
    }
    setConfirmUnban(null);
  };

  const closeBanModal = () => {
    setShowBanModal(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedUser(null);
    setBanReason('');
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
      <div className="card-header d-flex justify-content-between align-items-center">
        <h6 className="mb-0">
          Banned Users
          {totalCount > 0 && <span className="badge bg-danger ms-2">{totalCount}</span>}
        </h6>
        <button
          className="btn btn-outline-danger btn-sm"
          onClick={() => setShowBanModal(true)}
        >
          <i className="bi bi-person-x me-1"></i>Ban User
        </button>
      </div>
      <div className="card-body">
        {bans.length === 0 ? (
          <p className="text-muted small mb-0">No banned users</p>
        ) : (
          <>
            <div className="list-group">
              {bans.map((ban) => (
                <div key={ban.id} className="list-group-item d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center">
                    <Avatar
                      src={ban.actor.avatar_url}
                      name={ban.actor.name || ban.actor.handle}
                      size="sm"
                      className="me-2"
                    />
                    <div>
                      <div className="fw-semibold">{ban.actor.name || ban.actor.handle}</div>
                      <small className="text-muted">{ban.actor.handle}</small>
                      {ban.reason && <small className="text-danger d-block">Reason: {ban.reason}</small>}
                    </div>
                  </div>
                  <button
                    className="btn btn-outline-success btn-sm"
                    onClick={() => setConfirmUnban({
                      actorId: ban.actor.id,
                      actorName: ban.actor.name || ban.actor.handle,
                    })}
                    title="Unban"
                  >
                    <i className="bi bi-person-check"></i>
                  </button>
                </div>
              ))}
            </div>
            {nextCursor && (
              <div className="text-center mt-3">
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={loadMoreBans}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <span className="spinner-border spinner-border-sm"></span>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Ban User Modal */}
      {showBanModal && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Ban User</h5>
                <button type="button" className="btn-close" onClick={closeBanModal}></button>
              </div>
              <div className="modal-body">
                {!selectedUser ? (
                  <>
                    <div className="mb-3">
                      <label className="form-label">Search for user</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Type at least 3 characters..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    {searching && (
                      <div className="text-center py-3">
                        <div className="spinner-border spinner-border-sm text-primary"></div>
                      </div>
                    )}
                    {!searching && searchQuery.length >= 3 && searchResults.length === 0 && (
                      <p className="text-muted text-center py-3">No users found</p>
                    )}
                    {searchResults.length > 0 && (
                      <div className="list-group">
                        {searchResults.map((user) => (
                          <button
                            key={user.id}
                            className="list-group-item list-group-item-action d-flex align-items-center"
                            onClick={() => setSelectedUser(user)}
                          >
                            <Avatar
                              src={user.avatar_url}
                              name={user.name || user.handle}
                              size="sm"
                              className="me-2"
                            />
                            <div>
                              <div className="fw-semibold">{user.name || user.handle}</div>
                              <small className="text-muted">{user.handle}</small>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchQuery.length < 3 && searchQuery.length > 0 && (
                      <p className="text-muted small text-center">Type {3 - searchQuery.length} more character{3 - searchQuery.length !== 1 ? 's' : ''}...</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="d-flex align-items-center mb-3 p-2 bg-body-secondary rounded">
                      <Avatar
                        src={selectedUser.avatar_url}
                        name={selectedUser.name || selectedUser.handle}
                        size="md"
                        className="me-2"
                      />
                      <div className="flex-grow-1">
                        <div className="fw-semibold">{selectedUser.name || selectedUser.handle}</div>
                        <small className="text-muted">{selectedUser.handle}</small>
                      </div>
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setSelectedUser(null)}
                      >
                        Change
                      </button>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Reason (optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Why is this user being banned?"
                        value={banReason}
                        onChange={(e) => setBanReason(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeBanModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleBan}
                  disabled={!selectedUser || banning}
                >
                  {banning ? (
                    <span className="spinner-border spinner-border-sm"></span>
                  ) : (
                    <>
                      <i className="bi bi-person-x me-1"></i>Ban User
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unban Confirmation Modal */}
      <ConfirmModal
        show={confirmUnban !== null}
        title="Unban User"
        message={`Are you sure you want to unban ${confirmUnban?.actorName}? They will be able to join and post in the community again.`}
        confirmText="Unban"
        confirmVariant="primary"
        onConfirm={() => confirmUnban && handleUnban(confirmUnban.actorId)}
        onCancel={() => setConfirmUnban(null)}
      />
    </div>
  );
}
