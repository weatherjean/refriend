import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function TermsPage() {
  return (
    <div>
      <PageHeader title="Terms of Service" icon="file-text" />

      <div className="legal-page">
        <p className="legal-intro">
          By using Riff, you agree to these terms. Please read them carefully.
        </p>

        {/* Acceptance */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Acceptance of Terms</h5>
            <p className="legal-text mb-0">
              By accessing or using Riff, you agree to be bound by these Terms of Service and
              our <Link to="/policy" className="legal-link">Content Policy</Link> and{' '}
              <Link to="/privacy" className="legal-link">Privacy Policy</Link>. If you don't
              agree to these terms, please don't use the service.
            </p>
          </div>
        </div>

        {/* Eligibility */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Eligibility</h5>
            <p className="legal-text mb-0">
              You must be at least 16 years old to create an account on Riff. This is the minimum
              age for consent to data processing under GDPR. By creating an account, you confirm
              that you meet this age requirement.
            </p>
          </div>
        </div>

        {/* Your Account */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Your Account</h5>
            <ul className="legal-list mb-0">
              <li>You must provide accurate information when creating your account</li>
              <li>You are responsible for maintaining the security of your account and password</li>
              <li>You are responsible for all activity that occurs under your account</li>
              <li>One account per person. Creating multiple accounts to evade moderation or manipulate the platform is prohibited</li>
              <li>Notify us immediately if you suspect unauthorized access to your account</li>
            </ul>
          </div>
        </div>

        {/* Your Content */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Your Content</h5>
            <p className="legal-text mb-3">
              When you post content on Riff:
            </p>
            <ul className="legal-list mb-3">
              <li><strong>You retain ownership</strong> of your content. We don't claim any ownership rights</li>
              <li><strong>You grant us a license</strong> to host, display, and distribute your content on Riff and to federated servers via ActivityPub</li>
              <li><strong>You are responsible</strong> for your content and ensuring it doesn't violate our policies or applicable laws</li>
              <li><strong>You can delete</strong> your content at any time, though we cannot guarantee removal from federated servers</li>
            </ul>
            <p className="legal-text mb-0">
              Don't post content that you don't have the right to share.
            </p>
          </div>
        </div>

        {/* Copyright & DMCA */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Copyright & DMCA</h5>
            <p className="legal-text mb-3">
              We respect intellectual property rights and expect our users to do the same.
            </p>
            <p className="legal-text mb-3">
              <strong>If you believe your copyright has been infringed:</strong> Send a DMCA takedown
              notice to <a href="mailto:riff-social@pm.me" className="legal-link">riff-social@pm.me</a> with:
            </p>
            <ul className="legal-list mb-3">
              <li>Identification of the copyrighted work</li>
              <li>URL of the infringing content on Riff</li>
              <li>Your contact information</li>
              <li>A statement that you have a good faith belief the use is unauthorized</li>
              <li>A statement under penalty of perjury that the information is accurate and you are authorized to act on behalf of the copyright owner</li>
              <li>Your physical or electronic signature</li>
            </ul>
            <p className="legal-text mb-3">
              <strong>Counter-notification:</strong> If you believe content was removed in error, you may
              submit a counter-notification with your contact information, identification of the removed
              content, and a statement under penalty of perjury that you have a good faith belief the
              content was removed by mistake.
            </p>
            <p className="legal-text mb-0">
              <strong>Repeat infringers:</strong> We may terminate accounts of users who repeatedly infringe
              copyrights.
            </p>
          </div>
        </div>

        {/* AI Training */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">AI Training & Data Scraping</h5>
            <p className="legal-text mb-3">
              We do not sell or license user content for AI training, and we do not permit
              third parties to scrape content for that purpose.
            </p>
            <ul className="legal-list mb-3">
              <li>We block known AI training crawlers via robots.txt</li>
              <li>Scraping content for AI/ML training purposes is prohibited</li>
              <li>We do not sell or license user content to third parties for AI training</li>
            </ul>
            <p className="legal-text mb-0">
              <strong>Moderation exception:</strong> We may use AI tools to assist with content
              moderation, for example to help identify policy violations in reported content.
              This is limited to enforcing our Content Policy and is not used to train external models.
            </p>
          </div>
        </div>

        {/* Prohibited Conduct */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Prohibited Conduct</h5>
            <p className="legal-text mb-0">
              In addition to the content rules in our{' '}
              <Link to="/policy" className="legal-link">Content Policy</Link>, you agree not to:
            </p>
            <ul className="legal-list mb-0 mt-3">
              <li>Attempt to gain unauthorized access to the service or other users' accounts</li>
              <li>Use automated means to access the service without permission (scraping, bots, etc.)</li>
              <li>Scrape or collect user content for AI/ML model training</li>
              <li>Interfere with or disrupt the service or servers</li>
              <li>Circumvent any security measures or moderation actions</li>
            </ul>
          </div>
        </div>

        {/* Termination */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Termination</h5>
            <p className="legal-text mb-3">
              <strong>You can leave anytime:</strong> You may delete your account at any time through
              your account settings. All your data will be permanently deleted.
            </p>
            <p className="legal-text mb-0">
              <strong>We may terminate accounts:</strong> We reserve the right to suspend or
              terminate accounts that violate these terms or our Content Policy, at our discretion.
            </p>
          </div>
        </div>

        {/* Service Availability */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Service Availability</h5>
            <ul className="legal-list mb-0">
              <li>Riff is currently in beta. Features may change, break, or be removed</li>
              <li>We don't guarantee 100% uptime or availability</li>
              <li>We may modify, suspend, or discontinue features at any time</li>
              <li>We'll try to give notice before major changes, but can't always guarantee it</li>
            </ul>
          </div>
        </div>

        {/* Disclaimers */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Disclaimers</h5>
            <p className="legal-text mb-3">
              The service is provided "as is" and "as available" without warranties of any kind,
              either express or implied.
            </p>
            <p className="legal-text mb-0">
              We don't guarantee that the service will be error-free, secure, or uninterrupted.
              We're not responsible for content posted by users or federated from other servers.
            </p>
          </div>
        </div>

        {/* Limitation of Liability */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Limitation of Liability</h5>
            <p className="legal-text mb-0">
              To the maximum extent permitted by law, we are not liable for any indirect,
              incidental, special, consequential, or punitive damages resulting from your use
              of the service. This includes loss of data, profits, or business opportunities.
            </p>
          </div>
        </div>

        {/* Changes */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Changes to These Terms</h5>
            <p className="legal-text mb-0">
              We may update these terms from time to time. If we make significant changes,
              we'll notify users through the platform or via email. Continued use of Riff after
              changes constitutes acceptance of the updated terms.
            </p>
          </div>
        </div>

        {/* Contact */}
        <div className="card">
          <div className="card-body">
            <h5 className="mb-3">Contact</h5>
            <p className="legal-text mb-0">
              Questions about these terms? Contact us at{' '}
              <a href="mailto:riff-social@pm.me" className="legal-link">riff-social@pm.me</a>.
            </p>
          </div>
        </div>

        <p className="legal-last-updated">Last updated: January 25, 2026</p>
      </div>
    </div>
  );
}
