import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const COOKIE_CONSENT_KEY = 'riff-cookie-notice-dismissed';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!dismissed) {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner">
      <div className="cookie-banner-content">
        <span>
          We use essential cookies to keep you logged in.{' '}
          <Link to="/privacy" className="cookie-banner-link">Learn more</Link>
        </span>
        <button onClick={handleDismiss} className="cookie-banner-btn">
          Got it
        </button>
      </div>
    </div>
  );
}
