import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { feeds as feedsApi, FeedBookmark } from '../api';
import { useAuth } from '../context/AuthContext';

export type FeedFilterValue = 'all' | 'hot' | 'tags' | `feed:${string}`;

interface FeedFilterProps {
  value: FeedFilterValue;
  onChange: (value: FeedFilterValue) => void;
  onFeedName?: (name: string | null) => void;
}

const staticOptions: { key: FeedFilterValue; label: string }[] = [
  { key: 'all', label: 'Following' },
  { key: 'hot', label: 'Hot' },
  { key: 'tags', label: 'Tags' },
];

const scrollbarStyles = `
.feed-filter-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--bs-border-color) transparent;
}
.feed-filter-scroll::-webkit-scrollbar {
  height: 4px;
}
.feed-filter-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.feed-filter-scroll::-webkit-scrollbar-thumb {
  background: var(--bs-border-color);
  border-radius: 4px;
}
.feed-filter-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--bs-secondary-color);
}
`;

export function FeedFilter({ value, onChange, onFeedName }: FeedFilterProps) {
  const { user } = useAuth();
  const [bookmarkedFeeds, setBookmarkedFeeds] = useState<FeedBookmark[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let ignore = false;
    feedsApi.getBookmarks()
      .then(({ feeds }) => { if (!ignore) setBookmarkedFeeds(feeds); })
      .catch(() => {});
    return () => { ignore = true; };
  }, [user]);

  useEffect(() => {
    if (!onFeedName) return;
    if (value.startsWith('feed:')) {
      const slug = value.slice(5);
      const feed = bookmarkedFeeds.find(f => f.slug === slug);
      onFeedName(feed?.name ?? slug);
    } else {
      onFeedName(null);
    }
  }, [value, bookmarkedFeeds, onFeedName]);

  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollIndicators();
    el.addEventListener('scroll', updateScrollIndicators, { passive: true });
    const observer = new ResizeObserver(updateScrollIndicators);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollIndicators);
      observer.disconnect();
    };
  }, [updateScrollIndicators, bookmarkedFeeds]);

  const orderedFeeds = useMemo(() => {
    if (!value.startsWith('feed:')) return bookmarkedFeeds;
    const slug = value.slice(5);
    const idx = bookmarkedFeeds.findIndex(f => f.slug === slug);
    if (idx <= 0) return bookmarkedFeeds;
    const reordered = [...bookmarkedFeeds];
    const [selected] = reordered.splice(idx, 1);
    reordered.unshift(selected);
    return reordered;
  }, [bookmarkedFeeds, value]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
  };

  return (
    <>
      <style>{scrollbarStyles}</style>
      <div className="d-flex align-items-center gap-0 mb-3" style={{ marginTop: 10 }}>
        {canScrollLeft && (
          <button
            className="btn btn-sm btn-link text-muted p-0 flex-shrink-0"
            onClick={() => scroll('left')}
            style={{ width: 20 }}
          >
            <i className="bi bi-chevron-left"></i>
          </button>
        )}
        <div
          ref={scrollRef}
          className="d-flex align-items-start gap-2 flex-grow-1 feed-filter-scroll"
          style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}
        >
          <div className="btn-group btn-group-sm flex-shrink-0">
            {staticOptions.map(({ key, label }) => (
              <button
                key={key}
                className={`btn ${value === key ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => onChange(key)}
              >
                {label}
              </button>
            ))}
            {orderedFeeds.map((feed) => (
              <button
                key={feed.slug}
                className={`btn ${value === `feed:${feed.slug}` ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => onChange(`feed:${feed.slug}`)}
                title={feed.name}
              >
                {feed.name.length > 12 ? feed.name.slice(0, 12) + '...' : feed.name}
              </button>
            ))}
            <Link
              to="/feeds"
              className="btn btn-outline-secondary"
              title="Explore feeds"
            >
              <i className="bi bi-plus-circle"></i>
            </Link>
          </div>
        </div>
        {canScrollRight && (
          <button
            className="btn btn-sm btn-link text-muted p-0 flex-shrink-0"
            onClick={() => scroll('right')}
            style={{ width: 20 }}
          >
            <i className="bi bi-chevron-right"></i>
          </button>
        )}
      </div>

    </>
  );
}
