import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { feeds as feedsApi, Feed, FeedBookmark } from '../api';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';

type TabType = 'trending' | 'bookmarked' | 'moderation';
type TrendingPeriod = '48h' | 'alltime';

function FeedListItem({ feed }: { feed: Feed }) {
  return (
    <Link
      to={`/feeds/${feed.slug}`}
      className="list-group-item list-group-item-action"
    >
      <div className="d-flex justify-content-between align-items-start">
        <div style={{ minWidth: 0 }}>
          <div className="fw-semibold">{feed.name}</div>
          <small className="text-muted">/feeds/{feed.slug}</small>
          {feed.description && (
            <div className="text-muted small mt-1 text-truncate">{feed.description}</div>
          )}
        </div>
        {feed.bookmark_count !== undefined && (
          <span className="badge text-bg-secondary ms-2 flex-shrink-0">
            {feed.bookmark_count} <i className="bi bi-bookmark"></i>
          </span>
        )}
      </div>
    </Link>
  );
}

function TrendingTab() {
  const [period, setPeriod] = useState<TrendingPeriod>('48h');
  const [feeds, setFeeds] = useState<{ trending: Feed[]; popular: Feed[] }>({ trending: [], popular: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    feedsApi.discover()
      .then(({ trending, popular }) => setFeeds({ trending, popular }))
      .catch(() => setFeeds({ trending: [], popular: [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner size="sm" className="py-4" />;

  const displayFeeds = period === '48h' ? feeds.trending : feeds.popular;

  return (
    <>
      <div className="d-flex justify-content-end mb-3">
        <div className="btn-group btn-group-sm">
          <button
            className={`btn ${period === '48h' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setPeriod('48h')}
          >
            48h
          </button>
          <button
            className={`btn ${period === 'alltime' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setPeriod('alltime')}
          >
            All time
          </button>
        </div>
      </div>

      {displayFeeds.length === 0 ? (
        <EmptyState
          icon="collection"
          title={period === '48h' ? 'No trending feeds yet.' : 'No feeds yet.'}
          description="Create a feed to get started!"
        />
      ) : (
        <div className="list-group">
          {displayFeeds.map((feed) => (
            <FeedListItem key={feed.slug} feed={feed} />
          ))}
        </div>
      )}
    </>
  );
}

function BookmarkedTab() {
  const [feeds, setFeeds] = useState<FeedBookmark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    feedsApi.getBookmarks()
      .then(({ feeds }) => setFeeds(feeds))
      .catch(() => setFeeds([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner size="sm" className="py-4" />;

  if (feeds.length === 0) {
    return (
      <EmptyState
        icon="bookmark"
        title="No bookmarked feeds yet."
        description="Bookmark feeds from the Trending tab or from feed pages."
      />
    );
  }

  return (
    <div className="list-group">
      {feeds.map((feed) => (
        <Link
          key={feed.slug}
          to={`/feeds/${feed.slug}`}
          className="list-group-item list-group-item-action"
        >
          <div className="fw-semibold">{feed.name}</div>
          <small className="text-muted">/feeds/{feed.slug}</small>
        </Link>
      ))}
    </div>
  );
}

function ModerationTab() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    feedsApi.getModerated()
      .then(({ feeds }) => setFeeds(feeds))
      .catch(() => setFeeds([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner size="sm" className="py-4" />;

  if (feeds.length === 0) {
    return (
      <EmptyState
        icon="shield"
        title="No moderated feeds."
        description="Feeds you own or moderate will appear here."
      />
    );
  }

  return (
    <div className="list-group">
      {feeds.map((feed) => (
        <FeedListItem key={feed.slug} feed={feed} />
      ))}
    </div>
  );
}

export function FeedsExplorePage() {
  const { user, actor } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('trending');

  const tabItems: { key: TabType; label: string; show: boolean }[] = [
    { key: 'trending', label: 'Trending', show: true },
    { key: 'bookmarked', label: 'Bookmarked', show: !!actor },
    { key: 'moderation', label: 'Moderation', show: !!actor },
  ];

  return (
    <div>
      <PageHeader title="Feeds" icon="collection" subtitle="Discover curated feeds." />

      {user && (
        <Link to="/feeds/new" className="btn btn-primary btn-sm mb-3">
          <i className="bi bi-plus-lg me-1"></i> Create Feed
        </Link>
      )}

      <ul className="nav nav-tabs mb-3">
        {tabItems.filter(t => t.show).map(tab => (
          <li key={tab.key} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {activeTab === 'trending' && <TrendingTab />}
      {activeTab === 'bookmarked' && actor && <BookmarkedTab />}
      {activeTab === 'moderation' && actor && <ModerationTab />}
    </div>
  );
}
