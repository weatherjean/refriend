import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { auth } from '../api';

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError('Invalid reset link');
      setValidating(false);
      return;
    }

    auth.validateResetToken(token)
      .then(() => {
        setTokenValid(true);
      })
      .catch(() => {
        setError('This reset link is invalid or has expired.');
      })
      .finally(() => {
        setValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!token) {
      setError('Invalid reset link');
      return;
    }

    setLoading(true);

    try {
      await auth.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="mx-auto text-center" style={{ maxWidth: 400 }}>
        <div className="spinner-border text-primary mb-3"></div>
        <p className="text-muted">Validating reset link...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto" style={{ maxWidth: 400 }}>
        <h3 className="mb-4">Password updated</h3>

        <div className="alert alert-success">
          Your password has been successfully reset.
        </div>

        <button
          className="btn btn-primary w-100"
          onClick={() => navigate('/login')}
        >
          Login with new password
        </button>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="mx-auto" style={{ maxWidth: 400 }}>
        <h3 className="mb-4">Reset password</h3>

        <div className="alert alert-danger">
          {error || 'This reset link is invalid or has expired.'}
        </div>

        <p className="text-muted">
          Reset links expire after 1 hour. You can request a new one.
        </p>

        <Link to="/forgot-password" className="btn btn-primary w-100">
          Request new reset link
        </Link>

        <p className="text-center mt-3">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 400 }}>
      <h3 className="mb-4">Set new password</h3>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">New Password</label>
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoFocus
          />
          <div className="form-text">Minimum 8 characters</div>
        </div>

        <div className="mb-3">
          <label className="form-label">Confirm Password</label>
          <input
            type="password"
            className="form-control"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn btn-primary w-100" disabled={loading}>
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>

      <p className="text-center mt-3">
        <Link to="/login">Back to login</Link>
      </p>
    </div>
  );
}
