import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await auth.forgotPassword(email);
      setSuccess(true);
      setCountdown(60); // 60 second cooldown before allowing resend
    } catch (err) {
      if (err instanceof Error) {
        // Check for rate limiting error
        if (err.message.includes('wait')) {
          setError(err.message);
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to send reset email');
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleResend = async () => {
    if (countdown > 0) return;
    setError('');
    setLoading(true);

    try {
      await auth.forgotPassword(email);
      setCountdown(60);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send reset email');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto" style={{ maxWidth: 400 }}>
        <h3 className="mb-4">Check your email</h3>

        <div className="alert alert-success">
          <p className="mb-2">
            If an account exists with <strong>{email}</strong>, we've sent a password reset link.
          </p>
          <p className="mb-0 text-muted" style={{ fontSize: '0.9rem' }}>
            The link will expire in 1 hour.
          </p>
        </div>

        <p className="text-muted">
          Didn't receive the email? Check your spam folder or{' '}
          {countdown > 0 ? (
            <span className="text-muted">resend in {countdown}s</span>
          ) : (
            <button
              type="button"
              className="btn btn-link p-0"
              onClick={handleResend}
              disabled={loading}
            >
              {loading ? 'Sending...' : 'resend'}
            </button>
          )}
        </p>

        {error && (
          <div className="alert alert-danger">{error}</div>
        )}

        <p className="text-center mt-4">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 400 }}>
      <h3 className="mb-4">Forgot password</h3>

      <p className="text-muted mb-4">
        Enter your email address and we'll send you a link to reset your password.
      </p>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <button type="submit" className="btn btn-primary w-100" disabled={loading}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <p className="text-center mt-3">
        Remember your password? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
