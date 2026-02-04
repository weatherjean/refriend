import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { follows, Actor } from '../api';
import { useAuth } from '../context/AuthContext';
import { usePagination } from '../hooks/usePagination';
import { PageHeader } from '../components/PageHeader';
import { TabContent } from '../components/TabContent';
import { ActorListItem } from '../components/ActorListItem';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { EmptyState } from '../components/EmptyState';

type Tab = 'communities' | 'people';

const PAGE_SIZE = 20;

export function FollowingPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('communities');

  const communitiesFetch = useCallback(async (cursor?: number) => {
    const offset = cursor ?? 0;
    const { actors, has_more } = await follows.getFollowingCommunities(PAGE_SIZE, offset);
    return {
      items: actors,
      next_cursor: has_more ? offset + PAGE_SIZE : null,
    };
  }, []);

  const peopleFetch = useCallback(async (cursor?: number) => {
    const offset = cursor ?? 0;
    const { actors, has_more } = await follows.getFollowingPeople(PAGE_SIZE, offset);
    return {
      items: actors,
      next_cursor: has_more ? offset + PAGE_SIZE : null,
    };
  }, []);

  const communities = usePagination<Actor>({ fetchFn: communitiesFetch, autoLoad: true });
  const people = usePagination<Actor>({ fetchFn: peopleFetch, autoLoad: true });

  if (!user) {
    return <EmptyState icon="lock" title="Log in to see who you follow" />;
  }

  const current = activeTab === 'communities' ? communities : people;

  return (
    <div>
      <PageHeader title="Following" icon="people-fill" />

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'communities' ? 'active' : ''}`}
            onClick={() => setActiveTab('communities')}
          >
            Communities
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'people' ? 'active' : ''}`}
            onClick={() => setActiveTab('people')}
          >
            People
          </button>
        </li>
      </ul>

      <TabContent
        loading={current.loading}
        empty={false}
      >
        {!current.loading && current.items.length === 0 ? (
          <div className="text-center text-muted py-5">
            <i className={`bi bi-${activeTab === 'communities' ? 'people' : 'person'} fs-1 mb-3 d-block`}></i>
            <p className="mb-1 fw-semibold">
              {activeTab === 'communities' ? 'Not following any communities yet' : 'Not following anyone yet'}
            </p>
            <p className="small mb-3" style={{ maxWidth: 360, margin: '0 auto' }}>
              {activeTab === 'communities'
                ? 'Communities are groups from across the fediverse. Follow them to see their posts in your home feed. Search for a topic or paste a link to a community from Lemmy, kbin, or other platforms.'
                : 'Follow people to see their posts in your home feed. You can follow anyone on this server or from other fediverse platforms like Mastodon. Search by name or paste their full handle (e.g. @user@example.com).'}
            </p>
            <Link to="/search" className="btn btn-primary btn-sm">
              <i className="bi bi-search me-1"></i>
              Find {activeTab === 'communities' ? 'communities' : 'people'} to follow
            </Link>
          </div>
        ) : (
          <>
            <div className="list-group">
              {current.items.map((actor) => (
                <ActorListItem key={actor.id} actor={actor} />
              ))}
            </div>
            {current.hasMore && (
              <LoadMoreButton loading={current.loadingMore} onClick={current.loadMore} />
            )}
          </>
        )}
      </TabContent>
    </div>
  );
}
