import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function GuidePage() {
  return (
    <div>
      <PageHeader title="Guide to Riff" icon="book" />

      <div className="legal-page">
        <p className="text-muted small mb-2">3 min read</p>
        <p className="legal-intro">
          Riff is a social platform that's part of the fediverse, a network of servers
          that all talk to each other. This page covers the basics.
        </p>

        {/* Your Home Feed */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Your Home Feed</h5>
            <p className="legal-text mb-3">
              Your home feed shows posts from actors you follow, newest first.
              This includes both local Riff users and remote fediverse accounts.
            </p>
            <p className="legal-text mb-0">
              If your feed feels empty, follow more people. Check the <strong>Hot</strong> page
              for popular posts, or use <strong>Search</strong> to find actors and communities.
            </p>
          </div>
        </div>

        {/* Hot Page */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">The Hot Page</h5>
            <p className="legal-text mb-0">
              The Hot page shows popular posts from <em>all</em> actors on Riff, not just people you follow.
              Posts are ranked by recent likes, boosts, and replies. Posts need to be at least one hour old
              to show up here, and sensitive content is filtered out.
            </p>
          </div>
        </div>

        {/* How Search Works */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">How Search Works</h5>
            <p className="legal-text mb-3">
              You can search for:
            </p>
            <ul className="legal-list mb-3">
              <li><strong>Text:</strong> post content and actor names</li>
              <li><strong>Handles:</strong> type <code>@username@server.example</code> to find a specific remote actor</li>
              <li><strong>Hashtags:</strong> type <code>#topic</code> to browse tag pages</li>
            </ul>
            <div className="legal-subsection mb-0">
              <h6><i className="bi bi-globe me-2"></i>Finding Remote Communities</h6>
              <p className="legal-text mb-3">
                If there isn't enough content on Riff for you yet, following remote communities is the
                quickest fix. Communities from Lemmy and similar platforms post way more often than
                individual accounts, so even a handful will keep your feed active.
              </p>
              <p className="legal-text mb-3">
                The easiest way is the <strong>Search on Lemmy</strong> button on the search page.
                It opens a community browser where you can find topics you care about and follow
                them right from Riff.
              </p>
              <p className="legal-text mb-3">
                You can also paste a community's full handle
                (e.g. <code>@technology@lemmy.world</code>) into the search bar. Riff will look it
                up on the remote server so you can follow it.
              </p>
              <p className="legal-text mb-0">
                Pasting any fediverse profile URL into search works too, for finding people
                on Mastodon, Misskey, or other platforms.
              </p>
            </div>
          </div>
        </div>

        {/* How Content Populates */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">How Content Appears on Riff</h5>
            <p className="legal-text mb-3">
              Riff only receives posts from a remote actor after <strong>someone on Riff follows them</strong>.
              Before that, their posts just don't exist here. That's how federation works.
            </p>
            <p className="legal-text mb-3">
              In practice:
            </p>
            <ul className="legal-list mb-3">
              <li>If you're the first person on Riff to follow a remote actor, you'll see
                their <em>new</em> posts going forward, not their back catalogue</li>
              <li>Popular remote accounts that many Riff users follow will have more of their history available</li>
              <li>Posts from local Riff users are always available right away</li>
            </ul>
            <p className="legal-text mb-0">
              Every time someone on Riff follows a new remote account, it makes the platform
              better for everyone. Don't hesitate to follow things you find interesting.
            </p>
          </div>
        </div>

        {/* Posting to Communities */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Posting to Communities</h5>
            <p className="legal-text mb-3">
              You can submit your posts to Lemmy communities. It's a two-step process:
            </p>
            <ol className="legal-list mb-3">
              <li>Write and publish your post on Riff as normal</li>
              <li>On your post, click the paper plane icon to open the submit dialog</li>
              <li>Pick a community you follow, give the post a title, and submit</li>
            </ol>
            <p className="legal-text mb-3">
              The community's server will receive your post and it'll show up there for
              everyone in that community to see.
            </p>
            <p className="legal-text mb-0">
              <strong>Good to know:</strong> once a post is submitted to a community, you can't
              unsubmit it. If you need to undo it, you'd have to delete the post entirely
              and create a new one. Deleting will also notify the community to remove it
              on their end.
            </p>
          </div>
        </div>

        {/* Tips */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Tips</h5>
            <ul className="legal-list mb-0">
              <li>Use <strong>hashtags</strong> in your posts so others can find them</li>
              <li>Follow Lemmy communities to get a steady flow of topic-based content</li>
              <li>Check <strong>Hot</strong> to find new people to follow</li>
              <li><strong>Boost</strong> posts you like to share them with your followers</li>
              <li>There's no native app yet, but you can <Link to="/install">install Riff as a PWA</Link> for a similar experience</li>
            </ul>
          </div>
        </div>

        {/* Key Terms */}
        <div className="card">
          <div className="card-body">
            <h5 className="mb-3">Key Terms</h5>
            <dl className="mb-0">
              <dt>Actor</dt>
              <dd className="mb-2">
                Any account on the fediverse. Could be a person on Riff, a Mastodon user,
                a Lemmy community, etc. Actors have a handle like <code>@username@server.example</code>.
              </dd>
              <dt>Handle</dt>
              <dd className="mb-2">
                An actor's unique address. Local Riff users have short handles like <code>@alice</code>.
                Users on other servers have full handles like <code>@alice@mastodon.social</code>.
              </dd>
              <dt>Fediverse</dt>
              <dd className="mb-2">
                The network of servers (Mastodon, Lemmy, Misskey, Threads, and others) that all use
                the same protocol (ActivityPub). When you follow someone from another server, their posts
                show up in your home feed like normal.
              </dd>
              <dt>Boost</dt>
              <dd className="mb-2">
                Sharing someone's post with your followers. Like a retweet. Boosted posts show up
                in your followers' feeds with your name attached.
              </dd>
              <dt>Federation</dt>
              <dd className="mb-0">
                How servers exchange posts, follows, and interactions with each other.
                When you follow a remote actor, their server starts sending their posts to Riff.
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
