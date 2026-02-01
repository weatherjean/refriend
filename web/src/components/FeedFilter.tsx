import { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';

export type FeedFilterValue = 'all' | 'following' | 'communities';

interface FeedFilterProps {
  value: FeedFilterValue;
  onChange: (value: FeedFilterValue) => void;
}

const options: { key: FeedFilterValue; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'following', label: 'Following' },
  { key: 'communities', label: 'Communities' },
];

export function FeedFilter({ value, onChange }: FeedFilterProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3">
        <div className="btn-group btn-group-sm">
          {options.map(({ key, label }) => (
            <button
              key={key}
              className={`btn ${value === key ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => onChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="btn btn-sm btn-link text-muted p-0"
          onClick={() => setShowInfo(true)}
          title="What do these filters mean?"
        >
          <i className="bi bi-info-circle"></i>
        </button>
      </div>

      <Modal show={showInfo} onHide={() => setShowInfo(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Feed Filters</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p><strong>All</strong> — Everything from people and communities you follow</p>
          <p><strong>Following</strong> — Posts from people you follow and their boosts (excludes community boosts)</p>
          <p className="mb-0"><strong>Communities</strong> — Only posts boosted by communities you follow</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowInfo(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
