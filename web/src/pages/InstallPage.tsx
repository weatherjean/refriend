import { PageHeader } from '../components/PageHeader';

export function InstallPage() {
  return (
    <div>
      <PageHeader title="Install Riff" icon="download" />

      <div className="install-page">
        <p className="install-intro">
          Riff works as a Progressive Web App (PWA). Install it on your device for
          the best experience — it works just like a native app, with home screen
          access and fullscreen mode.
        </p>

        <div className="card mb-3">
          <div className="card-body">
            <p className="landing-text mb-0">
              Native Android and iOS apps are on our roadmap, but core features and
              stability take priority right now. The PWA offers a great experience
              in the meantime.
            </p>
          </div>
        </div>

        {/* iOS Section */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">iPhone & iPad</h5>
            <ol className="install-steps mb-0">
              <li>Open <strong>riff.social</strong> in Safari</li>
              <li>Tap the <strong>Share</strong> button <i className="bi bi-box-arrow-up"></i> at the bottom of the screen</li>
              <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
              <li>Tap <strong>"Add"</strong> in the top right</li>
            </ol>
            <p className="install-note mt-3 mb-0">
              Note: PWA installation only works in Safari on iOS. Chrome and other browsers don't support it.
            </p>
          </div>
        </div>

        {/* Android Section */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Android</h5>
            <ol className="install-steps mb-0">
              <li>Open <strong>riff.social</strong> in Chrome</li>
              <li>Tap the <strong>menu</strong> button <i className="bi bi-three-dots-vertical"></i> in the top right</li>
              <li>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></li>
              <li>Tap <strong>"Install"</strong> to confirm</li>
            </ol>
            <p className="install-note mt-3 mb-0">
              Some Android browsers like Samsung Internet and Firefox also support PWA installation.
            </p>
          </div>
        </div>

        {/* Desktop Section */}
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="mb-3">Desktop (Chrome, Edge)</h5>
            <ol className="install-steps mb-0">
              <li>Open <strong>riff.social</strong> in Chrome or Edge</li>
              <li>Look for the <strong>install icon</strong> <i className="bi bi-plus-square"></i> in the address bar</li>
              <li>Click it and select <strong>"Install"</strong></li>
            </ol>
          </div>
        </div>

        {/* Why PWA */}
        <div className="card">
          <div className="card-body">
            <h5 className="mb-3">Why a PWA?</h5>
            <p className="landing-text mb-3">
              Progressive Web Apps give you the best of both worlds — the reach of a website
              with the experience of a native app.
            </p>
            <ul className="landing-list mb-0">
              <li>No app store required — install directly from your browser</li>
              <li>Always up to date — no manual updates needed</li>
              <li>Works offline — cached content available without internet</li>
              <li>Lightweight — takes up less storage than native apps</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
