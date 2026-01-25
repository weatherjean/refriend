import { PageHeader } from '../components/PageHeader';

export function PrivacyPolicyPage() {
  return (
    <div>
      <PageHeader title="Privacy Policy" icon="shield-lock" />

      <div className="legal-page">
        <p className="legal-intro">
          This privacy policy explains what data we collect, how we use it, and your rights
          regarding your personal information. We're committed to transparency and protecting your privacy.
        </p>

        {/* Who We Are */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Who We Are</h5>
            <p className="legal-text mb-3">
              Riff is a social platform that's part of the fediverse, a network of interconnected
              servers using the ActivityPub protocol. Our servers are hosted in Europe.
            </p>
            <p className="legal-text mb-0">
              Contact: <a href="mailto:contact@riff-social.com" className="legal-link">contact@riff-social.com</a>
            </p>
          </div>
        </div>

        {/* What We Collect */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">What We Collect</h5>

            <div className="legal-subsection">
              <h6>Account Data</h6>
              <ul className="legal-list">
                <li>Email address (for login and account recovery)</li>
                <li>Username</li>
                <li>Password (stored as a secure hash, never in plain text)</li>
              </ul>
            </div>

            <div className="legal-subsection">
              <h6>Profile Data</h6>
              <ul className="legal-list">
                <li>Display name</li>
                <li>Bio/description</li>
                <li>Avatar and header images</li>
              </ul>
            </div>

            <div className="legal-subsection">
              <h6>Content You Create</h6>
              <ul className="legal-list">
                <li>Posts, replies, and other content</li>
                <li>Images and media you upload</li>
                <li>Likes, boosts, and bookmarks</li>
                <li>Follows and follow requests</li>
              </ul>
            </div>

            <div className="legal-subsection mb-0">
              <h6>Technical Data</h6>
              <ul className="legal-list mb-0">
                <li>IP address (for security, rate limiting, and abuse prevention)</li>
                <li>Browser type and version (for compatibility)</li>
                <li>Login timestamps</li>
              </ul>
            </div>
          </div>
        </div>

        {/* What We Don't Collect */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">What We Don't Collect</h5>
            <ul className="legal-list mb-0">
              <li><i className="bi bi-x-lg text-success me-2"></i>No third-party analytics or tracking</li>
              <li><i className="bi bi-x-lg text-success me-2"></i>No tracking pixels or beacons</li>
              <li><i className="bi bi-x-lg text-success me-2"></i>No advertising profiles</li>
              <li><i className="bi bi-x-lg text-success me-2"></i>We never sell your data to anyone</li>
            </ul>
          </div>
        </div>

        {/* Cookies */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Cookies</h5>

            <div className="legal-subsection">
              <h6>Essential Cookies (First-Party)</h6>
              <p className="legal-text mb-0">
                We use a single session cookie to keep you logged in. This is essential for the
                service to function and cannot be disabled while using an account.
              </p>
            </div>

            <div className="legal-subsection mb-0">
              <h6>Third-Party Embeds</h6>
              <p className="legal-text mb-0">
                When posts contain embedded videos from YouTube, TikTok, PeerTube, or similar platforms,
                those services may set their own cookies when you play the video. We have no control
                over these third-party cookies. If you're concerned about this, avoid playing embedded
                videos or use browser extensions that block third-party cookies.
              </p>
            </div>
          </div>
        </div>

        {/* Federation */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Federation & Data Sharing</h5>
            <p className="legal-text mb-3">
              Riff is part of the fediverse. This means:
            </p>
            <ul className="legal-list mb-3">
              <li><strong>Public posts</strong> are shared with other fediverse servers that your followers are on</li>
              <li><strong>Your profile</strong> (name, bio, avatar) is visible to other servers</li>
              <li><strong>Follows and interactions</strong> are communicated to the relevant servers</li>
            </ul>
            <p className="legal-text mb-0">
              <strong>Important:</strong> Once your content is federated to other servers, we cannot
              control or delete it on those servers. Each server has its own data retention policies.
              Deleting content on Riff sends a deletion request to other servers, but we cannot
              guarantee they will honor it.
            </p>
          </div>
        </div>

        {/* Data Retention */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Data Retention</h5>
            <ul className="legal-list mb-3">
              <li><strong>Account data:</strong> Kept while your account is active</li>
              <li><strong>Your content:</strong> Kept until you delete it or delete your account</li>
              <li><strong>Server logs:</strong> IP addresses and access logs are kept for 14 days</li>
            </ul>
            <p className="legal-text mb-0">
              When you delete your account, all your data is permanently deleted from our servers
              (nuclear delete). This cannot be undone.
            </p>
          </div>
        </div>

        {/* Your Rights (GDPR) */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Your Rights (GDPR)</h5>
            <p className="legal-text mb-3">
              Under the General Data Protection Regulation, you have the following rights:
            </p>
            <ul className="legal-list mb-3">
              <li><strong>Right to access:</strong> You can request a copy of your personal data</li>
              <li><strong>Right to rectification:</strong> You can correct inaccurate personal data</li>
              <li><strong>Right to erasure:</strong> You can delete your account and all associated data</li>
              <li><strong>Right to object:</strong> You can object to certain processing of your data</li>
              <li><strong>Right to data portability:</strong> You can request your data in a machine-readable format</li>
            </ul>
            <p className="legal-text mb-0">
              You also have the right to lodge a complaint with a supervisory authority if you
              believe your rights have been violated.
            </p>
          </div>
        </div>

        {/* Contact */}
        <div className="card">
          <div className="card-body">
            <h5 className="mb-3">Contact</h5>
            <p className="legal-text mb-0">
              For privacy-related questions or to exercise your rights, contact us at{' '}
              <a href="mailto:contact@riff-social.com" className="legal-link">contact@riff-social.com</a>.
            </p>
          </div>
        </div>

        <p className="legal-last-updated">Last updated: January 25, 2026</p>
      </div>
    </div>
  );
}
