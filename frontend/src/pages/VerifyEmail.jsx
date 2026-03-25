import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../api';
import './auth.css';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/verify-email', { email: email.toLowerCase(), code });
      navigate('/login', { state: { verified: true } });
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired code. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/auth/resend-verification', { email: email.toLowerCase() });
      setSuccess('A new code has been sent to your email.');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Could not resend. Please wait and try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Verify your email</h1>

        {!location.state?.email && (
          <div className="auth-field" style={{ marginBottom: '1.25rem' }}>
            <label>Email address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
        )}

        {location.state?.email && (
          <p className="auth-email-hint">
            We sent a 6-digit code to <strong>{email}</strong>.<br />
            Enter it below to activate your account.
          </p>
        )}

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Verification Code</label>
            <input
              className="code-input"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoFocus
            />
          </div>
          <button className="auth-submit" type="submit" disabled={loading || code.length < 6}>
            {loading ? 'Verifying…' : 'Verify Email'}
          </button>
        </form>

        <div className="auth-divider" />

        <div className="auth-footer">
          Didn't receive a code?{' '}
          <button className="auth-link" onClick={handleResend} disabled={resending}>
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        </div>
        <div className="auth-footer" style={{ marginTop: '0.5rem' }}>
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
