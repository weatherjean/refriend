import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { posts as postsApi, tags as tagsApi, feeds as feedsApi, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { PageHeader } from '../components/PageHeader';
import { FeedFilter, FeedFilterValue } from '../components/FeedFilter';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { useAuth } from '../context/AuthContext';
import { usePagination } from '../hooks';

function LandingPage() {
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="landing-cards">
      {/* Hero Card */}
      <div className="card landing-card landing-hero">
        <div className="card-body text-center py-5">
          <img src="/logo.svg" alt="Riff" height="48" className="mb-3" />
          <p className="landing-tagline mb-4">
            Simple social. Openly connected.
          </p>
          <p className="landing-subtitle mb-4">
            A friendly entry point to the fediverse. Sign up once,
            connect with millions across the open social web.
          </p>
          <div className="d-flex gap-2 justify-content-center">
            <Link to="/register" className="btn btn-primary">
              <i className="bi bi-person-plus me-1"></i> Sign up
            </Link>
            <Link to="/login" className="btn btn-outline-secondary">
              Login
            </Link>
          </div>
        </div>
      </div>

      {/* Beta Card */}
      <div className="card landing-card">
        <div className="card-body">
          <h5 className="mb-3">Early Beta</h5>
          <p className="landing-text mb-3">
            Riff is in early development. You're among the first to try it out.
            Expect bugs, missing features, and frequent updates.
          </p>
          <ul className="landing-list mb-3">
            <li>Your feedback shapes the product</li>
            <li>New features ship weekly</li>
          </ul>
          <p className="landing-text mb-0">
            Share your thoughts by posting with the <Link to="/tags/feedbackriff" className="landing-link">#feedbackriff</Link> tag.
          </p>
        </div>
      </div>

      {/* Europe Card */}
      <div className="card landing-card">
        <div className="card-body">
          <h5 className="mb-3">Built in Europe</h5>
          <p className="landing-text mb-0">
            Riff is built and hosted in Europe. We believe access to social media is a right, not a privilege.
          </p>
        </div>
      </div>

      {/* Install Card */}
      <div className="card landing-card">
        <div className="card-body">
          <h5 className="mb-3">No App Yet</h5>
          <p className="landing-text mb-0">
            Riff doesn't have a mobile app yet, but you can install it as a Progressive
            Web App for a similar experience. <Link to="/install" className="landing-link">Learn how to install</Link>
          </p>
        </div>
      </div>

      {/* Learn More Toggle */}
      <button
        className="btn btn-link landing-learn-more"
        onClick={() => setShowMore(!showMore)}
      >
        {showMore ? 'Show less' : 'Learn more about Riff'}
        <i className={`bi bi-chevron-${showMore ? 'up' : 'down'} ms-2`}></i>
      </button>

      {/* Expanded Details */}
      {showMore && (
        <>
          {/* What is Riff Card */}
          <div className="card landing-card">
            <div className="card-body">
              <h5 className="mb-3">What is Riff?</h5>
              <p className="landing-text mb-3">
                Riff is a simple social platform connected to the open web.
                Post short updates, share images and links, and follow people
                across the fediverse.
              </p>
              <p className="landing-text mb-0">
                Everything you post can be seen by users on Mastodon, Threads, and
                other fediverse platforms, and you can follow and interact with
                them too.
              </p>
            </div>
          </div>

          {/* Roadmap Card */}
          <div className="card landing-card">
            <div className="card-body">
              <h5 className="mb-3">Roadmap</h5>
              <div className="landing-roadmap mb-0">
                <div className="roadmap-item">
                  <span className="roadmap-status roadmap-done"><i className="bi bi-check-circle-fill"></i></span>
                  <span>MVP built</span>
                </div>
                <div className="roadmap-item">
                  <span className="roadmap-status roadmap-progress"><i className="bi bi-circle-half"></i></span>
                  <span>Beta testing</span>
                </div>
                <div className="roadmap-item">
                  <span className="roadmap-status roadmap-planned"><i className="bi bi-circle"></i></span>
                  <span>Core feature bugfixes and improvements</span>
                </div>
                <div className="roadmap-item">
                  <span className="roadmap-status roadmap-planned"><i className="bi bi-circle"></i></span>
                  <span>Build out moderation flows and features</span>
                </div>
                <div className="roadmap-item">
                  <span className="roadmap-status roadmap-planned"><i className="bi bi-circle"></i></span>
                  <span>Mobile app</span>
                </div>
              </div>
            </div>
          </div>

          {/* Core Features Card */}
          <div className="card landing-card">
            <div className="card-body">
              <h5 className="mb-3">Core Features</h5>
              <ul className="landing-list mb-0">
                <li><strong>Posts:</strong> Share text, images, and links with your followers</li>
                <li><strong>Hashtags:</strong> Discover and follow topics with tag pages</li>
                <li><strong>Likes & Boosts:</strong> Engage with content and share it with your followers</li>
                <li><strong>Following:</strong> Build your own timeline by following people and communities</li>
                <li><strong>Federation:</strong> Connect with millions of users across the fediverse</li>
              </ul>
            </div>
          </div>

          {/* Moderation Card */}
          <div className="card landing-card">
            <div className="card-body">
              <h5 className="mb-3">Moderation</h5>
              <p className="landing-text mb-0">
                We recognise that strong moderation is essential for a healthy social platform.
                This is a challenge we'll tackle with priority as the platform grows.
              </p>
            </div>
          </div>

          {/* Organisation Card */}
          <div className="card landing-card">
            <div className="card-body">
              <h5 className="mb-3">Our Organisation</h5>
              <p className="landing-text mb-3">
                Our goal is to become a nonprofit organisation, similar to <a href="https://signalfoundation.org/" target="_blank" rel="noopener noreferrer" className="landing-link">Signal</a>.
                We aim to be completely apolitical. We're not here to push any agenda.
              </p>
              <p className="landing-text mb-3">
                The source code is currently closed, but we plan to make it publicly available
                in the future. If you ever want to leave, we offer a complete account deletion
                that removes all your data from our servers.
              </p>
              <p className="landing-text mb-0">
                For serious issues, contact us at <a href="mailto:riff-social@pm.me" className="landing-link">riff-social@pm.me</a>.
              </p>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilterValue>(() => {
    const saved = localStorage.getItem('home-feed-filter');
    if (saved === 'following' || saved === 'communities' || saved === 'tags') return saved;
    if (saved?.startsWith('feed:')) return saved as FeedFilterValue;
    return 'all';
  });
  const [activeFeedName, setActiveFeedName] = useState<string | null>(null);

  const handleFilterChange = useCallback((value: FeedFilterValue) => {
    setFeedFilter(value);
    localStorage.setItem('home-feed-filter', value);
  }, []);

  const handleFeedName = useCallback((name: string | null) => {
    setActiveFeedName(name);
  }, []);

  const fetchPosts = useCallback(async (cursor?: number) => {
    if (!user) {
      return { items: [], next_cursor: null };
    }
    if (feedFilter === 'tags') {
      const { posts, next_cursor } = await tagsApi.getBookmarkFeed({ before: cursor });
      return { items: posts, next_cursor };
    }
    if (feedFilter.startsWith('feed:')) {
      const slug = feedFilter.slice(5);
      try {
        const { posts, next_cursor } = await feedsApi.getPosts(slug, { before: cursor });
        return { items: posts, next_cursor };
      } catch {
        // Feed may no longer exist, fall back to all
        setFeedFilter('all');
        localStorage.setItem('home-feed-filter', 'all');
        const { posts, next_cursor } = await postsApi.getTimeline({ before: cursor });
        return { items: posts, next_cursor };
      }
    }
    const { posts, next_cursor } = await postsApi.getTimeline({ before: cursor, filter: feedFilter as 'all' | 'following' | 'communities' });
    return { items: posts, next_cursor };
  }, [user, feedFilter]);

  const {
    items: posts,
    loading,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
  } = usePagination<Post>({ fetchFn: fetchPosts, key: `${user?.id ?? 'guest'}-${feedFilter}` });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const headerInfo = useMemo(() => {
    if (feedFilter.startsWith('feed:')) {
      return {
        title: activeFeedName ?? 'Feed',
        icon: 'collection' as const,
        subtitle: 'A curated feed.',
        emptyIcon: 'collection',
        emptyTitle: 'No posts in this feed yet.',
        emptyDesc: 'Posts will appear here once moderators add them.',
      };
    }
    switch (feedFilter) {
      case 'following': return {
        title: 'People', icon: 'people' as const,
        subtitle: 'Posts from people you follow.',
        emptyIcon: 'people', emptyTitle: 'No posts yet.',
        emptyDesc: 'Follow some people to see their posts here.',
      };
      case 'communities': return {
        title: 'Communities', icon: 'people' as const,
        subtitle: 'Posts from communities you follow.',
        emptyIcon: 'people', emptyTitle: 'No community posts yet.',
        emptyDesc: 'Follow some communities to see posts here.',
      };
      case 'tags': return {
        title: 'Tags', icon: 'hash' as const,
        subtitle: 'Posts from your bookmarked hashtags.',
        emptyIcon: 'bookmark', emptyTitle: 'No posts from bookmarked tags yet.',
        emptyDesc: 'Bookmark some tags to see their posts here.',
      };
      default: return {
        title: 'Home', icon: 'house-fill' as const,
        subtitle: 'Latest posts from actors you follow.',
        emptyIcon: 'inbox', emptyTitle: 'No posts yet.',
        emptyDesc: 'Follow some users to see posts here.',
      };
    }
  }, [feedFilter, activeFeedName]);

  // Show landing page for non-logged-in users
  if (!user) {
    return <LandingPage />;
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PageHeader
        title={headerInfo.title}
        icon={headerInfo.icon}
        subtitle={headerInfo.subtitle}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
      <FeedFilter value={feedFilter} onChange={handleFilterChange} onFeedName={handleFeedName} />

      {posts.length === 0 ? (
        <EmptyState
          icon={headerInfo.emptyIcon}
          title={headerInfo.emptyTitle}
          description={headerInfo.emptyDesc}
        />
      ) : (
        <>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMore && (
            <LoadMoreButton loading={loadingMore} onClick={loadMore} />
          )}
        </>
      )}
    </div>
  );
}
