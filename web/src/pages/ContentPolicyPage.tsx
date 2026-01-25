import { PageHeader } from '../components/PageHeader';

export function ContentPolicyPage() {
  return (
    <div>
      <PageHeader title="Content Policy" icon="shield-check" />

      <div className="legal-page">
        <p className="legal-intro">
          Riff is built on principles of free expression balanced with responsible moderation.
          We believe in fostering open discussion while maintaining a safe environment for all users.
        </p>

        {/* Our Approach */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Our Approach</h5>
            <p className="legal-text mb-3">
              We take a balanced approach to content moderation. We don't aim to police every opinion
              or controversial viewpoint, but we do have clear limits on content that causes harm.
            </p>
            <p className="legal-text mb-0">
              Our moderation principles are inspired by the{' '}
              <a href="https://joinmastodon.org/covenant" target="_blank" rel="noopener noreferrer" className="legal-link">
                Mastodon Server Covenant
              </a>{' '}
              and fediverse best practices.
            </p>
          </div>
        </div>

        {/* Prohibited Content */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Prohibited Content</h5>
            <p className="legal-text mb-3">The following content is not allowed on Riff:</p>

            <div className="legal-subsection">
              <h6><i className="bi bi-x-circle text-danger me-2"></i>Illegal Content</h6>
              <ul className="legal-list">
                <li>Child sexual abuse material (CSAM)</li>
                <li>Content that incites terrorism or violence</li>
                <li>Content that violates applicable laws</li>
              </ul>
            </div>

            <div className="legal-subsection">
              <h6><i className="bi bi-x-circle text-danger me-2"></i>Pornography</h6>
              <ul className="legal-list">
                <li>Sexually explicit content and pornography</li>
                <li>This includes AI-generated sexual content</li>
              </ul>
            </div>

            <div className="legal-subsection">
              <h6><i className="bi bi-x-circle text-danger me-2"></i>Harassment & Abuse</h6>
              <ul className="legal-list">
                <li>Targeted harassment, threats, or bullying</li>
                <li>Doxxing (sharing private information without consent)</li>
                <li>Encouraging self-harm or suicide</li>
              </ul>
            </div>

            <div className="legal-subsection">
              <h6><i className="bi bi-x-circle text-danger me-2"></i>Hate Speech</h6>
              <ul className="legal-list">
                <li>Racism and ethnic discrimination</li>
                <li>Sexism and misogyny</li>
                <li>Homophobia and transphobia</li>
                <li>Religious discrimination</li>
                <li>Ableism</li>
              </ul>
            </div>

            <div className="legal-subsection">
              <h6><i className="bi bi-x-circle text-danger me-2"></i>Spam & Manipulation</h6>
              <ul className="legal-list">
                <li>Spam, scams, and phishing</li>
                <li>Coordinated inauthentic behavior</li>
                <li>Bot networks designed to manipulate discourse</li>
              </ul>
            </div>

            <div className="legal-subsection mb-0">
              <h6><i className="bi bi-x-circle text-danger me-2"></i>Impersonation & Misinformation</h6>
              <ul className="legal-list mb-0">
                <li>Impersonating real people or organizations</li>
                <li>Deliberate spread of dangerous misinformation (e.g., medical misinformation that could cause harm)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Community Rules */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Community Rules</h5>
            <p className="legal-text mb-0">
              Individual communities on Riff may set their own additional rules that are stricter
              than these server-wide policies. Community moderators can enforce their own standards
              within their spaces, as long as they don't permit content that violates this policy.
            </p>
          </div>
        </div>

        {/* Enforcement */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Enforcement</h5>
            <p className="legal-text mb-3">
              When we identify policy violations, we may take the following actions:
            </p>
            <ul className="legal-list mb-0">
              <li><strong>Content removal:</strong> Individual posts or media that violate our policies will be removed</li>
              <li><strong>Account warning:</strong> A formal notice that you've violated our policies</li>
              <li><strong>Temporary suspension:</strong> Your account may be temporarily disabled</li>
              <li><strong>Permanent suspension:</strong> Severe or repeated violations may result in permanent account termination</li>
            </ul>
          </div>
        </div>

        {/* Reporting */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Reporting Violations</h5>
            <p className="legal-text mb-3">
              If you see content that violates this policy, please report it:
            </p>
            <ul className="legal-list mb-0">
              <li>Use the <strong>Report</strong> option in the post menu (three dots)</li>
              <li>Select the reason that best describes the violation</li>
              <li>Add any additional context that might help us investigate</li>
            </ul>
          </div>
        </div>

        {/* Appeals */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Appeals</h5>
            <p className="legal-text mb-0">
              If you believe a moderation decision was made in error, you can appeal by contacting us
              at <a href="mailto:contact@riff-social.com" className="legal-link">contact@riff-social.com</a>.
              Please include your username and explain why you believe the decision should be reconsidered.
              We review all appeals and will respond within a reasonable timeframe.
            </p>
          </div>
        </div>

        {/* Contact */}
        <div className="card">
          <div className="card-body">
            <h5 className="mb-3">Questions?</h5>
            <p className="legal-text mb-0">
              If you have questions about this policy, contact us at{' '}
              <a href="mailto:contact@riff-social.com" className="legal-link">contact@riff-social.com</a>.
            </p>
          </div>
        </div>

        <p className="legal-last-updated">Last updated: January 25, 2026</p>
      </div>
    </div>
  );
}
