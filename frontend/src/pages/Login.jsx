import { useState, useContext, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api';
import EyeIcon from '../components/EyeIcon';
import './auth.css';

export default function Login() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();

    // Read DOM values directly to capture autofill that didn't fire onChange
    const resolvedEmail = email || emailRef.current?.value || '';
    const resolvedPassword = password || passwordRef.current?.value || '';

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

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email: resolvedEmail, password: resolvedPassword });
      login(res.data.access_token, res.data.username, remember);
      navigate(from, { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (!err.response) {
        setError('Could not connect to server. Make sure the backend is running.');
      } else if (err.response.status === 403) {
        setError('Email not verified. Check your inbox or resend the code below.');
      } else {
        setError(detail || 'Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p className="auth-subtitle">Sign in to your ChessOpeningAnalyzer account</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
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
              autoFocus
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
                autoComplete="current-password"
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
          </div>
          <div className="auth-remember">
            <label>
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
              />
              Remember me
            </label>
          </div>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>
        <div className="auth-footer" style={{ marginTop: '0.5rem' }}>
          Need to verify your email?{' '}
          <Link to="/verify-email">Enter code</Link>
        </div>
      </div>
    </div>
  );
}
