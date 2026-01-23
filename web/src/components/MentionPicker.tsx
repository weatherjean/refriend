import { useState, useEffect, useRef } from 'react';
import { search, Actor } from '../api';
import { getUsername } from '../utils';
import { Avatar } from './Avatar';

interface MentionPickerProps {
  query: string; // The text after @
  onSelect: (actor: Actor) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export function MentionPicker({ query, onSelect, onClose, position }: MentionPickerProps) {
  const [results, setResults] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query || query.length < 1) {
      setResults([]);
      return;
    }

    const searchUsers = async () => {
      setLoading(true);
      try {
        const { users } = await search.query(query, 'users', true); // handleOnly=true
        setResults(users.slice(0, 5)); // Limit to 5 results
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchUsers, 150);
    return () => clearTimeout(debounce);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + results.length) % results.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onSelect(results[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex, onSelect, onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (!query || (results.length === 0 && !loading)) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="mention-picker position-absolute bg-body border rounded shadow-sm"
      style={{
        top: position.top,
        left: position.left,
        minWidth: 200,
        maxWidth: 300,
        zIndex: 1050,
      }}
    >
      {loading ? (
        <div className="p-2 text-muted small">Searching...</div>
      ) : results.length === 0 ? (
        <div className="p-2 text-muted small">No users found</div>
      ) : (
        <div className="list-group list-group-flush">
          {results.map((actor, index) => {
            const username = getUsername(actor.handle);
            const displayHandle = actor.is_local ? `@${username}` : actor.handle;
            return (
              <button
                key={actor.id}
                type="button"
                className={`list-group-item list-group-item-action d-flex align-items-center py-2 ${index === selectedIndex ? 'active' : ''}`}
                onClick={() => onSelect(actor)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <Avatar src={actor.avatar_url} name={username} size="xs" className="me-2" />
                <div className="text-truncate flex-grow-1" style={{ minWidth: 0 }}>
                  <div className={`small fw-semibold ${index === selectedIndex ? 'text-white' : ''}`}>
                    {actor.name || username}
                  </div>
                  <div className={`small text-truncate ${index === selectedIndex ? 'text-white-50' : 'text-muted'}`}>
                    {displayHandle}
                    {!actor.is_local && <i className="bi bi-globe2 ms-1" style={{ fontSize: '0.7em' }}></i>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
