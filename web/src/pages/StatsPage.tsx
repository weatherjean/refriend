import { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { stats as statsApi, ServerStats } from '../api';

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="d-flex justify-content-between py-1">
      <span className="text-muted">{label}</span>
      <span className="fw-semibold">{value}</span>
    </div>
  );
}

export function StatsPage() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    statsApi.get()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner className="py-4" />;
  if (!stats) return <div className="text-muted text-center py-4">Failed to load stats.</div>;

  return (
    <div>
      <PageHeader title="Server Stats" icon="graph-up" />

      <div className="row g-3">
        {/* Server Overview */}
        <div className="col-12 col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h6 className="card-title mb-3"><i className="bi bi-people me-2"></i>Server Overview</h6>
              <StatRow label="Total users" value={stats.server.total_users.toLocaleString()} />
              <StatRow label="Active (30 days)" value={stats.server.active_30d.toLocaleString()} />
              <StatRow label="Active (6 months)" value={stats.server.active_6mo.toLocaleString()} />
              <StatRow label="New this week" value={stats.server.new_this_week.toLocaleString()} />
              <StatRow label="New last week" value={stats.server.new_last_week.toLocaleString()} />
              <StatRow label="Server age" value={`${stats.server.server_age_days} days`} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="col-12 col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h6 className="card-title mb-3"><i className="bi bi-file-text me-2"></i>Content</h6>
              <StatRow label="Total posts" value={stats.content.total_posts.toLocaleString()} />
              <StatRow label="Posts today" value={stats.content.posts_today.toLocaleString()} />
              <StatRow label="Posts this week" value={stats.content.posts_this_week.toLocaleString()} />
              <StatRow label="Posts this month" value={stats.content.posts_this_month.toLocaleString()} />
              <StatRow label="Notes / Pages / Articles" value={`${stats.content.type_distribution.note} / ${stats.content.type_distribution.page} / ${stats.content.type_distribution.article}`} />
              <StatRow label="Posts with media" value={`${stats.content.media_percentage}%`} />
              <StatRow label="Hashtags" value={stats.content.hashtag_count.toLocaleString()} />
            </div>
          </div>
        </div>

        {/* Engagement */}
        <div className="col-12 col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h6 className="card-title mb-3"><i className="bi bi-heart me-2"></i>Engagement</h6>
              <StatRow label="Total likes" value={stats.engagement.total_likes.toLocaleString()} />
              <StatRow label="Total boosts" value={stats.engagement.total_boosts.toLocaleString()} />
              <StatRow label="Total replies" value={stats.engagement.total_replies.toLocaleString()} />
              <StatRow label="Avg likes/post" value={stats.engagement.avg_likes_per_post} />
              <StatRow label="Avg boosts/post" value={stats.engagement.avg_boosts_per_post} />
              <StatRow label="Avg replies/post" value={stats.engagement.avg_replies_per_post} />
            </div>
          </div>
        </div>

        {/* Social */}
        <div className="col-12 col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h6 className="card-title mb-3"><i className="bi bi-person-lines-fill me-2"></i>Social</h6>
              <StatRow label="Total follows" value={stats.social.total_follows.toLocaleString()} />
              <StatRow label="Avg followers/user" value={stats.social.avg_followers_per_user} />
              <StatRow label="Avg following/user" value={stats.social.avg_following_per_user} />
            </div>
          </div>
        </div>

        {/* Federation */}
        <div className="col-12 col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h6 className="card-title mb-3"><i className="bi bi-globe me-2"></i>Federation</h6>
              <StatRow label="Local actors" value={stats.federation.local_actors.toLocaleString()} />
              <StatRow label="Remote actors" value={stats.federation.remote_actors.toLocaleString()} />
              <StatRow label="Total actors" value={stats.federation.total_actors.toLocaleString()} />
            </div>
          </div>
        </div>

        {/* Growth */}
        <div className="col-12 col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <h6 className="card-title mb-3"><i className="bi bi-graph-up-arrow me-2"></i>Growth</h6>
              <StatRow label="Users this week" value={stats.growth.users_this_week.toLocaleString()} />
              <StatRow label="Users last week" value={stats.growth.users_last_week.toLocaleString()} />
              <StatRow label="Posts this week" value={stats.growth.posts_this_week.toLocaleString()} />
              <StatRow label="Posts last week" value={stats.growth.posts_last_week.toLocaleString()} />
            </div>
          </div>
        </div>
      </div>

      <p className="text-muted small text-center mt-3 mb-4">
        Cached at {new Date(stats.cached_at).toLocaleString()}
      </p>
    </div>
  );
}
