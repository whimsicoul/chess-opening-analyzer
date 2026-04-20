import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import EyeIcon from '../components/EyeIcon';
import './auth.css';

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const usernameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();

    // Read DOM values directly to capture autofill that didn't fire onChange
    const resolvedUsername = username || usernameRef.current?.value || '';
    const resolvedEmail = email || emailRef.current?.value || '';
    const resolvedPassword = password || passwordRef.current?.value || '';
    const resolvedConfirm = confirm || confirmRef.current?.value || '';

    if (!resolvedUsername) {
      setError('Please type your username — autofill may not have been detected.');
      usernameRef.current?.focus();
      return;
    }
    if (!resolvedEmail) {
      setError('Please type your email address — autofill may not have been detected.');
      emailRef.current?.focus();
      return;
    }
    if (!resolvedPassword) {
      setError('Please type your password — autofill may not have been detected.');
      passwordRef.current?.focus();
      return;
    }
    if (resolvedPassword !== resolvedConfirm) {
      setError('Passwords do not match.');
      return;
    }
    if (resolvedPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.post('/auth/register', {
        username: resolvedUsername,
        email: resolvedEmail,
        password: resolvedPassword,
      });
      navigate('/verify-email', { state: { email: resolvedEmail } });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create account</h1>
        <p className="auth-subtitle">Start tracking your opening preparation</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Username</label>
            <input
              ref={usernameRef}
              name="username"
              type="text"
              placeholder="e.g. chesswiz99"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              required
              autoFocus
              minLength={3}
              maxLength={20}
              autoComplete="username"
            />
          </div>
          <div className="auth-field">
            <label>Email</label>
            <input
              ref={emailRef}
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              required
              autoComplete="email"
            />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <div className="password-wrapper">
              <input
                ref={passwordRef}
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            <p className="auth-hint">Minimum 8 characters</p>
          </div>
          <div className="auth-field">
            <label>Confirm Password</label>
            <div className="password-wrapper">
              <input
                ref={confirmRef}
                name="confirm"
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setError(''); }}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirm(v => !v)}
                tabIndex={-1}
              >
                <EyeIcon open={showConfirm} />
              </button>
            </div>
          </div>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
